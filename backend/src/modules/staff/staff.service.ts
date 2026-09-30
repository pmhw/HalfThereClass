import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { buildPaginationResult, getPaginationParams } from '@/common/utils/pagination.util';
import { normalizeRejectFields, serializeRejectFields } from '@/common/cert-reject';
import { calculateFee, teacherFeeView, FeeQuote } from './fee';
import { FinanceService } from '@/modules/finance/finance.service';

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

  async quote(userId: number, courseId: number, override: any = {}): Promise<FeeQuote & { organizationName: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!user || !course) throw new NotFoundException('教师或课程不存在');
    const grant = await this.prisma.teacherCourseGrant.findUnique({ where: { userId_courseId: { userId, courseId } } });
    const org = user.organization;
    const hasOrg = !!org && org.status === 1;
    const base = this.pickNumber(override.baseFee, grant?.baseFee, course.sessionFee);
    const mode = override.mode !== undefined ? override.mode : (grant?.mode || (hasOrg ? org.commissionMode : null));
    const value = override.value !== undefined ? override.value : (grant?.value ?? (hasOrg ? org.commissionValue : null));
    const visibility = override.visibility || grant?.visibility || org?.feeVisibility || 'final';
    return { ...calculateFee({ base, hasOrg, mode, value, visibility }), organizationName: org?.name || null };
  }

  preview(data: any) {
    const hasOrg = !!data.hasOrg;
    return calculateFee({
      base: data.baseFee === '' || data.baseFee == null ? null : Number(data.baseFee),
      hasOrg,
      mode: hasOrg ? data.mode : null,
      value: hasOrg ? Number(data.value || 0) : null,
      visibility: data.visibility || 'final',
    });
  }

  async settle(userId: number, courseId: number, date: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const quote = await this.quote(userId, courseId);
    const income = await this.prisma.sessionIncome.upsert({
      where: { userId_courseId_date: { userId, courseId, date } },
      update: this.incomeData(quote, user?.organizationId),
      create: { userId, courseId, date, organizationId: user?.organizationId || null, ...this.incomeData(quote, user?.organizationId) },
    });
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
    return rows.map((row) => {
      const showFee = row.visibility !== 'hidden' && row.teacherFee != null;
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
    return {
      stats: { all, wechat, certified, pending, frozen },
      ...buildPaginationResult(list.map((item) => this.presentUser(item)), total, pagination.page, pagination.pageSize),
    };
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

  async revokeGrant(userId: number, courseId: number) {
    const grant = await this.prisma.teacherCourseGrant.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!grant) throw new NotFoundException('未找到该课程分配');
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true, teacherId: true, title: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.teacherCourseGrant.delete({ where: { id: grant.id } });
      if (course?.teacherId === userId) {
        await tx.course.update({ where: { id: courseId }, data: { teacherId: null } });
      }
    });
    return { ok: true, courseId, userId, title: course?.title || '' };
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
    return this.teacherDetail(userId);
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
    const list = await this.prisma.organization.findMany({
      orderBy: { id: 'desc' },
      include: { _count: { select: { teachers: true } } },
    });
    return list;
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
      feeVisibility: ['full', 'final', 'hidden'].includes(data.feeVisibility) ? data.feeVisibility : 'final',
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
    return id
      ? this.prisma.organization.update({ where: { id }, data: payload })
      : this.prisma.organization.create({ data: payload });
  }

  async orgDetail(id: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { teachers: { include: { teacherCert: true } } },
    });
    if (!org) throw new NotFoundException('机构不存在');
    const income = await this.prisma.sessionIncome.aggregate({
      where: { organizationId: id },
      _sum: { commission: true },
    });
    return { ...org, commissionTotal: income._sum.commission || 0 };
  }

  async saveGrant(userId: number, data: any) {
    const courseId = Number(data.courseId);
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
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
    await this.prisma.teacherCourseGrant.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {
        baseFee: this.nullableNumber(data.baseFee),
        mode: data.mode || null,
        value: data.value == null || data.value === '' ? null : Number(data.value),
        visibility: data.visibility || null,
        lockState,
      },
      create: {
        userId,
        courseId,
        baseFee: this.nullableNumber(data.baseFee),
        mode: data.mode || null,
        value: data.value == null || data.value === '' ? null : Number(data.value),
        visibility: data.visibility || null,
        lockState,
      },
    });
    if (data.primary) {
      await this.prisma.course.update({
        where: { id: courseId },
        data: { teacherId: userId, seats: 0 },
      });
    }
    const quote = await this.quote(userId, courseId);
    return { ...quote, lockState, locked: lockState === 'pending_contract' };
  }

  async incomes() {
    return this.prisma.sessionIncome.findMany({
      orderBy: { date: 'desc' },
      take: 100,
      include: {
        course: { select: { title: true, school: true } },
        user: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
      },
    });
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
    const description = String(body?.description || '').trim().slice(0, 500) || null;
    const attachments = this.parseAttachments(body?.attachments);
    if (!attachments.length) throw new BadRequestException('请至少上传一张票据或凭证');

    const row = await this.prisma.reimbursement.create({
      data: {
        userId,
        title,
        category,
        amount: Math.round(amount * 100) / 100,
        expenseDate,
        description,
        attachments: JSON.stringify(attachments),
        status: REIMBURSE_STATUS.pending,
      },
    });
    return this.formatReimbursement(row);
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

  async listReimbursements(query: { status?: string } = {}) {
    const where: any = {};
    if (query.status && Object.values(REIMBURSE_STATUS).includes(query.status as any)) {
      where.status = query.status;
    }
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
    return rows.map((row) => ({
      ...this.formatReimbursement(row),
      user: row.user,
    }));
  }

  async reimbursementsPendingCount() {
    const count = await this.prisma.reimbursement.count({ where: { status: REIMBURSE_STATUS.pending } });
    return { count };
  }

  async reviewReimbursement(id: number, action: string, reason?: string, adminId?: number) {
    const row = await this.prisma.reimbursement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('报销单不存在');
    if (row.status !== REIMBURSE_STATUS.pending) {
      throw new BadRequestException('该报销单已处理');
    }
    if (action === 'approve') {
      const updated = await this.prisma.reimbursement.update({
        where: { id },
        data: {
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
    return {
      baseFee: quote.baseFee,
      commission: quote.commission,
      teacherFee: quote.teacherFee,
      visibility: quote.visibility,
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
