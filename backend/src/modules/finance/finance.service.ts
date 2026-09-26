import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { calculateProfitSplit, moneyPct, monthKey, prevMonthKey } from './profit';
import { roundMoney } from '@/modules/staff/fee';

type Scope = {
  organizationId?: number | null;
  teacherId?: number | null;
  hidePlatform?: boolean;
};

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  /** 为已支付/退款订单写入或刷新收益快照。首次按课程规则落库；之后退款只按快照比例缩放。 */
  async syncOrderProfit(orderId: number, opts?: { forceRecalc?: boolean; refundAmount?: number }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        course: {
          include: {
            teacher: { select: { id: true, organizationId: true } },
          },
        },
        profitRecord: true,
      },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'paid' && order.status !== 'refunded') {
      if (order.profitRecord) {
        await this.prisma.profitRecord.delete({ where: { id: order.profitRecord.id } });
      }
      return null;
    }

    const totalAmount = roundMoney(Number(order.payAmount ?? order.amount) || 0);
    const existing = order.profitRecord;
    const refundAmount = opts?.refundAmount != null
      ? Number(opts.refundAmount)
      : (order.status === 'refunded'
        ? (existing?.refundAmount && existing.refundAmount > 0 ? existing.refundAmount : totalAmount)
        : (existing?.refundAmount || 0));

    const course = order.course;
    const teacherId = course.teacherId || course.teacher?.id || null;
    const institutionId = course.teacher?.organizationId || existing?.institutionId || null;
    const settlementMonth = existing?.settlementMonth || monthKey(order.payTime || order.createdAt);

    let teacherAmount = 0;
    let institutionAmount = 0;
    let platformAmount = 0;
    let teacherRate: number | null = null;
    let institutionRate: number | null = null;
    let platformRate: number | null = null;
    let teacherShareMode = course.teacherShareMode;
    let institutionShareMode = course.institutionShareMode;

    if (existing && !opts?.forceRecalc) {
      const net = roundMoney(totalAmount - refundAmount);
      const oldNet = roundMoney(existing.totalAmount - (existing.refundAmount || 0));
      teacherShareMode = existing.teacherShareMode || teacherShareMode;
      institutionShareMode = existing.institutionShareMode || institutionShareMode;
      teacherRate = existing.teacherRate;
      institutionRate = existing.institutionRate;
      platformRate = existing.platformRate;
      if (oldNet > 0) {
        const r = net / oldNet;
        teacherAmount = roundMoney(existing.teacherAmount * r);
        institutionAmount = roundMoney(existing.institutionAmount * r);
        platformAmount = roundMoney(net - teacherAmount - institutionAmount);
      } else if (net > 0 && teacherRate != null) {
        teacherAmount = roundMoney(net * (teacherRate || 0));
        institutionAmount = roundMoney(net * (institutionRate || 0));
        platformAmount = roundMoney(net - teacherAmount - institutionAmount);
      }
    } else {
      const split = calculateProfitSplit({
        totalAmount,
        refundAmount,
        teacherShareMode: course.teacherShareMode,
        teacherShareValue: course.teacherShareValue,
        institutionShareMode: course.institutionShareMode,
        institutionShareValue: course.institutionShareValue,
        lessonCount: course.lessonCount,
        studentCount: 1,
      });
      teacherAmount = split.teacherAmount;
      institutionAmount = split.institutionAmount;
      platformAmount = split.platformAmount;
      teacherRate = split.teacherRate;
      institutionRate = split.institutionRate;
      platformRate = split.platformRate;
      teacherShareMode = split.teacherShareMode;
      institutionShareMode = split.institutionShareMode;
    }

    const data = {
      orderId: order.id,
      courseId: order.courseId,
      teacherId,
      institutionId,
      totalAmount,
      refundAmount: roundMoney(refundAmount),
      teacherAmount,
      institutionAmount,
      platformAmount,
      teacherRate,
      institutionRate,
      platformRate,
      teacherShareMode,
      institutionShareMode,
      settlementMonth,
      orderStatus: order.status,
      settlementStatus: existing?.settlementStatus || 'pending',
      settledAt: existing?.settledAt || null,
    };

    if (existing) {
      return this.prisma.profitRecord.update({ where: { id: existing.id }, data });
    }
    return this.prisma.profitRecord.create({ data });
  }

  async syncAllPaidOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['paid', 'refunded'] } },
      select: { id: true },
    });
    let synced = 0;
    for (const row of orders) {
      await this.syncOrderProfit(row.id);
      synced += 1;
    }
    return { synced };
  }

  async markOrderPaid(orderId: number, payAmount?: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status === 'paid') return this.syncOrderProfit(orderId);
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
    return this.syncOrderProfit(orderId, { forceRecalc: true });
  }

  async markOrderRefunded(orderId: number, refundAmount?: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { profitRecord: true },
    });
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
    return this.syncOrderProfit(orderId, { refundAmount: refund });
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
        teacherShareMode: true,
        teacherShareValue: true,
        institutionShareMode: true,
        institutionShareValue: true,
        school: true,
        teacher: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } }, organizationId: true } },
      },
      take: 200,
    });
    return courses.map((c) => {
      const preview = calculateProfitSplit({
        totalAmount: c.price,
        teacherShareMode: c.teacherShareMode,
        teacherShareValue: c.teacherShareValue,
        institutionShareMode: c.institutionShareMode,
        institutionShareValue: c.institutionShareValue,
        studentCount: 1,
        lessonCount: 1,
      });
      return {
        ...c,
        teacherName: c.teacher?.teacherCert?.realName || c.teacher?.nickname || '—',
        preview,
      };
    });
  }

  async saveCourseRule(courseId: number, body: any) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('课程不存在');
    const teacherShareMode = body.teacherShareMode || course.teacherShareMode;
    const institutionShareMode = body.institutionShareMode || course.institutionShareMode;
    const validTeacher = ['percent', 'fixed', 'per_lesson'];
    const validOrg = ['percent', 'fixed', 'per_student', 'per_lesson'];
    if (!validTeacher.includes(teacherShareMode)) throw new BadRequestException('教师分成方式无效');
    if (!validOrg.includes(institutionShareMode)) throw new BadRequestException('机构分成方式无效');
    return this.prisma.course.update({
      where: { id: courseId },
      data: {
        teacherShareMode,
        teacherShareValue: Number(body.teacherShareValue ?? course.teacherShareValue),
        institutionShareMode,
        institutionShareValue: Number(body.institutionShareValue ?? course.institutionShareValue),
      },
    });
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
