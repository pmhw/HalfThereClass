import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { syncTermTeacher } from './term-teacher';
import { buildPaginationResult, getPaginationParams } from '@/common/utils/pagination.util';
import { normalizeRejectFields, serializeRejectFields } from '@/common/cert-reject';
import { calculateFee, calculateCourseOrgFee, teacherFeeView, FeeQuote, roundMoney } from './fee';
import { FinanceService } from '@/modules/finance/finance.service';
import { assertMergeable, isPhoneOpenid, mergeUserInto } from '@/modules/user/account-merge';

const REIMBURSE_CATEGORIES = new Set(['transport', 'material', 'meal', 'office', 'other']);
const REIMBURSE_STATUS = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  reimbursed: 'reimbursed',
} as const;

@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => FinanceService)) private finance: FinanceService,
  ) {}

  async quote(userId: number, courseId: number, override: any = {}): Promise<FeeQuote & {
    organizationName: string | null;
    organizationId: number | null;
    schoolPrice: number | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { organization: true },
    });
    if (!user || !course) throw new NotFoundException('教师或课程不存在');
    const grant = await this.prisma.teacherCourseGrant.findUnique({ where: { userId_courseId: { userId, courseId } } });

    // 课程已承接机构：课时费 − 机构抽成 = 教师课时费；过程对教师隐藏，是否展示金额跟机构配置
    if (course.organizationId && course.organization?.status === 1) {
      const org = course.organization;
      const mode = override.mode !== undefined && override.mode !== null && override.mode !== ''
        ? override.mode
        : (course.orgCommissionMode || org.commissionMode || 'fixed');
      const value = override.value !== undefined && override.value !== null && override.value !== ''
        ? Number(override.value)
        : (course.orgCommissionValue != null ? Number(course.orgCommissionValue) : Number(org.commissionValue || 0));
      const quote = calculateCourseOrgFee({
        schoolPrice: course.price,
        sessionFee: course.sessionFee,
        mode,
        value,
      });
      const visibility = org.feeVisibility === 'hidden' ? 'hidden' : 'final';
      return {
        ...quote,
        visibility,
        organizationName: org.name,
        organizationId: org.id,
        schoolPrice: quote.schoolPrice ?? course.price,
      };
    }

    const org = user.organization;
    const hasOrg = !!org && org.status === 1;
    const base = this.pickNumber(override.baseFee, grant?.baseFee, course.sessionFee);
    // 老师未绑定机构：忽略 grant 上残留的抽成配置，机构费必须为 0
    const mode = hasOrg
      ? (override.mode !== undefined ? override.mode : (grant?.mode || org.commissionMode))
      : null;
    const value = hasOrg
      ? (override.value !== undefined ? override.value : (grant?.value ?? org.commissionValue))
      : null;
    // 机构配置不允许查看时，单门课的设置不能放开
    const visibility = !hasOrg
      ? 'final'
      : org.feeVisibility === 'hidden'
        ? 'hidden'
        : (override.visibility || grant?.visibility || 'final');
    const quote = calculateFee({
      base,
      hasOrg,
      mode,
      value,
      visibility,
      schoolPrice: course.price,
    });
    return {
      ...quote,
      organizationName: org?.name || null,
      organizationId: org?.id || null,
      schoolPrice: course.price,
    };
  }

  preview(data: any) {
    if (data.splitMode === 'course_org' || data.courseOrg) {
      return calculateCourseOrgFee({
        schoolPrice: data.schoolPrice === '' || data.schoolPrice == null ? null : Number(data.schoolPrice),
        sessionFee: data.sessionFee === '' || data.sessionFee == null ? null : Number(data.sessionFee),
        mode: data.mode,
        value: data.value,
      });
    }
    const hasOrg = !!data.hasOrg;
    return calculateFee({
      base: data.baseFee === '' || data.baseFee == null ? null : Number(data.baseFee),
      hasOrg,
      mode: hasOrg ? data.mode : null,
      value: hasOrg ? Number(data.value || 0) : null,
      visibility: data.visibility || 'final',
      schoolPrice: data.schoolPrice == null || data.schoolPrice === '' ? null : Number(data.schoolPrice),
    });
  }

  /** 同一课次已记过的老师（最早一条）；还没记过时用 fallback */
  async sessionTeacher(courseId: number, date: string, fallback: number | null) {
    const first = await this.prisma.sessionIncome.findFirst({
      where: { courseId, date },
      orderBy: { id: 'asc' },
      select: { userId: true },
    });
    return first?.userId || fallback || null;
  }

  /** 月份已固定或已打款的记录不能再动 */
  async fixedMonths(months: string[]) {
    if (!months.length) return new Set<string>();
    const rows = await this.prisma.monthlySettlement.findMany({
      where: { month: { in: [...new Set(months)] }, locked: true },
      select: { month: true },
    });
    return new Set(rows.map((row) => row.month));
  }

  /** 同一课次里其他老师的收入：可删的与已固定（锁月/已打款）的分开 */
  private async otherIncomes(courseId: number, date: string, userId: number) {
    const rows = await this.prisma.sessionIncome.findMany({
      where: { courseId, date, userId: { not: userId } },
      orderBy: { id: 'asc' },
      select: { id: true, status: true, profitRecord: { select: { settlementMonth: true, settlementStatus: true } } },
    });
    const monthOf = (row: (typeof rows)[number]) => row.profitRecord?.settlementMonth || date.slice(0, 7);
    const locked = await this.fixedMonths(rows.map(monthOf));
    const removable: number[] = [];
    const kept: number[] = [];
    for (const row of rows) {
      const fixed = row.status === 'settled' || row.profitRecord?.settlementStatus === 'settled' || locked.has(monthOf(row));
      (fixed ? kept : removable).push(row.id);
    }
    return { removable, kept };
  }

  /** 删除课时收入及其利润记录 */
  async removeIncomes(ids: number[]) {
    if (!ids.length) return 0;
    await this.prisma.profitRecord.deleteMany({ where: { sessionIncomeId: { in: ids } } });
    const res = await this.prisma.sessionIncome.deleteMany({ where: { id: { in: ids } } });
    return res.count;
  }

  /**
   * 结算一节课的课时费。exclusive：一节课只算一位老师，
   * 同课次其他老师的未固定收入、以及无老师时留下的机构利润记录会被替换；
   * 若其他老师的记录已固定（锁月/已打款）则保持原样，不再新增。
   */
  async settle(userId: number, courseId: number, date: string, opts?: { exclusive?: boolean }) {
    let replace: number[] = [];
    if (opts?.exclusive) {
      const others = await this.otherIncomes(courseId, date, userId);
      if (others.kept.length) {
        return this.prisma.sessionIncome.findUniqueOrThrow({ where: { id: others.kept[0] } });
      }
      replace = others.removable;
    }
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { organizationId: true } });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const quote = await this.quote(userId, courseId);
    // 优先记课程承接机构，避免老师个人机构与结算机构不一致导致利润归属错误
    const organizationId = course?.organizationId || user?.organizationId || null;
    const income = await this.prisma.sessionIncome.upsert({
      where: { userId_courseId_date: { userId, courseId, date } },
      update: this.incomeData(quote, organizationId),
      create: { userId, courseId, date, organizationId, ...this.incomeData(quote, organizationId) },
    });
    if (opts?.exclusive) {
      await this.removeIncomes(replace);
      const month = date.slice(0, 7);
      if (!(await this.fixedMonths([month])).has(month)) {
        await this.prisma.profitRecord.deleteMany({
          where: { courseId, sessionDate: date, sessionIncomeId: null, settlementStatus: { not: 'settled' } },
        });
      }
    }
    try {
      await this.finance.syncSessionProfit(income.id, { forceRecalc: true });
    } catch {
      // 利润同步失败不阻断签到结算
    }
    return income;
  }

  async myCourses(userId: number) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (cert?.status !== 'approved') return { certified: false, list: [] };
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
    const open = await this.prisma.semester.findFirst({
      where: { status: 1, startDate: { lte: todayKey }, endDate: { gte: todayKey } },
      orderBy: { id: 'desc' },
    });
    const contractValid = cert.contractStatus === 'signed'
      && !!open
      && cert.contractSemesterId === open.id;
    const grants = await this.prisma.teacherCourseGrant.findMany({
      where: {
        userId,
        course: {
          status: 1,
          teacherId: userId,
          ...(open
            ? { OR: [{ activeSemesterId: open.id }, { activeSemesterId: null }] }
            : {}),
        },
      },
      include: { course: true },
      orderBy: { id: 'desc' },
    });
    const list = [];
    for (const grant of grants) {
      const locked = grant.lockState === 'pending_contract' || !contractValid;
      const quote = await this.quote(userId, grant.courseId);
      list.push({
        id: grant.course.id,
        title: grant.course.title,
        school: grant.course.school,
        classroom: grant.course.classroom,
        gradeLabel: grant.course.gradeLabel,
        startTime: locked ? null : grant.course.startTime,
        endTime: locked ? null : grant.course.endTime,
        weekday: locked ? null : grant.course.weekday,
        locked,
        lockTip: locked ? '课程未解锁，请签合同后解锁' : '',
        ...teacherFeeView(quote),
      });
    }
    return { certified: true, contractValid, list };
  }

  async mySummary(userId: number) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [total, monthCount, courses] = await Promise.all([
      this.prisma.sessionIncome.count({ where: { userId } }),
      this.prisma.sessionIncome.count({ where: { userId, date: { startsWith: month } } }),
      this.prisma.course.findMany({ where: { teacherId: userId }, select: { id: true } }),
    ]);
    const ids = courses.map((item) => item.id);
    let rating: number | null = null;
    if (ids.length) {
      const agg = await this.prisma.comment.aggregate({
        where: { courseId: { in: ids }, status: 1 },
        _avg: { rating: true },
        _count: { rating: true },
      });
      if (agg._count.rating) rating = Math.round((agg._avg.rating || 0) * 10) / 10;
    }
    return { total, month: monthCount, rating };
  }

  async myIncomes(userId: number) {
    const rows = await this.prisma.sessionIncome.findMany({
      where: { userId },
      include: { course: { select: { title: true } } },
      orderBy: { date: 'desc' },
    });
    // 是否展示按当前机构配置实时判断，不用入账时的快照
    const hidden = new Map<number, boolean>();
    for (const courseId of new Set(rows.map((row) => row.courseId))) {
      const quote = await this.quote(userId, courseId).catch(() => null);
      hidden.set(courseId, !quote || quote.visibility === 'hidden');
    }
    return rows.map((row) => {
      const showFee = !hidden.get(row.courseId) && row.visibility !== 'hidden' && row.teacherFee != null;
      return {
        id: row.id,
        title: row.course.title,
        date: row.date,
        status: row.status,
        showFee,
        teacherFee: showFee ? row.teacherFee : null,
      };
    });
  }

  async ensureGrant(userId: number, courseId: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { organization: true },
    });
    if (course?.organizationId && course.organization?.status === 1) {
      const split = calculateCourseOrgFee({
        schoolPrice: course.price,
        sessionFee: course.sessionFee,
        mode: course.orgCommissionMode || course.organization.commissionMode,
        value: course.orgCommissionValue != null ? course.orgCommissionValue : course.organization.commissionValue,
      });
      const visibility = course.organization.feeVisibility === 'hidden' ? 'hidden' : 'final';
      await this.prisma.user.update({
        where: { id: userId },
        data: { organizationId: course.organizationId },
      });
      await this.prisma.teacherCourseGrant.upsert({
        where: { userId_courseId: { userId, courseId } },
        update: {
          baseFee: split.teacherFee,
          mode: split.mode,
          value: split.value,
          visibility,
        },
        create: {
          userId,
          courseId,
          baseFee: split.teacherFee,
          mode: split.mode,
          value: split.value,
          visibility,
        },
      });
      return;
    }
    await this.prisma.teacherCourseGrant.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {},
      create: { userId, courseId },
    });
  }

  async people(query: any) {
    const where: any = {};
    if (query.keyword) {
      where.OR = [
        { nickname: { contains: query.keyword } },
        { phone: { contains: query.keyword } },
        { teacherCert: { realName: { contains: query.keyword } } },
      ];
    }
    if (query.status === '0' || query.status === '1') where.status = Number(query.status);
    if (query.organizationId === '0') where.organizationId = null;
    else if (query.organizationId) where.organizationId = Number(query.organizationId);
    if (query.hasParent === '1') where.parentId = { not: null };
    if (query.hasParent === '0') where.parentId = null;
    if (query.cert === 'none') where.teacherCert = { is: null };
    else if (query.cert) where.teacherCert = { status: query.cert };
    const pagination = getPaginationParams({ page: Number(query.page), pageSize: Number(query.pageSize) || 10 });
    const [list, total, all, wechat, certified, pending, frozen] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
        include: this.userCard(),
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { OR: [{ teacherCert: { is: null } }, { teacherCert: { status: { not: 'approved' } } }] },
      }),
      this.prisma.teacherCert.count({ where: { status: 'approved' } }),
      this.prisma.teacherCert.count({ where: { status: 'pending' } }),
      this.prisma.user.count({ where: { status: 0 } }),
    ]);
    const names = [...new Set(list.map((item) => item.teacherCert?.realName).filter((n): n is string => !!n))];
    const dupNames = names.length
      ? new Set(
        (await this.prisma.teacherCert.groupBy({ by: ['realName'], where: { realName: { in: names } }, _count: { _all: true } }))
          .filter((row) => row._count._all > 1)
          .map((row) => row.realName),
      )
      : new Set<string>();
    return {
      stats: { all, wechat, certified, pending, frozen },
      ...buildPaginationResult(
        list.map((item) => ({ ...this.presentUser(item), duplicateName: !!item.teacherCert && dupNames.has(item.teacherCert.realName) })),
        total,
        pagination.page,
        pagination.pageSize,
      ),
    };
  }

  /** 账号名下的业务数据量，用于合并预览与删除校验 */
  private async accountFootprint(userId: number) {
    const [incomes, profits, grants, courses, terms, contracts, reimbursements, orders, checkIns, userCourses, comments, payouts, splits, subordinates] = await Promise.all([
      this.prisma.sessionIncome.count({ where: { userId } }),
      this.prisma.profitRecord.count({ where: { teacherId: userId } }),
      this.prisma.teacherCourseGrant.count({ where: { userId } }),
      this.prisma.course.count({ where: { teacherId: userId } }),
      this.prisma.courseTermTeacher.count({ where: { teacherId: userId } }),
      this.prisma.teacherContract.count({ where: { userId } }),
      this.prisma.reimbursement.count({ where: { userId } }),
      this.prisma.order.count({ where: { userId } }),
      this.prisma.checkIn.count({ where: { userId } }),
      this.prisma.userCourse.count({ where: { userId } }),
      this.prisma.comment.count({ where: { userId } }),
      this.prisma.splitPayout.count({ where: { OR: [{ userId }, { payeeKey: { in: [`t:${userId}`, `u:${userId}`] } }] } }),
      this.prisma.splitCollection.findMany({ where: { members: { contains: `"userId":${userId}` } }, select: { members: true } })
        .then((rows) => rows.filter((row) => {
          try {
            return (JSON.parse(row.members || '[]') as any[]).some((m) => Number(m?.userId) === userId);
          } catch {
            return false;
          }
        }).length),
      this.prisma.user.count({ where: { parentId: userId } }),
    ]);
    const items = [
      { key: 'incomes', label: '课时收入', count: incomes },
      { key: 'profits', label: '收益明细', count: profits },
      { key: 'grants', label: '课程授权', count: grants },
      { key: 'courses', label: '任课课程', count: courses },
      { key: 'terms', label: '学期任课', count: terms },
      { key: 'contracts', label: '合同记录', count: contracts },
      { key: 'reimbursements', label: '报销单', count: reimbursements },
      { key: 'orders', label: '订单', count: orders },
      { key: 'checkIns', label: '签到', count: checkIns },
      { key: 'userCourses', label: '已购课程', count: userCourses },
      { key: 'comments', label: '评价', count: comments },
      { key: 'payouts', label: '打款记录', count: payouts },
      { key: 'splits', label: '分成合集', count: splits },
      { key: 'subordinates', label: '下级教师', count: subordinates },
    ];
    return { items: items.filter((item) => item.count > 0), total: items.reduce((sum, item) => sum + item.count, 0) };
  }

  private async accountSummary(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { teacherCert: true } });
    if (!user) throw new NotFoundException(`用户 #${userId} 不存在`);
    const footprint = await this.accountFootprint(userId);
    return {
      id: user.id,
      realName: user.teacherCert?.realName || '',
      nickname: user.nickname || '',
      phone: user.phone || '',
      wechat: !isPhoneOpenid(user.openid),
      certStatus: user.teacherCert?.status || 'none',
      contractStatus: user.teacherCert?.contractStatus || 'none',
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      footprint,
      raw: { openid: user.openid, phone: user.phone, unionid: user.unionid },
    };
  }

  /** 合并候选：同名 / 同昵称排前面 */
  async mergeCandidates(userId: number) {
    const self = await this.prisma.user.findUnique({ where: { id: userId }, include: { teacherCert: true } });
    if (!self) throw new NotFoundException('用户不存在');
    const rows = await this.prisma.user.findMany({
      where: { id: { not: userId } },
      orderBy: { id: 'desc' },
      take: 500,
      select: { id: true, openid: true, nickname: true, phone: true, teacherCert: { select: { realName: true, status: true } } },
    });
    const name = self.teacherCert?.realName || '';
    const score = (row: (typeof rows)[number]) =>
      (name && row.teacherCert?.realName === name ? 2 : 0) + (self.nickname && row.nickname === self.nickname ? 1 : 0);
    return rows
      .map((row) => ({
        id: row.id,
        realName: row.teacherCert?.realName || '',
        nickname: row.nickname || '',
        phone: row.phone || '',
        wechat: !isPhoneOpenid(row.openid),
        certStatus: row.teacherCert?.status || 'none',
        sameName: score(row) > 0,
        score: score(row),
      }))
      .sort((a, b) => b.score - a.score || b.id - a.id)
      .map(({ score: _score, ...row }) => row);
  }

  /** 合并预览：两边概况、建议保留哪个、能否合并 */
  async mergePreview(userId: number, otherId: number) {
    if (userId === otherId) throw new BadRequestException('请选择另一个账号');
    const [a, b] = await Promise.all([this.accountSummary(userId), this.accountSummary(otherId)]);
    let blocked = '';
    try {
      assertMergeable(a.raw, b.raw);
    } catch (err: any) {
      blocked = err?.message || '不能合并';
    }
    const suggestedKeeperId = b.footprint.total > a.footprint.total ? b.id : a.id;
    const strip = ({ raw: _raw, ...rest }: typeof a) => rest;
    return { accounts: [strip(a), strip(b)], suggestedKeeperId, blocked };
  }

  async mergeUsers(keeperId: number, donorId: number) {
    if (!keeperId || !donorId) throw new BadRequestException('请选择要合并的账号');
    const user = await this.prisma.$transaction((tx) => mergeUserInto(tx, keeperId, donorId), { timeout: 60000 });
    return { id: user.id, phone: user.phone, wechat: !isPhoneOpenid(user.openid) };
  }

  /** 删除账号：只允许删没有业务数据的空账号，有数据的请用合并 */
  async deleteUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const footprint = await this.accountFootprint(userId);
    const blocking = footprint.items.filter((item) => item.key !== 'subordinates');
    if (blocking.length) {
      const list = blocking.map((item) => `${item.label} ${item.count}`).join('、');
      throw new BadRequestException(`该账号有${list}，不能直接删除；如果是重复账号，请用「合并账号」并入另一个账号`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.lessonProgress.deleteMany({ where: { userId } });
      await tx.teacherCert.deleteMany({ where: { userId } });
      await tx.user.updateMany({ where: { parentId: userId }, data: { parentId: null } });
      await tx.user.delete({ where: { id: userId } });
    });
    return { ok: true };
  }

  async faculty() {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const semester = await this.openSemester();
    const list = await this.prisma.user.findMany({
      where: { teacherCert: { isNot: null } },
      orderBy: { id: 'desc' },
      include: this.userCard(),
    });
    return {
      stats: {
        certified: list.filter((item) => item.teacherCert?.status === 'approved').length,
        pending: list.filter((item) => item.teacherCert?.status === 'pending').length,
        monthNew: list.filter((item) => item.teacherCert && item.teacherCert.createdAt >= start).length,
        org: list.filter((item) => item.organizationId && item.teacherCert?.status === 'approved').length,
        independent: list.filter((item) => !item.organizationId && item.teacherCert?.status === 'approved').length,
      },
      semesterName: semester?.name || '',
      list: list.map((item) => this.presentUser(item, semester)),
    };
  }

  async listGrants() {
    const semester = await this.openSemester();
    const grants = await this.prisma.teacherCourseGrant.findMany({
      orderBy: { id: 'desc' },
      include: {
        course: { select: { id: true, title: true, teacherId: true, school: true, status: true } },
        user: {
          select: {
            id: true,
            nickname: true,
            organization: { select: { id: true, name: true } },
            teacherCert: { select: { realName: true, contractStatus: true, contractSemesterId: true, status: true } },
          },
        },
      },
    });
    return {
      semesterName: semester?.name || '',
      list: grants.map((grant) => {
        const cert = grant.user.teacherCert;
        const contractValid = cert?.contractStatus === 'signed'
          && !!semester
          && cert.contractSemesterId === semester.id;
        const contractPending = cert?.contractStatus === 'pending_review';
        return {
          id: grant.id,
          userId: grant.userId,
          courseId: grant.courseId,
          title: grant.course.title,
          school: grant.course.school || '',
          primary: grant.course.teacherId === grant.userId,
          lockState: grant.lockState,
          locked: grant.lockState === 'pending_contract',
          baseFee: grant.baseFee,
          teacherName: cert?.realName || grant.user.nickname || `教师#${grant.userId}`,
          organizationName: grant.user.organization?.name || '',
          contractValid,
          contractPending,
          contractDue: cert?.status === 'approved' && !contractPending && !contractValid,
          createdAt: grant.createdAt,
        };
      }),
    };
  }

  /** 解除分配；解除的是主讲时课程变为未安排，from 为生效日：该日起已上的课不再记给这位老师 */
  async revokeGrant(userId: number, courseId: number, from?: string) {
    const grant = await this.prisma.teacherCourseGrant.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!grant) throw new NotFoundException('未找到该课程分配');
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true, title: true, activeSemesterId: true },
    });
    const primary = course?.teacherId === userId;
    await this.prisma.$transaction(async (tx) => {
      await tx.teacherCourseGrant.delete({ where: { id: grant.id } });
      if (primary) {
        await tx.course.update({ where: { id: courseId }, data: { teacherId: null } });
      }
    });
    let teacherChange = null;
    if (primary) {
      await syncTermTeacher(this.prisma, courseId, course?.activeSemesterId, null);
      if (from) teacherChange = await this.finance.applyTeacherChange(courseId, null, String(from), userId);
    }
    return { ok: true, courseId, userId, title: course?.title || '', teacherChange };
  }

  async teacherDetail(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: this.userCard() });
    if (!user) throw new NotFoundException('用户不存在');
    const [grants, incomes, orgs, teachers, contracts, semester] = await Promise.all([
      this.prisma.teacherCourseGrant.findMany({ where: { userId: id }, include: { course: true } }),
      this.prisma.sessionIncome.findMany({ where: { userId: id }, include: { course: { select: { title: true, school: true } } }, orderBy: { date: 'desc' } }),
      this.prisma.organization.findMany({ where: { status: 1 }, select: { id: true, name: true } }),
      this.prisma.user.findMany({
        where: { teacherCert: { status: 'approved' }, NOT: { id } },
        select: { id: true, nickname: true, teacherCert: { select: { realName: true } } },
      }),
      this.prisma.teacherContract.findMany({
        where: { userId: id },
        orderBy: { id: 'desc' },
        include: { semester: { select: { id: true, name: true } } },
      }),
      this.openSemester(),
    ]);
    const grantViews = [];
    for (const grant of grants) {
      grantViews.push({
        id: grant.id,
        courseId: grant.courseId,
        title: grant.course.title,
        lockState: grant.lockState,
        locked: grant.lockState === 'pending_contract',
        quote: await this.quote(id, grant.courseId),
      });
    }
    const cert = user.teacherCert;
    const contractValid = cert?.contractStatus === 'signed'
      && !!semester
      && cert.contractSemesterId === semester.id;
    return {
      ...this.presentUser(user, semester),
      idCard: cert?.idCard || '',
      idCardBack: cert?.idCardBack || '',
      idNumber: cert?.idNumber || '',
      address: cert?.address || '',
      email: cert?.email || '',
      bankName: cert?.bankName || '',
      bankAccountName: cert?.bankAccountName || '',
      bankAccount: cert?.bankAccount || '',
      diploma: cert?.diploma || '',
      clearance: cert?.clearance || '',
      certificate: cert?.certificate || '',
      contractSign: cert?.contractSign || '',
      contractStatus: cert?.contractStatus || 'none',
      contractValid,
      contractDue: cert?.status === 'approved' && cert?.contractStatus !== 'pending_review' && !contractValid,
      contractPending: cert?.contractStatus === 'pending_review',
      semesterName: semester?.name || '',
      grants: grantViews,
      contracts,
      incomes,
      orgs,
      teachers: teachers.map((item) => ({ id: item.id, name: item.teacherCert?.realName || item.nickname })),
    };
  }

  async setOrg(userId: number, organizationId: number | null) {
    if (organizationId) {
      const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
      if (!org) throw new NotFoundException('机构不存在');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { organizationId } });
    if (organizationId) {
      await this.applyOrgFeeVisibility(userId, organizationId);
    }
    return this.teacherDetail(userId);
  }

  /** 批量把老师关联到机构，并按机构「教师课时费可见」配置同步授权可见性 */
  async bindOrgTeachers(orgId: number, userIds: number[]) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org || org.status !== 1) throw new NotFoundException('机构不存在或已停用');
    const ids = [...new Set((userIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!ids.length) throw new BadRequestException('请先选择要关联的教师');

    const teachers = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        teacherCert: { status: 'approved' },
      },
      select: { id: true },
    });
    if (!teachers.length) throw new BadRequestException('只能关联已认证通过的教师');
    const okIds = teachers.map((item) => item.id);

    await this.prisma.user.updateMany({
      where: { id: { in: okIds } },
      data: { organizationId: orgId },
    });
    for (const userId of okIds) {
      await this.applyOrgFeeVisibility(userId, orgId);
    }
    return {
      ok: true,
      bound: okIds.length,
      skipped: ids.length - okIds.length,
      tip: `已关联 ${okIds.length} 位教师；课时费展示按机构配置「${this.feeVisibilityLabel(org.feeVisibility)}」`,
      detail: await this.orgDetail(orgId),
    };
  }

  private feeVisibilityLabel(value?: string | null) {
    if (value === 'hidden') return '不展示金额';
    return '只看最终课时费';
  }

  /**
   * 机构老师费用可见：
   * - 承接本机构的课程（course_org）：不展示抽成过程；hidden 则不展示金额，否则 final
   * - 其它授权课：完整跟随机构 feeVisibility
   */
  private async applyOrgFeeVisibility(userId: number, orgId: number) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return;
    const visibility = org.feeVisibility === 'hidden' ? 'hidden' : 'final';
    const courseOrgVisibility = visibility === 'hidden' ? 'hidden' : 'final';
    const orgCourses = await this.prisma.course.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    const orgCourseIds = orgCourses.map((item) => item.id);
    if (orgCourseIds.length) {
      await this.prisma.teacherCourseGrant.updateMany({
        where: { userId, courseId: { in: orgCourseIds } },
        data: { visibility: courseOrgVisibility },
      });
      await this.prisma.teacherCourseGrant.updateMany({
        where: { userId, courseId: { notIn: orgCourseIds } },
        data: { visibility },
      });
      return;
    }
    await this.prisma.teacherCourseGrant.updateMany({
      where: { userId },
      data: { visibility },
    });
  }

  private async syncOrgTeachersVisibility(orgId: number) {
    const teachers = await this.prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    for (const row of teachers) {
      await this.applyOrgFeeVisibility(row.id, orgId);
    }
  }

  async setParent(userId: number, parentId: number | null) {
    if (parentId) {
      if (parentId === userId) throw new BadRequestException('不能把自己设为上级');
      const parent = await this.prisma.teacherCert.findUnique({ where: { userId: parentId } });
      if (parent?.status !== 'approved') throw new BadRequestException('上级必须是认证教师');
      await this.assertNoCycle(userId, parentId);
    }
    await this.prisma.user.update({ where: { id: userId }, data: { parentId } });
    return { id: userId, parentId };
  }

  async freeze(userId: number, frozen: boolean) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    await this.prisma.user.update({ where: { id: userId }, data: { status: frozen ? 0 : 1 } });
    if (cert) {
      await this.prisma.teacherCert.update({
        where: { userId },
        data: { status: frozen ? 'frozen' : (cert.status === 'frozen' ? 'approved' : cert.status) },
      });
    }
    return { id: userId, status: frozen ? 0 : 1 };
  }

  async certs() {
    const semester = await this.openSemester();
    const list = await this.prisma.teacherCert.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { user: { select: { id: true, nickname: true, avatar: true, phone: true, status: true } } },
    });
    return list.map((item) => {
      const contractValid = item.contractStatus === 'signed'
        && !!semester
        && item.contractSemesterId === semester.id;
      return {
        ...item,
        semesterName: semester?.name || '',
        clearanceDue: item.status === 'approved' && !!semester && item.clearanceSemesterId !== semester.id && item.clearanceStatus !== 'pending',
        contractValid,
        contractDue: item.status === 'approved' && item.contractStatus !== 'pending_review' && !contractValid,
        contractPending: item.contractStatus === 'pending_review',
      };
    });
  }

  async certsPendingCount() {
    const semester = await this.openSemester();
    const [certPending, clearancePending, contractPending] = await Promise.all([
      this.prisma.teacherCert.count({ where: { status: 'pending' } }),
      this.prisma.teacherCert.count({ where: { status: 'approved', clearanceStatus: 'pending' } }),
      this.prisma.teacherContract.count({ where: { status: 'pending' } }),
    ]);
    const dueClearance = semester
      ? await this.prisma.teacherCert.count({
          where: {
            status: 'approved',
            clearanceStatus: { not: 'pending' },
            OR: [{ clearanceSemesterId: null }, { clearanceSemesterId: { not: semester.id } }],
          },
        })
      : 0;
    const names = await this.prisma.teacherCert.findMany({
      where: {
        OR: [
          { status: 'pending' },
          { clearanceStatus: 'pending' },
          { contractStatus: 'pending_review' },
        ],
      },
      take: 3,
      select: { realName: true, user: { select: { nickname: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      count: certPending + clearancePending + contractPending,
      certPending,
      clearancePending,
      contractPending,
      dueClearance,
      names: names.map((item) => item.realName || item.user?.nickname || '教师').join('、'),
      semesterName: semester?.name || '',
    };
  }

  async listContracts(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    const rows = await this.prisma.teacherContract.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 200,
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            phone: true,
            teacherCert: {
              select: {
                realName: true,
                teacherNo: true,
                contractFlowStatus: true,
                contractDraftStep: true,
                ocrStatus: true,
              },
            },
          },
        },
        semester: { select: { id: true, name: true, year: true, season: true } },
      },
    });
    return rows.map((row) => {
      const cert = row.user?.teacherCert;
      const step = cert?.contractDraftStep || 1;
      const flow = cert?.contractFlowStatus || 'not_started';
      const stepLabel = row.status === 'approved' || row.status === 'pending'
        ? (row.status === 'pending' ? '已签字待审' : '已签署')
        : flow === 'waiting_manual_review'
          ? '人工确认身份'
          : step === 3 || flow === 'waiting_signature'
            ? '签字确认'
            : step === 2 || flow === 'preview'
              ? '合同预览'
              : flow === 'filling'
                ? '信息确认'
                : '未开始';
      const flowLabel = ({
        not_started: '未开始',
        filling: '填写中',
        preview: '待确认',
        waiting_signature: '待签字',
        waiting_manual_review: '人工处理中',
        signed: '已签署',
      } as any)[flow] || flow;
      return {
        ...row,
        currentStep: stepLabel,
        flowStatus: flow,
        flowLabel: row.status === 'pending' ? '待审核' : row.status === 'approved' ? '已签署' : flowLabel,
        ocrStatus: cert?.ocrStatus || 'none',
      };
    });
  }

  async reviewContract(id: number, action: string, reason?: string, adminId?: number) {
    const row = await this.prisma.teacherContract.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('合同不存在');
    if (row.status !== 'pending') throw new BadRequestException('该合同已处理');
    const semester = await this.openSemester();
    if (action === 'reject') {
      await this.prisma.$transaction([
        this.prisma.teacherContract.update({
          where: { id },
          data: {
            status: 'rejected',
            rejectReason: reason || '合同未通过',
            reviewedAt: new Date(),
            reviewedBy: adminId || null,
          },
        }),
        this.prisma.teacherCert.update({
          where: { userId: row.userId },
          data: { contractStatus: 'none' },
        }),
      ]);
      return { status: 'rejected' };
    }
    if (action !== 'approve') throw new BadRequestException('未知审核操作');

    await this.prisma.$transaction(async (tx) => {
      await tx.teacherContract.updateMany({
        where: { userId: row.userId, status: 'approved', id: { not: id } },
        data: { status: 'superseded' },
      });
      await tx.teacherContract.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedAt: new Date(),
          reviewedBy: adminId || null,
          semesterId: row.semesterId || semester?.id || null,
        },
      });
      await tx.teacherCert.update({
        where: { userId: row.userId },
        data: {
          contractStatus: 'signed',
          contractSemesterId: row.semesterId || semester?.id || null,
          contractSign: row.signPath,
          contractSignedAt: row.signedAt,
        },
      });
      await tx.teacherCourseGrant.updateMany({
        where: { userId: row.userId, lockState: 'pending_contract' },
        data: { lockState: 'active' },
      });
    });
    return { status: 'approved' };
  }

  /** 手动撤销合同：历史保留为 revoked，教师需重新签字并审核；已授权课程重新锁定 */
  async revokeContract(id: number, reason?: string, adminId?: number) {
    const row = await this.prisma.teacherContract.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('合同不存在');
    if (!['approved', 'pending'].includes(row.status)) {
      throw new BadRequestException('只能撤销「已生效」或「待审核」的合同');
    }
    const tip = (reason || '').trim() || '管理员已撤销本合同，请重新签订本学期合同';
    await this.prisma.$transaction(async (tx) => {
      await tx.teacherContract.update({
        where: { id },
        data: {
          status: 'revoked',
          rejectReason: tip,
          reviewedAt: new Date(),
          reviewedBy: adminId || null,
        },
      });
      // 同教师其它待审合同一并撤销，避免状态打架
      await tx.teacherContract.updateMany({
        where: { userId: row.userId, status: 'pending', id: { not: id } },
        data: {
          status: 'revoked',
          rejectReason: tip,
          reviewedAt: new Date(),
          reviewedBy: adminId || null,
        },
      });
      await tx.teacherCert.update({
        where: { userId: row.userId },
        data: {
          contractStatus: 'none',
          contractSemesterId: null,
        },
      });
      await tx.teacherCourseGrant.updateMany({
        where: { userId: row.userId, lockState: 'active' },
        data: { lockState: 'pending_contract' },
      });
    });
    return { status: 'revoked', message: '合同已撤销，教师需重新签字提交审核，课程已重新锁定' };
  }

  /** 按教师撤销当前有效/待审合同 */
  async revokeTeacherContract(userId: number, reason?: string, adminId?: number) {
    const current = await this.prisma.teacherContract.findFirst({
      where: { userId, status: { in: ['approved', 'pending'] } },
      orderBy: { id: 'desc' },
    });
    if (!current) {
      // 仅清认证侧状态（例如学期切换后需强制重签）
      const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
      if (!cert) throw new NotFoundException('教师不存在');
      if (cert.contractStatus === 'none' && !cert.contractSemesterId) {
        throw new BadRequestException('该教师当前没有可撤销的合同');
      }
      await this.prisma.$transaction([
        this.prisma.teacherCert.update({
          where: { userId },
          data: { contractStatus: 'none', contractSemesterId: null },
        }),
        this.prisma.teacherCourseGrant.updateMany({
          where: { userId, lockState: 'active' },
          data: { lockState: 'pending_contract' },
        }),
      ]);
      return { status: 'revoked', message: '已清除合同状态，教师需重新签订' };
    }
    return this.revokeContract(current.id, reason, adminId);
  }

  /** 清空收款银行卡，必要时撤销合同，让教师在签订合同时重新填写 */
  async resetTeacherBank(userId: number, reason?: string, adminId?: number) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert) throw new NotFoundException('教师不存在');
    const hasBank = !!(
      String(cert.bankName || '').trim()
      || String(cert.bankAccountName || '').trim()
      || String(cert.bankAccount || '').trim()
    );
    if (!hasBank) throw new BadRequestException('该教师尚未填写银行卡信息');

    let draft: Record<string, any> | null = null;
    if (cert.contractDraftJson) {
      try {
        const parsed = JSON.parse(cert.contractDraftJson);
        if (parsed && typeof parsed === 'object') draft = { ...parsed };
      } catch {
        draft = null;
      }
    }
    if (draft) {
      delete draft.bankName;
      delete draft.bankAccountName;
      delete draft.bankAccount;
    }

    const tip = (reason || '').trim() || '管理员已清空银行卡信息，请重新填写收款账户后签订合同';
    const activeContract = await this.prisma.teacherContract.findFirst({
      where: { userId, status: { in: ['approved', 'pending'] } },
      orderBy: { id: 'desc' },
    });
    const needRevoke = !!activeContract
      || cert.contractStatus === 'signed'
      || cert.contractStatus === 'pending_review'
      || !!cert.contractSemesterId;

    await this.prisma.teacherCert.update({
      where: { userId },
      data: {
        bankName: null,
        bankAccountName: null,
        bankAccount: null,
        contractDraftJson: draft ? JSON.stringify(draft) : null,
        contractDraftStep: 1,
        contractFlowStatus: 'filling',
        contractDraftAt: new Date(),
      },
    });

    let revoked = false;
    if (needRevoke) {
      try {
        await this.revokeTeacherContract(userId, tip, adminId);
        revoked = true;
      } catch (err) {
        if (!(err instanceof BadRequestException)) throw err;
      }
    }

    return {
      status: 'reset',
      revoked,
      message: revoked
        ? '已清空银行卡并撤销合同，教师需重新填写收款信息并签订合同'
        : '已清空银行卡信息，教师签订合同时需重新填写',
    };
  }

  async review(userId: number, action: string, reason?: string, rejectFieldsInput?: string[]) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert) throw new NotFoundException('还没有认证申请');
    const semester = await this.openSemester();
    if (action === 'approveClearance') {
      if (cert.clearanceStatus !== 'pending') throw new BadRequestException('没有待审核的无犯罪证明');
      await this.prisma.teacherCert.update({
        where: { userId },
        data: {
          clearanceStatus: 'approved',
          clearanceSemesterId: semester?.id || cert.clearanceSemesterId,
          rejectReason: null,
          rejectFields: null,
        },
      });
      return { status: 'approved' };
    }
    if (action === 'approve') {
      const teacherNo = cert.teacherNo || `TEA-${new Date().getFullYear()}${String(userId).padStart(4, '0')}`;
      await this.prisma.teacherCert.update({
        where: { userId },
        data: {
          status: 'approved',
          teacherNo,
          rejectReason: null,
          rejectFields: null,
          clearanceStatus: 'approved',
          clearanceSemesterId: semester?.id || null,
        },
      });
      await this.prisma.user.update({ where: { id: userId }, data: { role: 'teacher', status: 1 } });
      return { status: 'approved' };
    }
    if (action === 'reject') {
      const tip = String(reason || '').trim();
      if (!tip) throw new BadRequestException('请填写驳回原因');
      const clearanceOnly = cert.status === 'approved' && cert.clearanceStatus === 'pending';
      const fields = clearanceOnly
        ? normalizeRejectFields(['clearance'])
        : normalizeRejectFields(rejectFieldsInput);
      if (!clearanceOnly && !fields.length) {
        throw new BadRequestException('请勾选需要教师修改的项目');
      }
      await this.prisma.teacherCert.update({
        where: { userId },
        data: clearanceOnly
          ? {
            clearanceStatus: 'rejected',
            rejectReason: tip,
            rejectFields: serializeRejectFields(fields),
          }
          : {
            status: 'rejected',
            rejectReason: tip,
            rejectFields: serializeRejectFields(fields),
          },
      });
      return { status: clearanceOnly ? 'approved' : 'rejected', rejectFields: fields };
    }
    throw new BadRequestException('未知审核操作');
  }

  private async openSemester() {
    const now = new Date();
    const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    return this.prisma.semester.findFirst({
      where: { status: 1, startDate: { lte: today }, endDate: { gte: today } },
      orderBy: { id: 'desc' },
    });
  }

  async orgs() {
    try {
      return await this.prisma.organization.findMany({
        orderBy: { id: 'desc' },
        include: { _count: { select: { teachers: true, courses: true } } },
      });
    } catch (err) {
      // 缺 courses.organization_id 时退化为只计教师，避免整页 500
      const list = await this.prisma.organization.findMany({
        orderBy: { id: 'desc' },
        include: { _count: { select: { teachers: true } } },
      });
      return list.map((item) => ({
        ...item,
        _count: { teachers: item._count.teachers, courses: 0 },
      }));
    }
  }

  async saveOrg(data: any, id?: number) {
    if (!data.name?.trim()) throw new BadRequestException('请填写机构名称');
    const payload = {
      name: data.name.trim(),
      logo: data.logo || null,
      contactName: data.contactName || null,
      phone: data.phone || null,
      address: data.address || null,
      intro: data.intro || null,
      status: Number(data.status ?? 1) === 0 ? 0 : 1,
      feeVisibility: data.feeVisibility === 'hidden' ? 'hidden' : 'final',
      commissionMode: data.commissionMode === 'fixed' ? 'fixed' : 'percent',
      commissionValue: Number(data.commissionValue || 0),
      corpName: this.text(data.corpName),
      taxNo: this.text(data.taxNo)?.toUpperCase() || null,
      bankName: this.text(data.bankName),
      bankAccount: this.text(data.bankAccount)?.replace(/[\s\-]/g, '') || null,
      corpAddress: this.text(data.corpAddress),
      corpPhone: this.text(data.corpPhone),
      corpRaw: this.text(data.corpRaw),
    };
    const saved = id
      ? await this.prisma.organization.update({ where: { id }, data: payload })
      : await this.prisma.organization.create({ data: payload });
    if (id) {
      try {
        await this.syncOrgTeachersVisibility(id);
      } catch {
        // 可见性同步失败不阻断保存
      }
    }
    return saved;
  }

  async saveGrant(userId: number, data: any) {
    const courseId = Number(data.courseId);
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { organization: true },
    });
    if (!course) throw new NotFoundException('课程不存在');
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (cert?.status !== 'approved') throw new BadRequestException('只有认证教师可以授权课程');
    const semester = await this.openSemester();
    const contractValid = cert.contractStatus === 'signed'
      && !!semester
      && cert.contractSemesterId === semester.id;
    // 已实名未签/未审合同：允许预分配，锁定到签合同审核通过
    const lockState = contractValid ? 'active' : 'pending_contract';
    if (data.primary && course.teacherId && course.teacherId !== userId) {
      const occupied = await this.prisma.user.findUnique({
        where: { id: course.teacherId },
        select: { nickname: true, teacherCert: { select: { realName: true } } },
      });
      const name = occupied?.teacherCert?.realName || occupied?.nickname || `教师#${course.teacherId}`;
      throw new BadRequestException(`该课程已预分配给「${name}」，请先解除分配后再指定其他教师`);
    }

    // 课程已承接机构：自动把教师关联到该机构，并强制只看最终课时费
    if (course.organizationId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { organizationId: course.organizationId },
      });
    }

    const courseOrg = !!(course.organizationId && course.organization?.status === 1);
    let baseFee = this.nullableNumber(data.baseFee);
    let mode = data.mode || null;
    let value = data.value == null || data.value === '' ? null : Number(data.value);
    let visibility = data.visibility ? (data.visibility === 'hidden' ? 'hidden' : 'final') : null;
    if (courseOrg) {
      const derived = calculateCourseOrgFee({
        schoolPrice: course.price,
        sessionFee: course.sessionFee,
        mode: course.orgCommissionMode || course.organization?.commissionMode || 'fixed',
        value: course.orgCommissionValue != null
          ? course.orgCommissionValue
          : course.organization?.commissionValue,
      });
      // 授权里存教师实得（合同附件用）；课程课时费不被改写
      baseFee = derived.teacherFee;
      mode = derived.mode;
      value = derived.value;
      visibility = course.organization?.feeVisibility === 'hidden' ? 'hidden' : 'final';
    }

    await this.prisma.teacherCourseGrant.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {
        baseFee,
        mode,
        value,
        visibility,
        lockState,
      },
      create: {
        userId,
        courseId,
        baseFee,
        mode,
        value,
        visibility,
        lockState,
      },
    });
    let teacherChange = null;
    if (data.primary) {
      await this.prisma.course.update({
        where: { id: courseId },
        data: {
          teacherId: userId,
          seats: 0,
          // 同步课程默认课时费，便于财务预览（承接机构课的课时费是抽成基数，不能被教师实得覆盖）
          ...(baseFee != null && !courseOrg ? { sessionFee: baseFee } : {}),
        },
      });
      await syncTermTeacher(this.prisma, courseId, course.activeSemesterId, userId);
      if (data.teacherFrom && course.teacherId !== userId) {
        teacherChange = await this.finance.applyTeacherChange(courseId, userId, String(data.teacherFrom), course.teacherId);
      }
    }
    const quote = await this.quote(userId, courseId);
    return { ...quote, lockState, locked: lockState === 'pending_contract', teacherChange };
  }

  async assignOrgCourse(orgId: number, data: {
    courseId: number;
    commissionMode?: string;
    commissionValue?: number | string;
  }) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org || org.status !== 1) throw new NotFoundException('机构不存在或已停用');
    const courseId = Number(data.courseId);
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { teacher: { select: { id: true, organizationId: true } } },
    });
    if (!course) throw new NotFoundException('课程不存在');
    if (course.organizationId && course.organizationId !== orgId) {
      throw new BadRequestException('该课程已分配给其他机构，请先解除后再分配');
    }
    const mode = data.commissionMode === 'percent' ? 'percent' : 'fixed';
    const value = data.commissionValue === '' || data.commissionValue == null
      ? Number(org.commissionValue || 0)
      : Number(data.commissionValue);
    if (Number.isNaN(value) || value < 0) throw new BadRequestException('抽成值不正确');
    if (mode === 'percent' && value > 100) throw new BadRequestException('抽成比例不能超过 100%');
    const split = calculateCourseOrgFee({ schoolPrice: course.price, sessionFee: course.sessionFee, mode, value });
    if (!split.configured) throw new BadRequestException('请先在「收益规则」给课程配置课时费，再设置机构抽成');
    if (mode === 'fixed' && value > Number(course.sessionFee || 0)) {
      throw new BadRequestException('机构抽成不能高于课时费');
    }

    const updated = await this.prisma.course.update({
      where: { id: courseId },
      data: {
        organizationId: orgId,
        orgCommissionMode: mode,
        orgCommissionValue: value,
      },
      include: {
        organization: { select: { id: true, name: true } },
        teacher: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
      },
    });

    // 课程已有授课老师：同步关联到机构，并按机构配置刷新费用可见性
    if (updated.teacherId) {
      await this.prisma.user.update({
        where: { id: updated.teacherId },
        data: { organizationId: orgId },
      });
      const visibility = org.feeVisibility === 'hidden' ? 'hidden' : 'final';
      await this.prisma.teacherCourseGrant.upsert({
        where: { userId_courseId: { userId: updated.teacherId, courseId } },
        update: {
          baseFee: split.teacherFee,
          mode,
          value,
          visibility,
        },
        create: {
          userId: updated.teacherId,
          courseId,
          baseFee: split.teacherFee,
          mode,
          value,
          visibility,
        },
      });
    }

    return {
      course: updated,
      quote: split,
      tip: org.feeVisibility === 'hidden'
        ? `平台利润 ¥${Number(split.platformAmount || 0).toFixed(2)}；课时费 ¥${Number(split.baseFee || 0).toFixed(2)} 直接结算给机构（其中机构利润 ¥${Number(split.commission || 0).toFixed(2)}）`
        : `平台利润 ¥${Number(split.platformAmount || 0).toFixed(2)}；课时费 ¥${Number(split.baseFee || 0).toFixed(2)} − 机构 ¥${Number(split.commission || 0).toFixed(2)} = 教师课时费 ¥${Number(split.teacherFee || 0).toFixed(2)}`,
    };
  }

  /** 承接机构课改了校方价 / 课时费 / 抽成后，刷新授权里的教师实得 */
  async refreshCourseOrgGrants(courseId: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { organization: true },
    });
    if (!course?.organizationId || course.organization?.status !== 1) return;
    const split = calculateCourseOrgFee({
      schoolPrice: course.price,
      sessionFee: course.sessionFee,
      mode: course.orgCommissionMode || course.organization.commissionMode,
      value: course.orgCommissionValue != null ? course.orgCommissionValue : course.organization.commissionValue,
    });
    await this.prisma.teacherCourseGrant.updateMany({
      where: { courseId },
      data: { baseFee: split.teacherFee, mode: split.mode, value: split.value },
    });
  }

  async unassignOrgCourse(orgId: number, courseId: number) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('课程不存在');
    if (course.organizationId !== orgId) throw new BadRequestException('该课程不属于此机构');
    await this.prisma.course.update({
      where: { id: courseId },
      data: {
        organizationId: null,
        orgCommissionMode: null,
        orgCommissionValue: null,
      },
    });
    // 授权里是按机构拆出的教师实得，解除后回落到课程课时费
    await this.prisma.teacherCourseGrant.updateMany({
      where: { courseId },
      data: { baseFee: null, mode: null, value: null },
    });
    return { ok: true, courseId };
  }

  async orgDetail(id: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { teachers: { include: { teacherCert: true } } },
    });
    if (!org) throw new NotFoundException('机构不存在');
    let commissionTotal = 0;
    let courses: any[] = [];
    try {
      const [income, rows] = await Promise.all([
        this.prisma.sessionIncome.aggregate({
          where: { organizationId: id },
          _sum: { commission: true },
        }),
        this.prisma.course.findMany({
          where: { organizationId: id },
          orderBy: { id: 'desc' },
          select: {
            id: true,
            title: true,
            school: true,
            price: true,
            sessionFee: true,
            status: true,
            orgCommissionMode: true,
            orgCommissionValue: true,
            teacherId: true,
            teacher: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
          },
        }),
      ]);
      commissionTotal = income._sum.commission || 0;
      courses = rows;
    } catch {
      const income = await this.prisma.sessionIncome.aggregate({
        where: { organizationId: id },
        _sum: { commission: true },
      });
      commissionTotal = income._sum.commission || 0;
      courses = [];
    }
    const courseViews = courses.map((item) => {
      const split = calculateCourseOrgFee({
        schoolPrice: item.price,
        sessionFee: item.sessionFee,
        mode: item.orgCommissionMode || org.commissionMode,
        value: item.orgCommissionValue != null ? item.orgCommissionValue : org.commissionValue,
      });
      return {
        ...item,
        teacherName: item.teacher?.teacherCert?.realName || item.teacher?.nickname || (item.teacherId ? `教师#${item.teacherId}` : '未排老师'),
        commissionText: (item.orgCommissionMode || org.commissionMode) === 'fixed'
          ? `¥${Number(item.orgCommissionValue ?? org.commissionValue ?? 0)}/节`
          : `课时费 ${Number(item.orgCommissionValue ?? org.commissionValue ?? 0)}%`,
        configured: split.configured,
        teacherFee: split.teacherFee,
        commission: split.commission,
        platformAmount: split.platformAmount,
      };
    });
    return {
      ...org,
      settleToOrg: org.feeVisibility === 'hidden',
      feeVisibilityLabel: this.feeVisibilityLabel(org.feeVisibility),
      commissionTotal,
      courses: courseViews,
    };
  }

  async incomes() {
    // 只展示已固定月份的课次收益
    const all = await this.prisma.monthlySettlement.findMany({ select: { month: true, locked: true } });
    const locked = new Set(all.filter((s) => s.locked).map((s) => s.month));
    const rows = await this.prisma.sessionIncome.findMany({
      orderBy: { date: 'desc' },
      take: 500,
      include: {
        course: { select: { title: true, school: true } },
        user: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
      },
    });
    return rows.filter((row) => locked.has(row.date.slice(0, 7)));
  }

  async myReimbursements(userId: number) {
    const rows = await this.prisma.reimbursement.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.formatReimbursement(row));
  }

  async createReimbursement(userId: number, body: any) {
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert || cert.status !== 'approved') {
      throw new BadRequestException('认证通过后才能提交报销单');
    }
    const fields = this.reimbursementFields(body);
    if (!fields.attachments.length) throw new BadRequestException('请至少上传一张票据或凭证');

    const row = await this.prisma.reimbursement.create({
      data: {
        userId,
        ...fields,
        attachments: JSON.stringify(fields.attachments),
        status: REIMBURSE_STATUS.pending,
      },
    });
    return this.formatReimbursement(row);
  }

  /** 后台代教师录入报销单：凭证可选，可直接设为已通过 / 已报销 */
  async adminCreateReimbursement(body: any, adminId?: number) {
    const userId = Number(body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('请选择教师');
    const cert = await this.prisma.teacherCert.findUnique({ where: { userId } });
    if (!cert || cert.status !== 'approved') throw new BadRequestException('只能给已认证教师录入报销单');
    const fields = this.reimbursementFields(body);
    const status = [REIMBURSE_STATUS.pending, REIMBURSE_STATUS.approved, REIMBURSE_STATUS.reimbursed]
      .includes(body?.status)
      ? body.status as string
      : REIMBURSE_STATUS.approved;
    const now = new Date();
    const reviewed = status !== REIMBURSE_STATUS.pending;
    const splitCollectionId = await this.reimburseCollectionId(body?.splitCollectionId);
    const row = await this.prisma.reimbursement.create({
      data: {
        userId,
        ...fields,
        attachments: JSON.stringify(fields.attachments),
        splitCollectionId: splitCollectionId ?? null,
        status,
        reviewedAt: reviewed ? now : null,
        reviewedBy: reviewed ? adminId || null : null,
        reimbursedAt: status === REIMBURSE_STATUS.reimbursed ? now : null,
      },
    });
    return this.formatReimbursement(row);
  }

  /** 后台录入报销单可选的教师（已认证） */
  async reimbursementTeachers() {
    const rows = await this.prisma.user.findMany({
      where: { teacherCert: { status: 'approved' } },
      orderBy: { id: 'desc' },
      take: 1000,
      select: { id: true, nickname: true, phone: true, teacherCert: { select: { realName: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.teacherCert?.realName || row.nickname || `教师#${row.id}`,
      phone: row.phone || '',
    }));
  }

  private reimbursementFields(body: any) {
    const title = String(body?.title || '').trim();
    if (!title || title.length > 80) throw new BadRequestException('请填写报销事由（80字以内）');
    const category = String(body?.category || 'other');
    if (!REIMBURSE_CATEGORIES.has(category)) throw new BadRequestException('报销类别无效');
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999) {
      throw new BadRequestException('请填写有效金额');
    }
    const expenseDate = String(body?.expenseDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) throw new BadRequestException('请选择发生日期');
    return {
      title,
      category,
      amount: Math.round(amount * 100) / 100,
      expenseDate,
      month: this.reimburseMonth(body?.month, expenseDate),
      description: String(body?.description || '').trim().slice(0, 500) || null,
      attachments: this.parseAttachments(body?.attachments),
    };
  }

  /** 结算月份：未填按发生日期所在月 */
  private reimburseMonth(raw: unknown, expenseDate: string) {
    const month = String(raw ?? '').trim();
    if (!month) return expenseDate.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('结算月份格式应为 YYYY-MM');
    return month;
  }

  /** 扣除合集：undefined 表示不修改，空值表示不从合集扣除 */
  private async reimburseCollectionId(raw: unknown): Promise<number | null | undefined> {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '' || raw === 0 || raw === '0') return null;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('扣除合集无效');
    const exists = await this.prisma.splitCollection.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('扣除合集不存在，请刷新后重新选择');
    return id;
  }

  /** 报销可扣除的分成合集 */
  async reimbursementCollections() {
    return this.prisma.splitCollection.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
  }

  /** 修改结算月份 / 扣除合集 / 凭证 / 金额（驳回的报销单不参与扣除，不可改） */
  async updateReimbursementDeduction(
    id: number,
    body: { month?: string; splitCollectionId?: number | null; attachments?: string[]; amount?: number | string },
  ) {
    const row = await this.prisma.reimbursement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('报销单不存在');
    if (row.status === REIMBURSE_STATUS.rejected) throw new BadRequestException('已驳回的报销单不参与扣除');
    const data: { month?: string; splitCollectionId?: number | null; attachments?: string; amount?: number } = await this.deductionData(body, row.expenseDate);
    if (body?.attachments !== undefined) data.attachments = JSON.stringify(this.parseAttachments(body.attachments));
    if (body?.amount !== undefined && body.amount !== null && body.amount !== '') {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 999999) throw new BadRequestException('请填写有效金额');
      const rounded = Math.round(amount * 100) / 100;
      if (rounded !== row.amount) {
        if (row.status === REIMBURSE_STATUS.reimbursed) throw new BadRequestException('已报销（已打款）的报销单不能修改金额');
        const months = [row.month, data.month].filter((m): m is string => !!m);
        const locked = await this.fixedMonths(months);
        if (locked.size) throw new BadRequestException(`${[...locked].join('、')} 已锁定结算，不能修改金额`);
        data.amount = rounded;
      }
    }
    const updated = await this.prisma.reimbursement.update({ where: { id }, data });
    return this.withCollectionName(this.formatReimbursement(updated));
  }

  private async deductionData(body: { month?: string; splitCollectionId?: number | null }, expenseDate: string) {
    const data: { month?: string; splitCollectionId?: number | null } = {};
    if (body?.month !== undefined) data.month = this.reimburseMonth(body.month, expenseDate);
    const collectionId = await this.reimburseCollectionId(body?.splitCollectionId);
    if (collectionId !== undefined) data.splitCollectionId = collectionId;
    return data;
  }

  private async withCollectionName<T extends { splitCollectionId: number | null }>(item: T) {
    if (!item.splitCollectionId) return { ...item, collectionName: '' };
    const c = await this.prisma.splitCollection.findUnique({ where: { id: item.splitCollectionId }, select: { name: true } });
    return { ...item, collectionName: c?.name || '（合集已删除）' };
  }

  async cancelReimbursement(userId: number, id: number) {
    const row = await this.prisma.reimbursement.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw new NotFoundException('报销单不存在');
    if (row.status !== REIMBURSE_STATUS.pending) {
      throw new BadRequestException('仅待审核的报销单可撤销');
    }
    await this.prisma.reimbursement.delete({ where: { id } });
    return { ok: true };
  }

  async saveReimbursementReceipt(file?: { buffer?: Buffer; path?: string }) {
    let buffer = file?.buffer;
    if ((!buffer || !buffer.length) && file?.path) {
      const { readFile } = await import('fs/promises');
      buffer = await readFile(file.path);
    }
    if (!buffer?.length) throw new BadRequestException('请上传票据');
    if (buffer.length > 8 * 1024 * 1024) throw new BadRequestException('票据不能超过 8MB');
    const ext = receiptExt(buffer);
    const name = `${randomUUID()}${ext}`;
    const dir = join(process.cwd(), 'uploads', 'reimbursements');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), buffer);
    return { url: `/uploads/reimbursements/${name}` };
  }

  async listReimbursements(query: { status?: string; month?: string } = {}) {
    const where: any = {};
    if (query.status && Object.values(REIMBURSE_STATUS).includes(query.status as any)) {
      where.status = query.status;
    }
    if (query.month && /^\d{4}-\d{2}$/.test(query.month)) where.month = query.month;
    const rows = await this.prisma.reimbursement.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            phone: true,
            teacherCert: { select: { realName: true, bankName: true, bankAccountName: true, bankAccount: true } },
          },
        },
      },
    });
    const collections = await this.prisma.splitCollection.findMany({ select: { id: true, name: true } });
    const names = new Map(collections.map((c) => [c.id, c.name]));
    return rows.map((row) => ({
      ...this.formatReimbursement(row),
      collectionName: row.splitCollectionId ? names.get(row.splitCollectionId) || '（合集已删除）' : '',
      user: row.user,
    }));
  }

  async reimbursementsPendingCount() {
    const count = await this.prisma.reimbursement.count({ where: { status: REIMBURSE_STATUS.pending } });
    return { count };
  }

  async reviewReimbursement(
    id: number,
    action: string,
    reason?: string,
    adminId?: number,
    deduction: { month?: string; splitCollectionId?: number | null } = {},
  ) {
    const row = await this.prisma.reimbursement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('报销单不存在');
    if (row.status !== REIMBURSE_STATUS.pending) {
      throw new BadRequestException('该报销单已处理');
    }
    if (action === 'approve') {
      const extra = await this.deductionData(deduction, row.expenseDate);
      const updated = await this.prisma.reimbursement.update({
        where: { id },
        data: {
          ...extra,
          status: REIMBURSE_STATUS.approved,
          rejectReason: null,
          reviewedAt: new Date(),
          reviewedBy: adminId || null,
        },
      });
      return this.formatReimbursement(updated);
    }
    if (action === 'reject') {
      const text = String(reason || '').trim();
      if (!text) throw new BadRequestException('请填写驳回原因');
      const updated = await this.prisma.reimbursement.update({
        where: { id },
        data: {
          status: REIMBURSE_STATUS.rejected,
          rejectReason: text.slice(0, 200),
          reviewedAt: new Date(),
          reviewedBy: adminId || null,
        },
      });
      return this.formatReimbursement(updated);
    }
    throw new BadRequestException('无效操作');
  }

  /** 仅审核通过后可标记已报销（打款完成） */
  async markReimbursed(id: number, adminId?: number) {
    const row = await this.prisma.reimbursement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('报销单不存在');
    if (row.status !== REIMBURSE_STATUS.approved) {
      throw new BadRequestException('需管理员审核通过后才能报销');
    }
    const updated = await this.prisma.reimbursement.update({
      where: { id },
      data: {
        status: REIMBURSE_STATUS.reimbursed,
        reimbursedAt: new Date(),
        reviewedBy: adminId || row.reviewedBy,
      },
    });
    return this.formatReimbursement(updated);
  }

  private formatReimbursement(row: {
    id: number;
    userId: number;
    title: string;
    category: string;
    amount: number;
    expenseDate: string;
    description: string | null;
    attachments: string;
    status: string;
    rejectReason: string | null;
    reviewedAt: Date | null;
    reviewedBy: number | null;
    reimbursedAt: Date | null;
    month: string | null;
    splitCollectionId: number | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    let attachments: string[] = [];
    try {
      const parsed = JSON.parse(row.attachments || '[]');
      attachments = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      attachments = [];
    }
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      category: row.category,
      categoryLabel: categoryLabel(row.category),
      amount: row.amount,
      expenseDate: row.expenseDate,
      description: row.description,
      attachments,
      status: row.status,
      statusLabel: statusLabel(row.status),
      rejectReason: row.rejectReason,
      reviewedAt: row.reviewedAt,
      reviewedBy: row.reviewedBy,
      reimbursedAt: row.reimbursedAt,
      month: row.month || row.expenseDate.slice(0, 7),
      splitCollectionId: row.splitCollectionId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      canReimburse: row.status === REIMBURSE_STATUS.approved,
    };
  }

  private parseAttachments(raw: unknown) {
    const list = Array.isArray(raw) ? raw : [];
    const urls = list
      .map((item) => String(item || '').trim())
      .filter((item) => item.startsWith('/uploads/reimbursements/'));
    if (urls.length > 9) throw new BadRequestException('最多上传 9 张票据');
    return [...new Set(urls)];
  }

  private incomeData(quote: FeeQuote, organizationId?: number | null) {
    if (!quote.configured) {
      return { baseFee: null, commission: null, teacherFee: null, visibility: quote.visibility, status: 'unconfigured', organizationId: organizationId || null };
    }
    const hasOrg = !!organizationId;
    const commission = hasOrg ? quote.commission : 0;
    const teacherFee = hasOrg
      ? quote.teacherFee
      : (quote.baseFee != null ? quote.baseFee : quote.teacherFee);
    return {
      baseFee: quote.baseFee,
      commission,
      teacherFee,
      visibility: hasOrg ? quote.visibility : 'final',
      status: 'pending',
      organizationId: organizationId || null,
    };
  }

  private async assertNoCycle(userId: number, parentId: number) {
    const seen = new Set<number>([userId]);
    let cursor: number | null = parentId;
    while (cursor) {
      if (seen.has(cursor)) throw new BadRequestException('不能形成循环上级');
      seen.add(cursor);
      const row: { parentId: number | null } | null = await this.prisma.user.findUnique({ where: { id: cursor }, select: { parentId: true } });
      cursor = row?.parentId || null;
    }
  }

  private userCard() {
    return {
      teacherCert: true,
      organization: { select: { id: true, name: true } },
      parent: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
      _count: { select: { grants: true, teachingCourses: true } },
    } as const;
  }

  private presentUser(item: any, semester?: { id: number; name?: string } | null) {
    const cert = item.teacherCert;
    const contractValid = !!cert
      && cert.contractStatus === 'signed'
      && !!semester
      && cert.contractSemesterId === semester.id;
    const contractPending = cert?.contractStatus === 'pending_review';
    const contractDue = cert?.status === 'approved' && !contractPending && !contractValid;
    return {
      id: item.id,
      avatar: item.avatar,
      nickname: item.nickname,
      phone: item.phone,
      status: item.status,
      role: item.role,
      createdAt: item.createdAt,
      lastLoginAt: item.lastLoginAt,
      realName: cert?.realName || '',
      certStatus: cert?.status || 'none',
      contractStatus: cert?.contractStatus || 'none',
      // 与用户端一致：仅本学期合同生效才算已签
      contractSigned: contractValid,
      contractValid,
      contractPending,
      contractDue,
      semesterName: semester?.name || '',
      teacherNo: cert?.teacherNo || '',
      gender: cert?.gender || item.gender || '',
      bio: cert?.bio || '',
      skills: cert?.skills || '',
      rejectReason: cert?.rejectReason || '',
      idCard: cert?.idCard || '',
      diploma: cert?.diploma || '',
      certificate: cert?.certificate || '',
      organization: item.organization || null,
      parent: item.parent ? { id: item.parent.id, name: item.parent.teacherCert?.realName || item.parent.nickname } : null,
      grantCount: item._count?.grants || 0,
      taughtCount: item._count?.teachingCourses || 0,
      wechat: item.openid ? !isPhoneOpenid(item.openid) : undefined,
    };
  }

  private text(value: any) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  private pickNumber(...values: any[]) {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') return Number(value);
    }
    return null;
  }

  private nullableNumber(value: any) {
    if (value === undefined || value === null || value === '') return null;
    return Number(value);
  }
}

function categoryLabel(category: string) {
  return ({
    transport: '交通出行',
    material: '教材教具',
    meal: '餐饮补贴',
    office: '办公耗材',
    other: '其他',
  } as Record<string, string>)[category] || category;
}

function statusLabel(status: string) {
  return ({
    pending: '待审核',
    approved: '已通过（可报销）',
    rejected: '已驳回',
    reimbursed: '已报销',
  } as Record<string, string>)[status] || status;
}

function receiptExt(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return '.jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return '.png';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return '.webp';
  if (buffer.slice(0, 4).toString('ascii') === '%PDF') return '.pdf';
  throw new BadRequestException('请上传 jpg、png、webp 或 pdf');
}
