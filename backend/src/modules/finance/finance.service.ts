import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { calculateSessionProfit, moneyPct, monthKey, prevMonthKey } from './profit';
import { calculateFee, roundMoney } from '@/modules/staff/fee';
import { StaffService } from '@/modules/staff/staff.service';

type Scope = {
  organizationId?: number | null;
  teacherId?: number | null;
  hidePlatform?: boolean;
};

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => StaffService)) private staff: StaffService,
  ) {}

  /**
   * 按已结算课次写入利润快照：
   * 平台利润 = 校方价格 − 教师课时费 − 机构分佣
   */
  async syncSessionProfit(sessionIncomeId: number, opts?: { forceRecalc?: boolean }) {
    const income = await this.prisma.sessionIncome.findUnique({
      where: { id: sessionIncomeId },
      include: {
        course: { select: { id: true, price: true, sessionFee: true } },
        profitRecord: true,
        user: { select: { id: true, organizationId: true } },
      },
    });
    if (!income) throw new NotFoundException('课次收入不存在');

    if (income.status === 'unconfigured' || income.teacherFee == null) {
      if (income.profitRecord) {
        await this.prisma.profitRecord.delete({ where: { id: income.profitRecord.id } });
      }
      return null;
    }

    const existing = income.profitRecord;
    const schoolPrice = roundMoney(Number(income.course?.price) || 0);
    const split = calculateSessionProfit({
      schoolPrice,
      sessionFee: income.baseFee,
      teacherFee: income.teacherFee,
      commission: income.commission || 0,
    });

    // 已结算月且非强制重算：保留快照金额，仅纠正关联
    const useSnapshot = existing && existing.settlementStatus === 'settled' && !opts?.forceRecalc;
    const data = {
      sessionIncomeId: income.id,
      courseId: income.courseId,
      teacherId: income.userId,
      institutionId: income.organizationId || income.user?.organizationId || null,
      sessionDate: income.date,
      totalAmount: useSnapshot ? existing.totalAmount : split.schoolPrice,
      refundAmount: 0,
      teacherAmount: useSnapshot ? existing.teacherAmount : split.teacherAmount,
      institutionAmount: useSnapshot ? existing.institutionAmount : split.institutionAmount,
      platformAmount: useSnapshot ? existing.platformAmount : split.platformAmount,
      teacherRate: useSnapshot ? existing.teacherRate : split.teacherRate,
      institutionRate: useSnapshot ? existing.institutionRate : split.institutionRate,
      platformRate: useSnapshot ? existing.platformRate : split.platformRate,
      teacherShareMode: useSnapshot ? existing.teacherShareMode : 'session_fee',
      institutionShareMode: useSnapshot ? existing.institutionShareMode : 'org_commission',
      settlementMonth: existing?.settlementMonth || monthKey(income.date),
      orderStatus: 'session',
      settlementStatus: existing?.settlementStatus || 'pending',
      settledAt: existing?.settledAt || null,
    };

    if (existing) {
      return this.prisma.profitRecord.update({ where: { id: existing.id }, data });
    }
    return this.prisma.profitRecord.create({ data });
  }

  /** 可供勾选同步的课程列表（含课次统计与预估单节利润） */
  async listSyncCourses() {
    const courses = await this.prisma.course.findMany({
      where: { status: 1 },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        title: true,
        price: true,
        sessionFee: true,
        school: true,
        teacherId: true,
        teacher: {
          select: {
            nickname: true,
            teacherCert: { select: { realName: true } },
            organization: {
              select: { id: true, name: true, commissionMode: true, commissionValue: true, status: true },
            },
          },
        },
      },
      take: 500,
    });

    const today = this.formatDate(new Date());
    const result = [];
    for (const course of courses) {
      const [sessionTotal, completedCount, dueCount] = await Promise.all([
        this.prisma.courseSession.count({ where: { courseId: course.id } }),
        this.prisma.courseSession.count({ where: { courseId: course.id, status: 'completed' } }),
        this.prisma.courseSession.count({
          where: {
            courseId: course.id,
            status: 'scheduled',
            completionMode: 'auto',
            date: { lte: today },
          },
        }),
      ]);
      const org = course.teacher?.organization?.status === 1 ? course.teacher.organization : null;
      const fee = calculateFee({
        base: course.sessionFee,
        hasOrg: !!org,
        mode: org?.commissionMode,
        value: org?.commissionValue,
      });
      const preview = calculateSessionProfit({
        schoolPrice: course.price,
        sessionFee: fee.configured ? fee.baseFee : course.sessionFee,
        teacherFee: fee.configured ? fee.teacherFee : course.sessionFee,
        commission: fee.configured ? (fee.commission || 0) : 0,
      });
      result.push({
        id: course.id,
        title: course.title,
        school: course.school || '—',
        price: course.price,
        sessionFee: course.sessionFee,
        teacherName: course.teacher?.teacherCert?.realName || course.teacher?.nickname || '未安排',
        organizationName: org?.name || '—',
        sessionTotal,
        syncableCount: completedCount + dueCount,
        preview,
      });
    }
    return result;
  }

  /**
   * 同步课次收益（可勾选课程）：
   * - 不强制已安排教师：无教师时按 校方价格 − 课时费 计算（分佣 0）
   * - 有教师时按机构分佣规则计算
   * - 先把勾选课程的到期课次标为已上，再按课次写利润快照
   */
  async syncAllSessions(opts?: { courseIds?: number[] }) {
    const courseIds = [...new Set((opts?.courseIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!courseIds.length) throw new BadRequestException('请先勾选要同步的课程');

    const stats = {
      completedDue: 0,
      synced: 0,
      skippedNoFee: 0,
      skippedError: 0,
      withTeacher: 0,
      withoutTeacher: 0,
      profitTotal: 0,
    };

    stats.completedDue = await this.completePastSessions(courseIds);

    const completed = await this.prisma.courseSession.findMany({
      where: { status: 'completed', courseId: { in: courseIds } },
      select: {
        id: true,
        courseId: true,
        date: true,
        semesterId: true,
        course: {
          select: {
            teacherId: true,
            sessionFee: true,
            price: true,
            title: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    for (const session of completed) {
      try {
        const saved = await this.syncCourseSessionProfit(session);
        if (!saved) {
          stats.skippedNoFee += 1;
          continue;
        }
        stats.synced += 1;
        if (saved.teacherId) stats.withTeacher += 1;
        else stats.withoutTeacher += 1;
      } catch {
        stats.skippedError += 1;
      }
    }

    const scopeWhere = { courseId: { in: courseIds } };
    stats.profitTotal = await this.prisma.profitRecord.count({ where: scopeWhere });
    const byMonth = await this.prisma.profitRecord.groupBy({
      by: ['settlementMonth'],
      where: scopeWhere,
      _count: true,
      orderBy: { settlementMonth: 'asc' },
    });
    const byCourse = await this.prisma.profitRecord.groupBy({
      by: ['courseId'],
      where: scopeWhere,
      _count: true,
    });

    return {
      ...stats,
      courseCount: byCourse.length,
      selectedCourseCount: courseIds.length,
      byMonth: byMonth.map((row) => ({ month: row.settlementMonth, count: row._count })),
    };
  }

  /** 按课次写利润；有教师则走分佣报价，无教师则课时费全部记教师成本、分佣为 0 */
  private async syncCourseSessionProfit(session: {
    courseId: number;
    date: string;
    semesterId: number;
    course?: { teacherId?: number | null; sessionFee?: number | null; price?: number | null } | null;
  }) {
    const course = session.course || await this.prisma.course.findUnique({
      where: { id: session.courseId },
      select: { teacherId: true, sessionFee: true, price: true },
    });
    if (!course) return null;

    const teacherId = await this.resolveSessionTeacher({
      courseId: session.courseId,
      semesterId: session.semesterId,
      course,
    });

    let teacherAmount: number | null = null;
    let institutionAmount = 0;
    let institutionId: number | null = null;
    let sessionIncomeId: number | null = null;

    if (teacherId) {
      const income = await this.staff.settle(teacherId, session.courseId, session.date);
      sessionIncomeId = income.id;
      if (income.status !== 'unconfigured' && income.teacherFee != null) {
        teacherAmount = Number(income.teacherFee);
        institutionAmount = Number(income.commission || 0);
        institutionId = income.organizationId || null;
      }
    }

    // 无教师或结算未配置：直接用课程上的校方价格 / 课时费
    if (teacherAmount == null) {
      if (course.sessionFee == null || Number.isNaN(Number(course.sessionFee))) return null;
      teacherAmount = roundMoney(Number(course.sessionFee));
      institutionAmount = 0;
    }

    const schoolPrice = roundMoney(Number(course.price) || 0);
    const split = calculateSessionProfit({
      schoolPrice,
      sessionFee: teacherAmount,
      teacherFee: teacherAmount,
      commission: institutionAmount,
    });

    const existing = await this.prisma.profitRecord.findFirst({
      where: { courseId: session.courseId, sessionDate: session.date },
    });

    const data = {
      sessionIncomeId: sessionIncomeId || existing?.sessionIncomeId || null,
      courseId: session.courseId,
      teacherId: teacherId || null,
      institutionId,
      sessionDate: session.date,
      totalAmount: split.schoolPrice,
      refundAmount: 0,
      teacherAmount: split.teacherAmount,
      institutionAmount: split.institutionAmount,
      platformAmount: split.platformAmount,
      teacherRate: split.teacherRate,
      institutionRate: split.institutionRate,
      platformRate: split.platformRate,
      teacherShareMode: 'session_fee',
      institutionShareMode: institutionAmount ? 'org_commission' : 'none',
      settlementMonth: existing?.settlementMonth || monthKey(session.date),
      orderStatus: 'session',
      settlementStatus: existing?.settlementStatus === 'settled' ? 'settled' : 'pending',
      settledAt: existing?.settledAt || null,
    };

    if (existing) {
      return this.prisma.profitRecord.update({ where: { id: existing.id }, data });
    }
    return this.prisma.profitRecord.create({ data });
  }

  /** 过期未完课的 auto 课次 → completed */
  private async completePastSessions(courseIds?: number[]) {
    const today = this.formatDate(new Date());
    const nowHm = this.formatHm(new Date());
    const due = await this.prisma.courseSession.findMany({
      where: {
        status: 'scheduled',
        completionMode: 'auto',
        ...(courseIds?.length ? { courseId: { in: courseIds } } : {}),
        OR: [
          { date: { lt: today } },
          { date: today, endTime: { lte: nowHm } },
          { date: today, endTime: null, startTime: { lte: nowHm } },
        ],
      },
      select: { id: true },
      take: 2000,
    });
    if (!due.length) return 0;
    await this.prisma.courseSession.updateMany({
      where: { id: { in: due.map((item) => item.id) } },
      data: { status: 'completed', completedAt: new Date() },
    });
    return due.length;
  }

  private async resolveSessionTeacher(session: {
    courseId: number;
    semesterId: number;
    course?: { teacherId?: number | null } | null;
  }) {
    const term = await this.prisma.courseTermTeacher.findUnique({
      where: { courseId_semesterId: { courseId: session.courseId, semesterId: session.semesterId } },
    });
    if (term?.teacherId) return term.teacherId;
    if (session.course?.teacherId) return session.course.teacherId;
    const grant = await this.prisma.teacherCourseGrant.findFirst({
      where: { courseId: session.courseId, lockState: 'active' },
      orderBy: { id: 'asc' },
      select: { userId: true },
    });
    return grant?.userId || null;
  }

  private formatDate(date: Date) {
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
  }

  private formatHm(date: Date) {
    return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
  }

  /** @deprecated 订单不再驱动利润；保留手动改订单状态能力 */
  async markOrderPaid(orderId: number, payAmount?: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status === 'paid') return { id: orderId, status: 'paid' };
    if (order.status !== 'pending' && order.status !== 'cancelled') {
      throw new BadRequestException('当前订单状态不可标记为已支付');
    }
    const amount = payAmount != null ? Number(payAmount) : order.amount;
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'paid',
        payAmount: amount,
        payTime: new Date(),
        payType: order.payType || 'manual',
      },
    });
    await this.prisma.userCourse.upsert({
      where: { userId_courseId: { userId: order.userId, courseId: order.courseId } },
      update: {},
      create: { userId: order.userId, courseId: order.courseId, orderId: order.id },
    });
    return { id: orderId, status: 'paid' };
  }

  async markOrderRefunded(orderId: number, refundAmount?: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'paid' && order.status !== 'refunded') {
      throw new BadRequestException('仅已支付订单可退款');
    }
    const total = Number(order.payAmount ?? order.amount) || 0;
    const refund = refundAmount == null ? total : Math.min(total, Math.max(0, Number(refundAmount)));
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: refund >= total ? 'refunded' : 'paid' },
    });
    return { id: orderId, status: refund >= total ? 'refunded' : 'paid', refundAmount: refund };
  }

  private whereScope(scope?: Scope, month?: string, from?: string, to?: string) {
    const where: any = {};
    if (month) where.settlementMonth = month;
    if (from || to) {
      where.settlementMonth = {};
      if (from) where.settlementMonth.gte = from.slice(0, 7);
      if (to) where.settlementMonth.lte = to.slice(0, 7);
    }
    if (scope?.organizationId) where.institutionId = scope.organizationId;
    if (scope?.teacherId) where.teacherId = scope.teacherId;
    return where;
  }

  private sumRows(rows: { totalAmount: number; refundAmount: number; teacherAmount: number; institutionAmount: number; platformAmount: number }[]) {
    const totalAmount = roundMoney(rows.reduce((s, r) => s + (r.totalAmount - (r.refundAmount || 0)), 0));
    const teacherAmount = roundMoney(rows.reduce((s, r) => s + r.teacherAmount, 0));
    const institutionAmount = roundMoney(rows.reduce((s, r) => s + r.institutionAmount, 0));
    const platformAmount = roundMoney(rows.reduce((s, r) => s + r.platformAmount, 0));
    return {
      totalAmount,
      teacherAmount,
      institutionAmount,
      platformAmount,
      profitRate: moneyPct(platformAmount, totalAmount),
      orderCount: rows.length,
    };
  }

  async overview(month?: string, scope?: Scope) {
    await this.ensureMonthStatuses();
    const target = month || monthKey(new Date());
    const prev = prevMonthKey(target);

    const [currentRows, prevRows, trendRows, courseRows, settlement] = await Promise.all([
      this.prisma.profitRecord.findMany({ where: this.whereScope(scope, target) }),
      this.prisma.profitRecord.findMany({ where: this.whereScope(scope, prev) }),
      this.prisma.profitRecord.findMany({
        where: this.whereScope(scope, undefined, `${target.slice(0, 4)}-01`, target),
      }),
      this.prisma.profitRecord.findMany({
        where: this.whereScope(scope, target),
        include: { course: { select: { id: true, title: true } } },
      }),
      this.prisma.monthlySettlement.findUnique({ where: { month: target } }),
    ]);

    const current = this.sumRows(currentRows);
    const previous = this.sumRows(prevRows);
    const change = (a: number, b: number) => {
      if (!b) return a ? 100 : 0;
      return roundMoney(((a - b) / b) * 100);
    };

    const byMonth = new Map<string, typeof currentRows>();
    for (const row of trendRows) {
      const list = byMonth.get(row.settlementMonth) || [];
      list.push(row);
      byMonth.set(row.settlementMonth, list);
    }
    const trend = [...byMonth.keys()].sort().map((m) => ({
      month: m,
      ...this.sumRows(byMonth.get(m) || []),
    }));

    const byCourse = new Map<number, { courseId: number; title: string; totalAmount: number; platformAmount: number; teacherAmount: number; institutionAmount: number }>();
    for (const row of courseRows) {
      const cur = byCourse.get(row.courseId) || {
        courseId: row.courseId,
        title: row.course?.title || `课程#${row.courseId}`,
        totalAmount: 0,
        platformAmount: 0,
        teacherAmount: 0,
        institutionAmount: 0,
      };
      cur.totalAmount = roundMoney(cur.totalAmount + row.totalAmount - (row.refundAmount || 0));
      cur.platformAmount = roundMoney(cur.platformAmount + row.platformAmount);
      cur.teacherAmount = roundMoney(cur.teacherAmount + row.teacherAmount);
      cur.institutionAmount = roundMoney(cur.institutionAmount + row.institutionAmount);
      byCourse.set(row.courseId, cur);
    }
    const courseRank = [...byCourse.values()]
      .sort((a, b) => b.platformAmount - a.platformAmount)
      .slice(0, 10);

    const payload: any = {
      month: target,
      settlementStatus: settlement?.status || this.defaultMonthStatus(target),
      current: {
        ...current,
        revenueChange: change(current.totalAmount, previous.totalAmount),
        teacherSharePct: moneyPct(current.teacherAmount, current.totalAmount),
        institutionSharePct: moneyPct(current.institutionAmount, current.totalAmount),
        platformSharePct: moneyPct(current.platformAmount, current.totalAmount),
      },
      previous,
      trend,
      courseRank,
    };
    if (scope?.hidePlatform) {
      delete payload.current.platformAmount;
      delete payload.current.profitRate;
      delete payload.current.platformSharePct;
      payload.trend = payload.trend.map((item: any) => {
        const { platformAmount, profitRate, ...rest } = item;
        return rest;
      });
      payload.courseRank = payload.courseRank.map((item: any) => {
        const { platformAmount, ...rest } = item;
        return rest;
      });
    }
    return payload;
  }

  async monthlyTable(opts: { year?: number; from?: string; to?: string; group?: string; scope?: Scope }) {
    await this.ensureMonthStatuses();
    const year = opts.year || new Date().getFullYear();
    const from = opts.from || `${year}-01`;
    const to = opts.to || `${year}-12`;
    const rows = await this.prisma.profitRecord.findMany({
      where: this.whereScope(opts.scope, undefined, from, to),
    });
    const settlements = await this.prisma.monthlySettlement.findMany({
      where: { month: { gte: from.slice(0, 7), lte: to.slice(0, 7) } },
    });
    const settleMap = Object.fromEntries(settlements.map((s) => [s.month, s.status]));

    const group = opts.group || 'month';
    const buckets = new Map<string, typeof rows>();
    for (const row of rows) {
      let key = row.settlementMonth;
      if (group === 'year') key = row.settlementMonth.slice(0, 4);
      if (group === 'quarter') {
        const m = Number(row.settlementMonth.slice(5, 7));
        const q = Math.ceil(m / 3);
        key = `${row.settlementMonth.slice(0, 4)}-Q${q}`;
      }
      const list = buckets.get(key) || [];
      list.push(row);
      buckets.set(key, list);
    }

    return [...buckets.keys()].sort().map((key) => {
      const sum = this.sumRows(buckets.get(key) || []);
      const month = group === 'month' ? key : null;
      return {
        key,
        month,
        ...sum,
        settlementStatus: month ? (settleMap[month] || this.defaultMonthStatus(month)) : null,
      };
    });
  }

  async monthCourses(month: string, scope?: Scope) {
    const rows = await this.prisma.profitRecord.findMany({
      where: this.whereScope(scope, month),
      include: {
        course: {
          select: {
            id: true,
            title: true,
            school: true,
            lessonCount: true,
            studentCount: true,
            teacher: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
          },
        },
      },
    });
    const map = new Map<number, any>();
    for (const row of rows) {
      const cur = map.get(row.courseId) || {
        courseId: row.courseId,
        title: row.course?.title || `课程#${row.courseId}`,
        school: row.course?.school || '—',
        lessonCount: row.course?.lessonCount || 0,
        studentCount: 0,
        totalAmount: 0,
        teacherAmount: 0,
        institutionAmount: 0,
        platformAmount: 0,
        teacherName: row.course?.teacher?.teacherCert?.realName || row.course?.teacher?.nickname || '—',
      };
      cur.studentCount += 1;
      cur.totalAmount = roundMoney(cur.totalAmount + row.totalAmount - (row.refundAmount || 0));
      cur.teacherAmount = roundMoney(cur.teacherAmount + row.teacherAmount);
      cur.institutionAmount = roundMoney(cur.institutionAmount + row.institutionAmount);
      cur.platformAmount = roundMoney(cur.platformAmount + row.platformAmount);
      map.set(row.courseId, cur);
    }
    return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  }

  async teacherStats(month?: string, scope?: Scope) {
    const target = month || monthKey(new Date());
    const rows = await this.prisma.profitRecord.findMany({
      where: this.whereScope(scope, target),
      include: {
        teacher: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
        course: { select: { id: true, title: true } },
      },
    });
    const map = new Map<number, any>();
    for (const row of rows) {
      if (!row.teacherId) continue;
      const cur = map.get(row.teacherId) || {
        teacherId: row.teacherId,
        name: row.teacher?.teacherCert?.realName || row.teacher?.nickname || `教师#${row.teacherId}`,
        courseIds: new Set<number>(),
        courses: [] as string[],
        orderCount: 0,
        totalAmount: 0,
        teacherAmount: 0,
        platformAmount: 0,
      };
      cur.orderCount += 1;
      cur.courseIds.add(row.courseId);
      if (row.course?.title && !cur.courses.includes(row.course.title)) cur.courses.push(row.course.title);
      cur.totalAmount = roundMoney(cur.totalAmount + row.totalAmount - (row.refundAmount || 0));
      cur.teacherAmount = roundMoney(cur.teacherAmount + row.teacherAmount);
      cur.platformAmount = roundMoney(cur.platformAmount + row.platformAmount);
      map.set(row.teacherId, cur);
    }
    return [...map.values()]
      .map((item) => ({
        teacherId: item.teacherId,
        name: item.name,
        courseCount: item.courseIds.size,
        courses: item.courses,
        orderCount: item.orderCount,
        totalAmount: item.totalAmount,
        teacherAmount: item.teacherAmount,
        platformAmount: scope?.hidePlatform ? undefined : item.platformAmount,
      }))
      .sort((a, b) => b.teacherAmount - a.teacherAmount);
  }

  async teacherDetail(teacherId: number, month?: string, scope?: Scope) {
    const target = month || monthKey(new Date());
    const where = this.whereScope({ ...scope, teacherId }, target);
    const rows = await this.prisma.profitRecord.findMany({
      where,
      include: { course: { select: { id: true, title: true, lessonCount: true } } },
    });
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
      select: { id: true, nickname: true, teacherCert: { select: { realName: true } } },
    });
    if (!teacher) throw new NotFoundException('教师不存在');
    const sum = this.sumRows(rows);
    const courses = [...new Map(rows.map((r) => [r.courseId, r.course])).values()].filter(Boolean);
    const lessonCount = courses.reduce((s, c: any) => s + (c?.lessonCount || 0), 0);
    return {
      teacherId,
      name: teacher.teacherCert?.realName || teacher.nickname || `教师#${teacherId}`,
      month: target,
      courses: courses.map((c: any) => ({ id: c.id, title: c.title, lessonCount: c.lessonCount })),
      lessonCount,
      ...sum,
      platformAmount: scope?.hidePlatform ? undefined : sum.platformAmount,
      profitRate: scope?.hidePlatform ? undefined : sum.profitRate,
    };
  }

  async orgStats(month?: string, scope?: Scope) {
    const target = month || monthKey(new Date());
    const rows = await this.prisma.profitRecord.findMany({
      where: this.whereScope(scope, target),
      include: {
        institution: { select: { id: true, name: true } },
        course: { select: { id: true, title: true } },
      },
    });
    const map = new Map<number, any>();
    for (const row of rows) {
      if (!row.institutionId) continue;
      const cur = map.get(row.institutionId) || {
        organizationId: row.institutionId,
        name: row.institution?.name || `机构#${row.institutionId}`,
        courseIds: new Set<number>(),
        totalAmount: 0,
        institutionAmount: 0,
        platformAmount: 0,
      };
      cur.courseIds.add(row.courseId);
      cur.totalAmount = roundMoney(cur.totalAmount + row.totalAmount - (row.refundAmount || 0));
      cur.institutionAmount = roundMoney(cur.institutionAmount + row.institutionAmount);
      cur.platformAmount = roundMoney(cur.platformAmount + row.platformAmount);
      map.set(row.institutionId, cur);
    }
    return [...map.values()]
      .map((item) => ({
        organizationId: item.organizationId,
        name: item.name,
        courseCount: item.courseIds.size,
        totalAmount: item.totalAmount,
        institutionAmount: item.institutionAmount,
        platformAmount: scope?.hidePlatform ? undefined : item.platformAmount,
      }))
      .sort((a, b) => b.institutionAmount - a.institutionAmount);
  }

  async orgDetail(organizationId: number, month?: string, scope?: Scope) {
    const target = month || monthKey(new Date());
    const where = this.whereScope({ ...scope, organizationId }, target);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('机构不存在');
    return {
      organizationId,
      name: org.name,
      month: target,
      courses: await this.monthCourses(target, { ...scope, organizationId }),
      ...(await this.overview(target, { ...scope, organizationId })).current,
    };
  }

  async settleMonth(month: string, adminId?: number, note?: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
    const rows = await this.prisma.profitRecord.findMany({ where: { settlementMonth: month } });
    const sum = this.sumRows(rows);
    const now = new Date();
    await this.prisma.profitRecord.updateMany({
      where: { settlementMonth: month, settlementStatus: 'pending' },
      data: { settlementStatus: 'settled', settledAt: now },
    });
    return this.prisma.monthlySettlement.upsert({
      where: { month },
      create: {
        month,
        status: 'settled',
        totalAmount: sum.totalAmount,
        teacherAmount: sum.teacherAmount,
        institutionAmount: sum.institutionAmount,
        platformAmount: sum.platformAmount,
        orderCount: sum.orderCount,
        settledAt: now,
        settledBy: adminId || null,
        note: note || null,
      },
      update: {
        status: 'settled',
        totalAmount: sum.totalAmount,
        teacherAmount: sum.teacherAmount,
        institutionAmount: sum.institutionAmount,
        platformAmount: sum.platformAmount,
        orderCount: sum.orderCount,
        settledAt: now,
        settledBy: adminId || null,
        note: note || null,
      },
    });
  }

  async reopenMonth(month: string) {
    await this.prisma.profitRecord.updateMany({
      where: { settlementMonth: month },
      data: { settlementStatus: 'pending', settledAt: null },
    });
    return this.prisma.monthlySettlement.upsert({
      where: { month },
      create: { month, status: this.defaultMonthStatus(month) },
      update: { status: this.defaultMonthStatus(month), settledAt: null, settledBy: null },
    });
  }

  async listRules() {
    const courses = await this.prisma.course.findMany({
      orderBy: { id: 'desc' },
      select: {
        id: true,
        title: true,
        price: true,
        sessionFee: true,
        school: true,
        teacher: {
          select: {
            id: true,
            nickname: true,
            organizationId: true,
            teacherCert: { select: { realName: true } },
            organization: {
              select: {
                id: true,
                name: true,
                commissionMode: true,
                commissionValue: true,
                feeVisibility: true,
              },
            },
          },
        },
      },
      take: 200,
    });

    return courses.map((c) => {
      const org = c.teacher?.organization || null;
      const hasOrg = !!org;
      const fee = calculateFee({
        base: c.sessionFee,
        hasOrg,
        mode: org?.commissionMode,
        value: org?.commissionValue,
        visibility: org?.feeVisibility,
      });
      const preview = calculateSessionProfit({
        schoolPrice: c.price,
        sessionFee: fee.baseFee,
        teacherFee: fee.teacherFee,
        commission: fee.commission || 0,
        commissionMode: fee.mode,
        commissionValue: fee.value,
      });
      return {
        id: c.id,
        title: c.title,
        price: c.price,
        sessionFee: c.sessionFee,
        school: c.school,
        teacherName: c.teacher?.teacherCert?.realName || c.teacher?.nickname || '—',
        organizationName: org?.name || '未绑定机构',
        commissionMode: org?.commissionMode || null,
        commissionValue: org?.commissionValue ?? 0,
        feeVisibility: org?.feeVisibility || 'final',
        configured: fee.configured,
        preview,
      };
    });
  }

  /** 收益规则：改课程校方价格 / 课时费；机构分佣仍在机构设置里维护 */
  async saveCourseRule(courseId: number, body: any) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('课程不存在');
    const data: any = {};
    if (body.price !== undefined && body.price !== '') data.price = Number(body.price);
    if (body.sessionFee !== undefined) {
      data.sessionFee = body.sessionFee === '' || body.sessionFee == null ? null : Number(body.sessionFee);
    }
    if (!Object.keys(data).length) throw new BadRequestException('没有可保存的字段');
    return this.prisma.course.update({ where: { id: courseId }, data });
  }

  private defaultMonthStatus(month: string) {
    const now = monthKey(new Date());
    if (month > now) return 'open';
    if (month === now) return 'open';
    return 'pending';
  }

  private async ensureMonthStatuses() {
    const now = new Date();
    const months: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthKey(d));
    }
    for (const month of months) {
      const exists = await this.prisma.monthlySettlement.findUnique({ where: { month } });
      if (!exists) {
        await this.prisma.monthlySettlement.create({
          data: { month, status: this.defaultMonthStatus(month) },
        });
      } else if (exists.status !== 'settled') {
        const next = this.defaultMonthStatus(month);
        if (exists.status !== next) {
          await this.prisma.monthlySettlement.update({ where: { month }, data: { status: next } });
        }
      }
    }
  }
}
