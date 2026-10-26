import { BadRequestException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { calculateSessionProfit, moneyPct, monthKey, prevMonthKey } from './profit';
import { calculateFee, calculateCourseOrgFee, roundMoney } from '@/modules/staff/fee';
import { StaffService } from '@/modules/staff/staff.service';
import { CourseStat, SplitDeduction, SplitMember, computeSplitMonth, payeeKey, transferFee } from './split-calc';

type OrgFeeInfo = {
  id: number;
  name: string;
  commissionMode: string;
  commissionValue: number;
  feeVisibility: string;
  status: number;
};

type SplitConfig = {
  taxRate: number;
  feeUnit: number;
  feeStep: number;
  basis: 'profit' | 'school';
  teacherFee: boolean;
  orgFee: boolean;
  memberFee: boolean;
};

const SPLIT_CONFIG_KEY = 'split_config';

/** 按日期自动同步课次收益：后台定时 + 打开财务页面时（节流）触发 */
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const AUTO_SYNC_MIN_GAP_MS = 2 * 60 * 1000;
const AUTO_SYNC_WAIT_MS = 4000;

export type AutoSyncState = {
  at: string | null;
  completedDue: number;
  synced: number;
  skippedNoFee: number;
  skippedLocked: number;
  failed: number;
};

/** 结算单说明里的金额：¥28,931.26 */
function yuan(value: number) {
  return `¥${Number(value || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
const DEFAULT_SPLIT_CONFIG: SplitConfig = {
  taxRate: 0,
  feeUnit: 4.5,
  feeStep: 5000,
  basis: 'profit',
  teacherFee: true,
  orgFee: true,
  memberFee: true,
};

function normalizeSplitConfig(raw: any): SplitConfig {
  const num = (value: any, fallback: number) => (Number.isFinite(Number(value)) && value !== '' && value != null ? Number(value) : fallback);
  return {
    taxRate: num(raw?.taxRate, DEFAULT_SPLIT_CONFIG.taxRate),
    feeUnit: num(raw?.feeUnit, DEFAULT_SPLIT_CONFIG.feeUnit),
    feeStep: num(raw?.feeStep, DEFAULT_SPLIT_CONFIG.feeStep),
    basis: raw?.basis === 'school' ? 'school' : 'profit',
    teacherFee: raw?.teacherFee !== false,
    orgFee: raw?.orgFee !== false,
    memberFee: raw?.memberFee !== false,
  };
}

type Scope = {
  organizationId?: number | null;
  teacherId?: number | null;
  hidePlatform?: boolean;
};

@Injectable()
export class FinanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('FinanceAutoSync');
  private autoSyncTimer: NodeJS.Timeout | null = null;
  private autoSyncRunning: Promise<AutoSyncState> | null = null;
  private autoSyncState: AutoSyncState = { at: null, completedDue: 0, synced: 0, skippedNoFee: 0, skippedLocked: 0, failed: 0 };

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => StaffService)) private staff: StaffService,
  ) {}

  onModuleInit() {
    if (process.env.FINANCE_AUTO_SYNC === 'off') return;
    const tick = () => this.autoSyncSessions({ force: true }).catch((e) => this.logger.warn(`自动同步失败：${e?.message || e}`));
    setTimeout(tick, 15000).unref?.();
    this.autoSyncTimer = setInterval(tick, AUTO_SYNC_INTERVAL_MS);
    this.autoSyncTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
  }

  /**
   * 按日期自动同步课次收益：到期的自动完课课次标为已上，再给「未固定月份」里还没记收益的已上课次写利润。
   * 已有收益的课次不重算（调价/换老师走各自的同步），已打款的课时收入不碰。
   */
  async autoSyncSessions(opts?: { force?: boolean }): Promise<AutoSyncState> {
    if (this.autoSyncRunning) return this.autoSyncRunning;
    const last = this.autoSyncState.at ? new Date(this.autoSyncState.at).getTime() : 0;
    if (!opts?.force && Date.now() - last < AUTO_SYNC_MIN_GAP_MS) return this.autoSyncState;
    this.autoSyncRunning = this.runAutoSync().finally(() => {
      this.autoSyncRunning = null;
    });
    return this.autoSyncRunning;
  }

  /** 页面请求时顺带同步：最多等几秒，超时先返回现有数据，同步在后台继续 */
  private async syncByDate() {
    if (process.env.FINANCE_AUTO_SYNC === 'off') return;
    const job = this.autoSyncSessions().catch(() => this.autoSyncState);
    await Promise.race([job, new Promise((resolve) => setTimeout(resolve, AUTO_SYNC_WAIT_MS))]);
  }

  private async runAutoSync(): Promise<AutoSyncState> {
    const state: AutoSyncState = { at: null, completedDue: 0, synced: 0, skippedNoFee: 0, skippedLocked: 0, failed: 0 };
    const courses = await this.prisma.course.findMany({ where: { status: 1 }, select: { id: true } });
    const courseIds = courses.map((c) => c.id);
    if (courseIds.length) {
      state.completedDue = await this.completePastSessions(courseIds);
      const [sessions, records, paidIncomes] = await Promise.all([
        this.prisma.courseSession.findMany({
          where: { status: 'completed', courseId: { in: courseIds } },
          select: this.syncSessionSelect,
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.profitRecord.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, sessionDate: true } }),
        this.prisma.sessionIncome.findMany({ where: { courseId: { in: courseIds }, status: 'settled' }, select: { courseId: true, date: true } }),
      ]);
      const done = new Set(records.map((r) => `${r.courseId}|${r.sessionDate}`));
      const paid = new Set(paidIncomes.map((r) => `${r.courseId}|${r.date}`));
      const missing = sessions.filter((s) => !done.has(`${s.courseId}|${s.date}`) && !paid.has(`${s.courseId}|${s.date}`));
      const locked = await this.staff.fixedMonths(missing.map((s) => monthKey(s.date)));
      for (const session of missing) {
        if (locked.has(monthKey(session.date))) {
          state.skippedLocked += 1;
          continue;
        }
        try {
          const saved = await this.syncCourseSessionProfit(session);
          if (saved) state.synced += 1;
          else state.skippedNoFee += 1;
        } catch {
          state.failed += 1;
        }
      }
      // 课表删改后残留的未固定利润也清掉，避免财务课次比课表多
      const removed = await this.removeOrphanProfits(courseIds);
      if (removed) this.logger.log(`按日期自动同步：清理无课次利润 ${removed} 条`);
    }
    state.at = new Date().toISOString();
    this.autoSyncState = state;
    if (state.completedDue || state.synced) {
      this.logger.log(`按日期自动同步：完课 ${state.completedDue} 节，新记收益 ${state.synced} 节`);
    }
    return state;
  }

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
    const institutionId = income.organizationId || income.user?.organizationId || null;
    const rawCommission = institutionId ? (income.commission || 0) : 0;
    const teacherFee = institutionId
      ? income.teacherFee
      : (income.baseFee != null ? income.baseFee : income.teacherFee);
    const split = calculateSessionProfit({
      schoolPrice,
      sessionFee: income.baseFee,
      teacherFee,
      commission: rawCommission,
      settleToOrg: await this.settlesToOrg(institutionId),
    });

    // 已结算月且非强制重算：保留快照金额，仅纠正关联
    const useSnapshot = existing && existing.settlementStatus === 'settled' && !opts?.forceRecalc;
    const data = {
      sessionIncomeId: income.id,
      courseId: income.courseId,
      teacherId: income.userId,
      institutionId,
      sessionDate: income.date,
      totalAmount: useSnapshot ? existing.totalAmount : split.schoolPrice,
      refundAmount: 0,
      teacherAmount: useSnapshot ? existing.teacherAmount : split.teacherAmount,
      institutionAmount: useSnapshot ? existing.institutionAmount : split.institutionAmount,
      platformAmount: useSnapshot ? existing.platformAmount : split.platformAmount,
      sessionFee: useSnapshot ? existing.sessionFee : split.sessionFee,
      settleTo: useSnapshot ? existing.settleTo : split.settleTo,
      orgSettleAmount: useSnapshot ? existing.orgSettleAmount : split.orgSettleAmount,
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

  /** 机构设为「不展示金额」：课时费直接结算给机构 */
  private async settlesToOrg(organizationId?: number | null) {
    if (!organizationId) return false;
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { feeVisibility: true, status: true },
    });
    return !!org && org.status === 1 && org.feeVisibility === 'hidden';
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
        organizationId: true,
        orgCommissionMode: true,
        orgCommissionValue: true,
        organization: {
          select: { id: true, name: true, commissionMode: true, commissionValue: true, feeVisibility: true, status: true },
        },
        teacher: {
          select: {
            nickname: true,
            teacherCert: { select: { realName: true } },
            organization: {
              select: { id: true, name: true, commissionMode: true, commissionValue: true, feeVisibility: true, status: true },
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
      const fee = this.courseFeePreview(course);
      const preview = this.previewProfit(course.price, fee);
      result.push({
        id: course.id,
        title: course.title,
        school: course.school || '—',
        price: course.price,
        sessionFee: fee.baseFee,
        teacherFee: fee.teacherFee,
        teacherName: course.teacher?.teacherCert?.realName || course.teacher?.nickname || '未安排',
        organizationName: fee.organizationName || '—',
        splitMode: fee.splitMode,
        sessionTotal,
        syncableCount: completedCount + dueCount,
        preview,
      });
    }
    return result;
  }

  /** 课程收益预览：优先承接机构拆分，否则沿用教师所属机构另计分佣 */
  private courseFeePreview(course: {
    price: number;
    sessionFee?: number | null;
    organizationId?: number | null;
    orgCommissionMode?: string | null;
    orgCommissionValue?: number | null;
    organization?: OrgFeeInfo | null;
    teacher?: {
      organization?: OrgFeeInfo | null;
    } | null;
  }) {
    if (course.organizationId && course.organization?.status === 1) {
      const quote = calculateCourseOrgFee({
        schoolPrice: course.price,
        sessionFee: course.sessionFee,
        mode: course.orgCommissionMode || course.organization.commissionMode,
        value: course.orgCommissionValue != null ? course.orgCommissionValue : course.organization.commissionValue,
      });
      return {
        ...quote,
        organizationName: course.organization.name,
        organizationId: course.organization.id,
        settleToOrg: course.organization.feeVisibility === 'hidden',
      };
    }
    const org = course.teacher?.organization?.status === 1 ? course.teacher.organization : null;
    const fee = calculateFee({
      base: course.sessionFee ?? null,
      hasOrg: !!org,
      mode: org?.commissionMode,
      value: org?.commissionValue,
    });
    return {
      ...fee,
      organizationName: org?.name || null,
      organizationId: org?.id || null,
      settleToOrg: !!org && org.feeVisibility === 'hidden',
    };
  }

  private previewProfit(price: number, fee: ReturnType<FinanceService['courseFeePreview']>) {
    return calculateSessionProfit({
      schoolPrice: price,
      sessionFee: fee.baseFee,
      teacherFee: fee.teacherFee,
      commission: fee.commission || 0,
      commissionMode: fee.mode,
      commissionValue: fee.value,
      settleToOrg: fee.settleToOrg,
    });
  }

  /**
   * 同步课次收益（可勾选课程）：
   * - 承接机构课程：校方价 − 机构抽成 = 教师课时费；机构抽成归机构
   * - 无教师时仍按课程机构规则写机构所得，避免把抽成算进平台
   * - 先把勾选课程的到期课次标为已上，再按课次写利润快照
   */
  async syncAllSessions(opts?: { courseIds?: number[] }) {
    const courseIds = [...new Set((opts?.courseIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!courseIds.length) throw new BadRequestException('请先勾选要同步的课程');
    if (this.autoSyncRunning) await this.autoSyncRunning.catch(() => null);

    const stats = {
      completedDue: 0,
      synced: 0,
      skippedNoFee: 0,
      skippedError: 0,
      withTeacher: 0,
      withoutTeacher: 0,
      removedOrphans: 0,
      profitTotal: 0,
    };

    stats.completedDue = await this.completePastSessions(courseIds);

    const completed = await this.prisma.courseSession.findMany({
      where: { status: 'completed', courseId: { in: courseIds } },
      select: this.syncSessionSelect,
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

    stats.removedOrphans = await this.removeOrphanIncomes(courseIds)
      + await this.removeOrphanProfits(courseIds);

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

  private readonly syncSessionSelect = {
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
        organizationId: true,
        orgCommissionMode: true,
        orgCommissionValue: true,
        organization: {
          select: { id: true, name: true, commissionMode: true, commissionValue: true, feeVisibility: true, status: true },
        },
      },
    },
  } as const;

  /** 课次已删除/取消、也没有签到的课时收入（未固定、未打款）视为残留，清掉 */
  private async removeOrphanIncomes(courseIds: number[]) {
    const incomes = await this.prisma.sessionIncome.findMany({
      where: { courseId: { in: courseIds }, status: { not: 'settled' } },
      select: {
        id: true,
        userId: true,
        courseId: true,
        date: true,
        profitRecord: { select: { settlementMonth: true, settlementStatus: true } },
      },
    });
    if (!incomes.length) return 0;
    const [sessions, checks] = await Promise.all([
      this.prisma.courseSession.findMany({
        where: { courseId: { in: courseIds }, status: 'completed' },
        select: { courseId: true, date: true },
      }),
      this.prisma.checkIn.findMany({
        where: { courseId: { in: courseIds } },
        select: { userId: true, courseId: true, date: true },
      }),
    ]);
    const held = new Set(sessions.map((row) => `${row.courseId}|${row.date}`));
    const checked = new Set(checks.map((row) => `${row.userId}|${row.courseId}|${row.date}`));
    const monthOf = (row: (typeof incomes)[number]) => row.profitRecord?.settlementMonth || monthKey(row.date);
    const orphans = incomes.filter((row) => !held.has(`${row.courseId}|${row.date}`)
      && !checked.has(`${row.userId}|${row.courseId}|${row.date}`)
      && row.profitRecord?.settlementStatus !== 'settled');
    const locked = await this.staff.fixedMonths(orphans.map(monthOf));
    return this.staff.removeIncomes(orphans.filter((row) => !locked.has(monthOf(row))).map((row) => row.id));
  }

  /**
   * 清掉「课表里已没有对应已上课次」的未固定利润（含无 sessionIncome 的快照）。
   * 已固定月份、已打款不碰；有签到记录的日期保留。
   */
  private async removeOrphanProfits(courseIds: number[]) {
    if (!courseIds.length) return 0;
    const [profits, sessions, checks] = await Promise.all([
      this.prisma.profitRecord.findMany({
        where: { courseId: { in: courseIds }, settlementStatus: { not: 'settled' } },
        select: {
          id: true,
          courseId: true,
          sessionDate: true,
          settlementMonth: true,
          sessionIncomeId: true,
          teacherId: true,
        },
      }),
      this.prisma.courseSession.findMany({
        where: { courseId: { in: courseIds }, status: 'completed' },
        select: { courseId: true, date: true },
      }),
      this.prisma.checkIn.findMany({
        where: { courseId: { in: courseIds } },
        select: { userId: true, courseId: true, date: true },
      }),
    ]);
    if (!profits.length) return 0;
    const held = new Set(sessions.map((row) => `${row.courseId}|${row.date}`));
    const checked = new Set(checks.map((row) => `${row.courseId}|${row.date}`));
    const orphans = profits.filter((row) => {
      const key = `${row.courseId}|${row.sessionDate || ''}`;
      return !!row.sessionDate && !held.has(key) && !checked.has(key);
    });
    if (!orphans.length) return 0;
    const locked = await this.staff.fixedMonths(orphans.map((row) => row.settlementMonth || monthKey(row.sessionDate)));
    const removable = orphans.filter((row) => !locked.has(row.settlementMonth || monthKey(row.sessionDate)));
    if (!removable.length) return 0;
    const incomeIds = removable.map((row) => row.sessionIncomeId).filter((id): id is number => !!id);
    if (incomeIds.length) await this.staff.removeIncomes(incomeIds);
    const bareIds = removable.filter((row) => !row.sessionIncomeId).map((row) => row.id);
    if (bareIds.length) {
      await this.prisma.profitRecord.deleteMany({ where: { id: { in: bareIds } } });
    }
    return removable.length;
  }

  private assertDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new BadRequestException('生效日期格式应为 YYYY-MM-DD');
  }

  /** 已上完的课次中哪些日期不能改（月份已固定或已打款） */
  private async fixedSessionDates(courseId: number, dates: string[]) {
    const incomes = await this.prisma.sessionIncome.findMany({
      where: { courseId, date: { in: dates } },
      select: { date: true, status: true, profitRecord: { select: { settlementMonth: true, settlementStatus: true } } },
    });
    const locked = await this.staff.fixedMonths([
      ...dates.map((date) => monthKey(date)),
      ...incomes.map((row) => row.profitRecord?.settlementMonth || monthKey(row.date)),
    ]);
    const fixed = new Set(dates.filter((date) => locked.has(monthKey(date))));
    for (const row of incomes) {
      if (row.status === 'settled' || row.profitRecord?.settlementStatus === 'settled'
        || locked.has(row.profitRecord?.settlementMonth || monthKey(row.date))) fixed.add(row.date);
    }
    return fixed;
  }

  /** 换老师预览：生效日当天及之后已上完的课次，现在记在谁名下、能否改 */
  async teacherChangePreview(courseId: number, from: string) {
    this.assertDate(from);
    const today = this.formatDate(new Date());
    const sessions = await this.prisma.courseSession.findMany({
      where: {
        courseId,
        date: { gte: from },
        OR: [
          { status: 'completed' },
          { status: 'scheduled', completionMode: 'auto', date: { lt: today } },
        ],
      },
      select: { id: true, date: true, startTime: true },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    const dates = [...new Set(sessions.map((row) => row.date))];
    const [incomes, fixed] = await Promise.all([
      this.prisma.sessionIncome.findMany({
        where: { courseId, date: { in: dates } },
        orderBy: { id: 'asc' },
        select: {
          date: true,
          userId: true,
          user: { select: { nickname: true, phone: true, teacherCert: { select: { realName: true } } } },
        },
      }),
      this.fixedSessionDates(courseId, dates),
    ]);
    const list = sessions.map((row) => ({
      date: row.date,
      startTime: row.startTime,
      locked: fixed.has(row.date),
      teachers: incomes
        .filter((item) => item.date === row.date)
        .map((item) => ({
          id: item.userId,
          name: item.user?.teacherCert?.realName || item.user?.nickname || item.user?.phone || `#${item.userId}`,
        })),
    }));
    return {
      from,
      total: list.length,
      movable: list.filter((row) => !row.locked).length,
      locked: list.filter((row) => row.locked).length,
      list,
    };
  }

  /**
   * 换老师生效：from 当天及之后已上完、未固定的课次改算到新老师（teacherId 为空则改为不记老师）；
   * 之前的课保留原样，其中还没结算过的补记给原老师 prevTeacherId。
   */
  async applyTeacherChange(courseId: number, teacherId: number | null, from: string, prevTeacherId?: number | null) {
    this.assertDate(from);
    await this.completePastSessions([courseId]);
    const sessions = await this.prisma.courseSession.findMany({
      where: { courseId, status: 'completed', date: { gte: from } },
      select: this.syncSessionSelect,
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    const fixed = await this.fixedSessionDates(courseId, [...new Set(sessions.map((row) => row.date))]);
    let moved = 0;
    let failed = 0;
    for (const session of sessions) {
      if (fixed.has(session.date)) continue;
      try {
        if (!teacherId) {
          const incomes = await this.prisma.sessionIncome.findMany({
            where: { courseId, date: session.date },
            select: { id: true },
          });
          await this.staff.removeIncomes(incomes.map((row) => row.id));
        }
        await this.syncCourseSessionProfit(session, { teacherId: teacherId || null });
        moved += 1;
      } catch {
        failed += 1;
      }
    }

    let kept = 0;
    if (prevTeacherId && prevTeacherId !== teacherId) {
      const before = await this.prisma.courseSession.findMany({
        where: { courseId, status: 'completed', date: { lt: from } },
        select: this.syncSessionSelect,
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      });
      const beforeDates = [...new Set(before.map((row) => row.date))];
      const [incomeRows, profitRows] = await Promise.all([
        this.prisma.sessionIncome.findMany({ where: { courseId, date: { in: beforeDates } }, select: { date: true } }),
        this.prisma.profitRecord.findMany({ where: { courseId, sessionDate: { in: beforeDates } }, select: { sessionDate: true } }),
      ]);
      const settled = new Set([...incomeRows.map((row) => row.date), ...profitRows.map((row) => row.sessionDate)]);
      const beforeFixed = await this.fixedSessionDates(courseId, beforeDates);
      for (const session of before) {
        if (settled.has(session.date) || beforeFixed.has(session.date)) continue;
        try {
          await this.syncCourseSessionProfit(session, { teacherId: prevTeacherId });
          settled.add(session.date);
          kept += 1;
        } catch {
          failed += 1;
        }
      }
    }
    return { from, moved, kept, skippedLocked: sessions.filter((row) => fixed.has(row.date)).length, failed };
  }

  /**
   * 按课次写利润；有教师走 settle，无教师按课程承接机构规则拆分。
   * 已记过老师的课次沿用原老师（换老师只影响生效日之后），opts.teacherId 用于换老师时强制改算。
   */
  private async syncCourseSessionProfit(session: {
    courseId: number;
    date: string;
    semesterId: number;
    course?: {
      teacherId?: number | null;
      sessionFee?: number | null;
      price?: number | null;
      organizationId?: number | null;
      orgCommissionMode?: string | null;
      orgCommissionValue?: number | null;
      organization?: OrgFeeInfo | null;
    } | null;
  }, opts?: { teacherId?: number | null }) {
    const course = session.course?.organization !== undefined
      ? session.course
      : await this.prisma.course.findUnique({
          where: { id: session.courseId },
          select: {
            teacherId: true,
            sessionFee: true,
            price: true,
            organizationId: true,
            orgCommissionMode: true,
            orgCommissionValue: true,
            organization: {
              select: { id: true, name: true, commissionMode: true, commissionValue: true, feeVisibility: true, status: true },
            },
          },
        });
    if (!course) return null;

    let teacherId = opts && opts.teacherId !== undefined ? opts.teacherId : await this.staff.sessionTeacher(
      session.courseId,
      session.date,
      await this.resolveSessionTeacher({ courseId: session.courseId, semesterId: session.semesterId, course }),
    );

    let teacherAmount: number | null = null;
    let sessionFee: number | null = null;
    let institutionAmount = 0;
    let institutionId: number | null = null;
    let sessionIncomeId: number | null = null;

    if (teacherId) {
      const income = await this.staff.settle(teacherId, session.courseId, session.date, { exclusive: true });
      sessionIncomeId = income.id;
      teacherId = income.userId;
      if (income.status !== 'unconfigured' && income.teacherFee != null) {
        teacherAmount = Number(income.teacherFee);
        sessionFee = income.baseFee != null ? Number(income.baseFee) : teacherAmount;
        institutionAmount = Number(income.commission || 0);
        institutionId = income.organizationId || null;
      }
    }

    // 无教师或结算未配置：按课程承接机构规则拆分，避免把机构抽成算进平台
    if (teacherAmount == null) {
      const fee = this.courseFeePreview({
        price: Number(course.price) || 0,
        sessionFee: course.sessionFee,
        organizationId: course.organizationId,
        orgCommissionMode: course.orgCommissionMode,
        orgCommissionValue: course.orgCommissionValue,
        organization: course.organization || null,
      });
      if (!fee.configured || fee.teacherFee == null) {
        if (course.sessionFee == null || Number.isNaN(Number(course.sessionFee))) return null;
        teacherAmount = roundMoney(Number(course.sessionFee));
        sessionFee = teacherAmount;
        institutionAmount = 0;
        institutionId = null;
      } else {
        teacherAmount = roundMoney(Number(fee.teacherFee));
        sessionFee = fee.baseFee != null ? roundMoney(Number(fee.baseFee)) : teacherAmount;
        institutionAmount = roundMoney(Number(fee.commission || 0));
        institutionId = fee.organizationId || course.organizationId || null;
      }
    }

    // 无真实机构归属时不得记机构费（防止旧 grant 抽成残留）
    if (!institutionId) {
      if (sessionFee == null && teacherAmount != null) {
        sessionFee = roundMoney(Number(teacherAmount) + Number(institutionAmount || 0));
      } else if (sessionFee != null && teacherAmount != null && institutionAmount > 0) {
        teacherAmount = roundMoney(Number(sessionFee));
      }
      institutionAmount = 0;
    }

    const schoolPrice = roundMoney(Number(course.price) || 0);
    const split = calculateSessionProfit({
      schoolPrice,
      sessionFee,
      teacherFee: teacherAmount,
      commission: institutionAmount,
      settleToOrg: await this.settlesToOrg(institutionId),
    });

    const existing = (sessionIncomeId
      ? await this.prisma.profitRecord.findUnique({ where: { sessionIncomeId } })
      : null) || await this.prisma.profitRecord.findFirst({
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
      sessionFee: split.sessionFee,
      settleTo: split.settleTo,
      orgSettleAmount: split.orgSettleAmount,
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
    return term?.teacherId || session.course?.teacherId || null;
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

  /** 未固定月份：收益报表返回空（fixed 前不计入） */
  private async gateLocked(month?: string | null, scope?: Scope) {
    if (scope?.organizationId) return false;
    return !(await this.isMonthLocked(month));
  }

  /** 首页经营地图：各学校历史累计收入 / 成本 / 利润，与月份无关 */
  async schoolValues() {
    await this.syncByDate();
    const [schools, courses, records] = await Promise.all([
      this.prisma.school.findMany({ where: { status: 1 }, select: { id: true, name: true } }),
      this.prisma.course.findMany({ select: { id: true, school: true, schoolId: true } }),
      this.prisma.profitRecord.findMany({
        select: {
          courseId: true,
          totalAmount: true,
          refundAmount: true,
          teacherAmount: true,
          institutionAmount: true,
          platformAmount: true,
          settleTo: true,
          orgSettleAmount: true,
          sessionDate: true,
        },
      }),
    ]);
    const byName = new Map(schools.map((s) => [s.name.trim(), s.id]));
    const ids = new Set(schools.map((s) => s.id));
    const courseSchool = new Map<number, number>();
    for (const c of courses) {
      const sid = c.schoolId ?? byName.get(String(c.school || '').trim());
      if (sid && ids.has(sid)) courseSchool.set(c.id, sid);
    }

    const blank = () => ({
      income: 0,
      teacherCost: 0,
      orgCost: 0,
      otherCost: 0,
      profit: 0,
      sessionCount: 0,
      firstDate: '' as string,
      lastDate: '' as string,
    });
    const values = new Map(schools.map((s) => [s.id, blank()]));
    for (const r of records) {
      const v = values.get(courseSchool.get(r.courseId) as number);
      if (!v) continue;
      // 累计口径，不按月份截断。结算给机构时 orgSettleAmount 已含课时费，不能再加一遍机构抽成。
      const income = (r.totalAmount || 0) - (r.refundAmount || 0);
      const teacher = r.settleTo === 'org' ? 0 : Number(r.teacherAmount || 0);
      const org = r.settleTo === 'org'
        ? Number(r.orgSettleAmount || r.institutionAmount || 0)
        : Number(r.institutionAmount || 0);
      v.income += income;
      v.teacherCost += teacher;
      v.orgCost += org;
      v.profit += income - teacher - org;
      v.sessionCount += 1;
      if (r.sessionDate && (!v.firstDate || r.sessionDate < v.firstDate)) v.firstDate = r.sessionDate;
      if (r.sessionDate && r.sessionDate > v.lastDate) v.lastDate = r.sessionDate;
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const list = [...values.entries()].map(([schoolId, v]) => ({
      schoolId,
      income: round(v.income),
      teacherCost: round(v.teacherCost),
      orgCost: round(v.orgCost),
      otherCost: round(Math.abs(v.otherCost) < 0.005 ? 0 : v.otherCost),
      profit: round(v.profit),
      sessionCount: v.sessionCount,
      firstDate: v.firstDate || null,
      lastDate: v.lastDate || null,
    }));
    const sum = (key: 'income' | 'teacherCost' | 'orgCost' | 'otherCost' | 'profit') =>
      round(list.reduce((total, item) => total + item[key], 0));
    const dates = list.map((v) => v.firstDate).filter(Boolean).sort();
    return {
      schools: list,
      totals: {
        income: sum('income'),
        teacherCost: sum('teacherCost'),
        orgCost: sum('orgCost'),
        otherCost: sum('otherCost'),
        profit: sum('profit'),
        since: dates[0] || null,
      },
      autoSync: this.autoSyncState,
    };
  }

  async overview(month?: string, scope?: Scope) {
    await this.syncByDate();
    await this.ensureMonthStatuses();
    const target = month || monthKey(new Date());
    const prev = prevMonthKey(target);

    if (await this.gateLocked(target, scope)) {
      const pending = await this.prisma.profitRecord.findMany({
        where: this.whereScope(scope, target),
        select: { totalAmount: true, refundAmount: true },
      });
      const empty: any = {
        month: target,
        autoSync: this.autoSyncState,
        unlocked: {
          sessionCount: pending.length,
          totalAmount: roundMoney(pending.reduce((acc, r) => acc + Number(r.totalAmount || 0) - Number(r.refundAmount || 0), 0)),
        },
        settlementStatus: this.defaultMonthStatus(target),
        current: { totalAmount: 0, teacherAmount: 0, institutionAmount: 0, platformAmount: 0, profitRate: 0, orderCount: 0, revenueChange: 0, teacherSharePct: 0, institutionSharePct: 0, platformSharePct: 0 },
        previous: { totalAmount: 0, teacherAmount: 0, institutionAmount: 0, platformAmount: 0, profitRate: 0, orderCount: 0 },
        trend: [],
        courseRank: [],
      };
      return empty;
    }

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
      autoSync: this.autoSyncState,
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
    const all = await this.prisma.monthlySettlement.findMany({
      where: { month: { gte: from.slice(0, 7), lte: to.slice(0, 7) } },
    });
    const lockedSet = new Set(all.filter((s) => s.locked).map((s) => s.month));
    if (opts.scope?.organizationId) {
      // 机构口径：按已固定月份过滤
      const rows = await this.prisma.profitRecord.findMany({
        where: { ...this.whereScope(opts.scope, undefined, from, to), settlementMonth: { in: [...lockedSet] } },
      });
      return this.bucketMonthly(rows, opts, all);
    }
    // 总口径：未固定月份返回空（报表只统计已固定月份）
    const rows = await this.prisma.profitRecord.findMany({
      where: { ...this.whereScope(undefined, undefined, from, to), settlementMonth: { in: [...lockedSet] } },
    });
    return this.bucketMonthly(rows, opts, all);
  }

  private bucketMonthly(rows: any[], opts: { group?: string }, all: any[]) {
    const settleMap = Object.fromEntries(all.map((s) => [s.month, s.status]));
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
    if (await this.gateLocked(month, scope)) return [];
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
    if (await this.gateLocked(target, scope)) return [];
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
    if (await this.gateLocked(target, scope)) {
      return {
        teacherId,
        name: '—',
        month: target,
        courses: [],
        lessonCount: 0,
        totalAmount: 0,
        teacherAmount: 0,
        institutionAmount: 0,
        platformAmount: 0,
        profitRate: 0,
        orderCount: 0,
      };
    }
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
    if (await this.gateLocked(target, scope)) return [];
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
        orgSettleAmount: 0,
        platformAmount: 0,
      };
      cur.courseIds.add(row.courseId);
      cur.totalAmount = roundMoney(cur.totalAmount + row.totalAmount - (row.refundAmount || 0));
      cur.institutionAmount = roundMoney(cur.institutionAmount + row.institutionAmount);
      cur.orgSettleAmount = roundMoney(cur.orgSettleAmount + (row.orgSettleAmount || row.institutionAmount));
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
        orgSettleAmount: item.orgSettleAmount,
        platformAmount: scope?.hidePlatform ? undefined : item.platformAmount,
      }))
      .sort((a, b) => b.institutionAmount - a.institutionAmount);
  }

  async orgDetail(organizationId: number, month?: string, scope?: Scope) {
    const target = month || monthKey(new Date());
    if (await this.gateLocked(target, scope)) {
      const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
      if (!org) throw new NotFoundException('机构不存在');
      return {
        organizationId,
        name: org.name,
        month: target,
        courses: [],
        totalAmount: 0,
        teacherAmount: 0,
        institutionAmount: 0,
        platformAmount: 0,
        profitRate: 0,
        orderCount: 0,
      };
    }
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

  /**
   * 机构利润明细：按「机构 + 课程」汇总已同步课次
   *   校方价格 − 课时费 = 平台利润；课时费 − 机构利润 = 教师所得
   *   机构不展示金额时整笔课时费结算给机构
   */
  async orgProfitDetail(opts: { month?: string; from?: string; to?: string; organizationId?: number | null }) {
    // 只统计已固定月份
    const all = await this.prisma.monthlySettlement.findMany({ select: { month: true, locked: true } });
    const lockedSet = new Set(all.filter((s) => s.locked).map((s) => s.month));
    const where: any = { institutionId: opts.organizationId ? opts.organizationId : { not: null }, settlementMonth: { in: [...lockedSet] } };
    if (opts.month) {
      where.settlementMonth = opts.month;
      if (!lockedSet.has(opts.month)) {
        const orgs = await this.prisma.organization.findMany({
          orderBy: { id: 'desc' },
          select: { id: true, name: true, feeVisibility: true, status: true },
        });
        return {
          list: [],
          total: {
            sessionCount: 0,
            schoolAmount: 0,
            sessionFeeAmount: 0,
            institutionAmount: 0,
            teacherAmount: 0,
            orgSettleAmount: 0,
            platformAmount: 0,
          },
          orgs: orgs.map((org) => ({ id: org.id, name: org.name, status: org.status, settleToOrg: org.feeVisibility === 'hidden' })),
        };
      }
    } else if (opts.from || opts.to) {
      const range: any = { in: [...lockedSet] };
      if (opts.from) range.gte = opts.from.slice(0, 7);
      if (opts.to) range.lte = opts.to.slice(0, 7);
      where.settlementMonth = range;
    }
    const [rows, orgs] = await Promise.all([
      this.prisma.profitRecord.findMany({
        where,
        orderBy: [{ sessionDate: 'asc' }, { id: 'asc' }],
        include: {
          institution: { select: { id: true, name: true } },
          course: { select: { id: true, title: true, school: true } },
          teacher: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
        },
      }),
      this.prisma.organization.findMany({
        orderBy: { id: 'desc' },
        select: { id: true, name: true, feeVisibility: true, status: true },
      }),
    ]);

    const empty = () => ({
      sessionCount: 0,
      schoolAmount: 0,
      sessionFeeAmount: 0,
      institutionAmount: 0,
      teacherAmount: 0,
      orgSettleAmount: 0,
      platformAmount: 0,
    });
    const add = (acc: ReturnType<typeof empty>, row: (typeof rows)[number]) => {
      const school = row.totalAmount - (row.refundAmount || 0);
      // 老快照没有课时费：用 教师 + 机构 反推
      const fee = row.sessionFee ?? (row.teacherAmount + row.institutionAmount);
      acc.sessionCount += 1;
      acc.schoolAmount = roundMoney(acc.schoolAmount + school);
      acc.sessionFeeAmount = roundMoney(acc.sessionFeeAmount + fee);
      acc.institutionAmount = roundMoney(acc.institutionAmount + row.institutionAmount);
      acc.teacherAmount = roundMoney(acc.teacherAmount + row.teacherAmount);
      acc.orgSettleAmount = roundMoney(acc.orgSettleAmount + (row.orgSettleAmount || row.institutionAmount));
      acc.platformAmount = roundMoney(acc.platformAmount + row.platformAmount);
    };

    const groups = new Map<string, any>();
    const total = empty();
    for (const row of rows) {
      const key = `${row.institutionId}|${row.courseId}`;
      let cur = groups.get(key);
      if (!cur) {
        cur = {
          key,
          organizationId: row.institutionId,
          organizationName: row.institution?.name || `机构#${row.institutionId}`,
          courseId: row.courseId,
          courseTitle: row.course?.title || `课程#${row.courseId}`,
          school: row.course?.school || '—',
          teacherNames: new Set<string>(),
          settleTo: row.settleTo || 'teacher',
          months: new Set<string>(),
          ...empty(),
        };
        groups.set(key, cur);
      }
      if (row.teacherId) {
        cur.teacherNames.add(row.teacher?.teacherCert?.realName || row.teacher?.nickname || `教师#${row.teacherId}`);
      }
      if (row.settleTo === 'org') cur.settleTo = 'org';
      cur.months.add(row.settlementMonth);
      add(cur, row);
      add(total, row);
    }

    const list = [...groups.values()]
      .map((item) => ({
        ...item,
        teacherNames: [...item.teacherNames].join('、') || '未排老师',
        months: [...item.months].sort(),
        unitSchoolPrice: item.sessionCount ? roundMoney(item.schoolAmount / item.sessionCount) : 0,
        unitSessionFee: item.sessionCount ? roundMoney(item.sessionFeeAmount / item.sessionCount) : 0,
      }))
      .sort((a, b) => a.organizationName.localeCompare(b.organizationName, 'zh') || b.schoolAmount - a.schoolAmount);

    return {
      list,
      total,
      orgs: orgs.map((org) => ({
        id: org.id,
        name: org.name,
        status: org.status,
        settleToOrg: org.feeVisibility === 'hidden',
      })),
    };
  }

  /**
   * 月度结算单：按「学校 + 课程」汇总已同步课次
   *   上课数量、教师、校方价格、课时费、机构费、教师费、校方合计、成本合计、利润
   *   机构设为「不看金额」：教师费记 0，机构费记整笔课时费（成本不变）
   */
  async monthlyStatement(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
    await this.syncByDate();
    const settlement = await this.prisma.monthlySettlement.findUnique({ where: { month } });
    const locked = !!settlement?.locked;

    const rows = await this.prisma.profitRecord.findMany({
      where: { settlementMonth: month },
      orderBy: [{ sessionDate: 'asc' }, { id: 'asc' }],
      include: {
        course: {
          select: {
            id: true,
            title: true,
            school: true,
            price: true,
            sessionFee: true,
            organizationId: true,
            organization: { select: { id: true, name: true, status: true } },
            teacher: { select: { id: true, nickname: true, teacherCert: { select: { realName: true } } } },
          },
        },
        teacher: {
          select: {
            id: true,
            nickname: true,
            organizationId: true,
            organization: { select: { id: true, name: true, status: true } },
            teacherCert: { select: { realName: true } },
          },
        },
        institution: { select: { id: true, name: true } },
      },
    });

    const groups = new Map<string, any>();
    const total: any = {
      sessionCount: 0,
      schoolAmount: 0,
      sessionFeeAmount: 0,
      institutionAmount: 0,
      teacherAmount: 0,
      costAmount: 0,
      profitAmount: 0,
    };
    const round = (value: number) => Math.round(value * 100) / 100;
    /** 未固定：按课程承接机构 / 教师当前绑定机构刷新；已固定：沿用结算快照 */
    const resolveOrg = (row: (typeof rows)[number]) => {
      const courseOrg = row.course?.organization?.status === 1 ? row.course.organization : null;
      const teacherOrg = row.teacher?.organization?.status === 1 ? row.teacher.organization : null;
      if (!locked) {
        const live = courseOrg || teacherOrg || null;
        return {
          hasOrg: !!live,
          organizationId: live?.id || null,
          organizationName: live?.name || null,
        };
      }
      const snap = row.institution || courseOrg || teacherOrg || null;
      const hasOrg = !!(row.institutionId || row.course?.organizationId || row.teacher?.organizationId);
      return {
        hasOrg,
        organizationId: hasOrg ? (row.institutionId || snap?.id || row.course?.organizationId || row.teacher?.organizationId || null) : null,
        organizationName: hasOrg ? (snap?.name || null) : null,
      };
    };
    const add = (acc: any, row: (typeof rows)[number]) => {
      const school = round(Number(row.totalAmount || 0) - Number(row.refundAmount || 0));
      const fee = round(Number(
        row.sessionFee != null
          ? row.sessionFee
          : (Number(row.teacherAmount || 0) + Number(row.institutionAmount || 0)),
      ));
      const { hasOrg } = resolveOrg(row);
      let teacherAmt = round(Number(row.teacherAmount || 0));
      let instAmt = round(Number(row.institutionAmount || 0));
      if (!hasOrg) {
        // 无机构归属：机构费清零；教师费按课时费全额，避免把历史分佣加进教师
        teacherAmt = fee > 0 ? fee : teacherAmt;
        instAmt = 0;
      } else if (row.settleTo === 'org') {
        teacherAmt = 0;
        instAmt = round(Number(row.orgSettleAmount ?? row.institutionAmount ?? 0));
      }
      const cost = round(teacherAmt + instAmt);
      acc.sessionCount += 1;
      acc.schoolAmount = round(acc.schoolAmount + school);
      acc.sessionFeeAmount = round(acc.sessionFeeAmount + fee);
      acc.institutionAmount = round(acc.institutionAmount + instAmt);
      acc.teacherAmount = round(acc.teacherAmount + teacherAmt);
      acc.costAmount = round(acc.costAmount + cost);
      acc.profitAmount = round(acc.profitAmount + (school - cost));
    };

    for (const row of rows) {
      // 按 课程 + 实际结算教师 分组，同一课程多位老师各占一行，金额与教师一一对应
      const key = `${row.courseId}|${row.teacherId ?? 0}`;
      let cur = groups.get(key);
      if (!cur) {
        const c = row.course;
        const t = row.teacher;
        const org = resolveOrg(row);
        const teacherLabel = t?.teacherCert?.realName || t?.nickname || '';
        let teacherName = teacherLabel || '—';
        if (row.settleTo === 'org') {
          // 课时费整笔结算给机构：教师列标明机构，避免误看成个人课时费
          teacherName = org.organizationName
            ? `机构结算 · ${org.organizationName}`
            : '机构结算';
        } else if (!teacherLabel && org.organizationName) {
          // 未排老师但有承接机构：标明归属机构（机构费仍按抽成记）
          teacherName = `机构承接 · ${org.organizationName}`;
        }
        cur = {
          courseId: row.courseId,
          teacherId: row.teacherId ?? null,
          courseTitle: c?.title || `课程#${row.courseId}`,
          school: c?.school || '—',
          teacherName,
          settleTo: row.settleTo || 'teacher',
          organizationId: org.organizationId,
          organizationName: org.organizationName,
          hasOrg: org.hasOrg,
          sessionCount: 0,
          sessionDates: [] as string[],
          schoolPrice: c?.price ?? 0,
          sessionFee: row.sessionFee ?? c?.sessionFee ?? 0,
          // 单节展示用（首条快照；无机构时强制 0）
          institutionFee: 0,
          teacherFee: 0,
          schoolAmount: 0,
          sessionFeeAmount: 0,
          institutionAmount: 0,
          teacherAmount: 0,
          costAmount: 0,
          profitAmount: 0,
        };
        groups.set(key, cur);
      }
      if (row.sessionDate && !cur.sessionDates.includes(row.sessionDate)) {
        cur.sessionDates.push(row.sessionDate);
      }
      add(cur, row);
      // 用累计反推单节均价，保证「机构费/教师费」与「校方价格/课时费」同为单节口径
      if (cur.sessionCount > 0) {
        cur.institutionFee = round(cur.institutionAmount / cur.sessionCount);
        cur.teacherFee = round(cur.teacherAmount / cur.sessionCount);
      }
      add(total, row);
    }

    const list = [...groups.values()]
      .map((item) => ({ ...item, sessionDates: [...(item.sessionDates || [])].sort() }))
      .sort((a, b) => (a.school || '').localeCompare(b.school || '', 'zh') || b.schoolAmount - a.schoolAmount);

    // 学校小计
    const schoolMap = new Map<string, any>();
    for (const item of list) {
      const cur = schoolMap.get(item.school) || {
        school: item.school,
        sessionCount: 0,
        schoolAmount: 0,
        sessionFeeAmount: 0,
        institutionAmount: 0,
        teacherAmount: 0,
        costAmount: 0,
        profitAmount: 0,
      };
      cur.sessionCount += item.sessionCount;
      cur.schoolAmount = round(cur.schoolAmount + item.schoolAmount);
      cur.sessionFeeAmount = round(cur.sessionFeeAmount + item.sessionFeeAmount);
      cur.institutionAmount = round(cur.institutionAmount + item.institutionAmount);
      cur.teacherAmount = round(cur.teacherAmount + item.teacherAmount);
      cur.costAmount = round(cur.costAmount + item.costAmount);
      cur.profitAmount = round(cur.profitAmount + item.profitAmount);
      schoolMap.set(item.school, cur);
    }

    return {
      month,
      locked,
      lockedAt: locked ? settlement?.lockedAt || null : null,
      settled: settlement?.status === 'settled',
      list,
      schoolTotals: [...schoolMap.values()],
      total,
    };
  }

  /** 确认后固定该月结算单：固定后各收益报表才统计该月 */
  async lockMonth(month: string, adminId?: number, note?: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
    const stmt = await this.monthlyStatement(month);
    if (stmt.locked) throw new BadRequestException('该月已固定，如需修改请先解除固定');
    const now = new Date();
    const data = {
      status: 'settled' as const,
      locked: true,
      lockedAt: now,
      lockedBy: adminId || null,
      settledAt: now,
      settledBy: adminId || null,
      totalAmount: stmt.total.schoolAmount,
      teacherAmount: stmt.total.teacherAmount,
      institutionAmount: stmt.total.institutionAmount,
      platformAmount: stmt.total.profitAmount,
      costAmount: stmt.total.costAmount,
      sessionCount: stmt.total.sessionCount,
      orderCount: stmt.total.sessionCount,
      note: note || null,
    };
    await this.prisma.profitRecord.updateMany({
      where: { settlementMonth: month, settlementStatus: 'pending' },
      data: { settlementStatus: 'settled', settledAt: now },
    });
    return this.prisma.monthlySettlement.upsert({
      where: { month },
      create: { month, ...data },
      update: data,
    });
  }

  /** 解除固定：可重新调整并重新固定 */
  async unlockMonth(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
    await this.prisma.monthlySettlement.update({
      where: { month },
      data: { locked: false, lockedAt: null, lockedBy: null },
    });
    return { ok: true };
  }

  /** 该月是否已固定（未固定时收益报表不统计） */
  async isMonthLocked(month?: string | null): Promise<boolean> {
    const key = month || monthKey(new Date());
    if (!/^\d{4}-\d{2}$/.test(key)) return true;
    const row = await this.prisma.monthlySettlement.findUnique({ where: { month: key }, select: { locked: true } });
    return !!row?.locked;
  }

  async settleMonth(month: string, adminId?: number, note?: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
    const stmt = await this.monthlyStatement(month);
    if (stmt.locked) throw new BadRequestException('该月已固定，请先解除固定再调整');
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
        totalAmount: stmt.total.schoolAmount,
        teacherAmount: stmt.total.teacherAmount,
        institutionAmount: stmt.total.institutionAmount,
        platformAmount: stmt.total.profitAmount,
        costAmount: stmt.total.costAmount,
        sessionCount: stmt.total.sessionCount,
        orderCount: stmt.total.sessionCount,
        settledAt: now,
        settledBy: adminId || null,
        note: note || null,
      },
      update: {
        status: 'settled',
        totalAmount: stmt.total.schoolAmount,
        teacherAmount: stmt.total.teacherAmount,
        institutionAmount: stmt.total.institutionAmount,
        platformAmount: stmt.total.profitAmount,
        costAmount: stmt.total.costAmount,
        sessionCount: stmt.total.sessionCount,
        orderCount: stmt.total.sessionCount,
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
        organizationId: true,
        orgCommissionMode: true,
        orgCommissionValue: true,
        organization: {
          select: {
            id: true,
            name: true,
            commissionMode: true,
            commissionValue: true,
            feeVisibility: true,
            status: true,
          },
        },
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
                status: true,
              },
            },
          },
        },
      },
      take: 200,
    });

    return courses.map((c) => {
      const fee = this.courseFeePreview(c);
      const preview = this.previewProfit(c.price, fee);
      return {
        id: c.id,
        title: c.title,
        price: c.price,
        sessionFee: c.sessionFee,
        teacherFee: fee.teacherFee,
        settleToOrg: fee.settleToOrg,
        school: c.school || '—',
        teacherName: c.teacher?.teacherCert?.realName || c.teacher?.nickname || '未安排',
        organizationName: fee.organizationName || '—',
        organizationId: c.organizationId || c.teacher?.organizationId || null,
        commissionMode: fee.mode,
        commissionValue: fee.value ?? 0,
        splitMode: fee.splitMode || 'none',
        visibility: fee.visibility || 'final',
        preview,
      };
    });
  }

  /** 收益规则：改课程校方价格 / 课时费；承接机构课程同步刷新教师实得 */
  async saveCourseRule(courseId: number, body: any) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { organization: true },
    });
    if (!course) throw new NotFoundException('课程不存在');
    const data: any = {};
    if (body.price !== undefined && body.price !== '') data.price = Number(body.price);
    if (body.sessionFee !== undefined) {
      data.sessionFee = body.sessionFee === '' || body.sessionFee == null ? null : Number(body.sessionFee);
    }
    if (!Object.keys(data).length) throw new BadRequestException('没有可保存的字段');
    const courseOrg = !!(course.organizationId && course.organization?.status === 1);
    if (courseOrg) {
      const sessionFee = data.sessionFee !== undefined ? data.sessionFee : course.sessionFee;
      if (sessionFee == null || !(Number(sessionFee) > 0)) {
        throw new BadRequestException('承接机构课程必须填写课时费（机构抽成按课时费计算）');
      }
      const mode = course.orgCommissionMode || course.organization!.commissionMode;
      const value = course.orgCommissionValue != null ? course.orgCommissionValue : course.organization!.commissionValue;
      if (mode === 'fixed' && Number(value || 0) > Number(sessionFee)) {
        throw new BadRequestException(`课时费不能低于机构固定抽成 ¥${Number(value || 0)}`);
      }
    }
    const saved = await this.prisma.course.update({ where: { id: courseId }, data });
    if (courseOrg) await this.staff.refreshCourseOrgGrants(courseId);
    return saved;
  }

  async getSplitConfig(): Promise<SplitConfig> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SPLIT_CONFIG_KEY } });
    let saved: any = {};
    try {
      saved = row?.value ? JSON.parse(row.value) : {};
    } catch {
      saved = {};
    }
    return normalizeSplitConfig({ ...DEFAULT_SPLIT_CONFIG, ...saved });
  }

  async saveSplitConfig(body: any) {
    const current = await this.getSplitConfig();
    const next = normalizeSplitConfig({ ...current, ...(body || {}) });
    if (next.taxRate < 0 || next.taxRate >= 100) throw new BadRequestException('税率应在 0 ~ 100% 之间');
    if (next.feeUnit < 0) throw new BadRequestException('手续费不能为负数');
    if (!(next.feeStep > 0)) throw new BadRequestException('手续费档位金额须大于 0');
    await this.prisma.appSetting.upsert({
      where: { key: SPLIT_CONFIG_KEY },
      create: { key: SPLIT_CONFIG_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
    return next;
  }

  /**
   * 分成比例页：合集与比例是通用规则（不分月份），每月套用当月结算单金额计算。
   * 返回所选月份的按课程汇总金额，以及截至该月最近 historyMonths 个月的金额（前端据此实时计算分成）。
   */
  async splitOverview(month?: string, historyMonths = 6) {
    const key = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(new Date());
    const span = Math.min(Math.max(Math.floor(Number(historyMonths) || 6), 1), 12);
    const [year, mon] = key.split('-').map(Number);
    const months: string[] = [];
    for (let i = span - 1; i >= 0; i -= 1) months.push(monthKey(new Date(year, mon - 1 - i, 1)));

    const [history, config, collections, courses, users, savedConfig] = await Promise.all([
      Promise.all(months.map((m) => this.splitMonthStats(m))),
      this.getSplitConfig(),
      this.loadSplitCollections(),
      this.prisma.course.findMany({
        orderBy: { id: 'desc' },
        select: { id: true, title: true, school: true, status: true },
        take: 1000,
      }),
      this.splitUsers(),
      this.prisma.appSetting.findUnique({ where: { key: SPLIT_CONFIG_KEY }, select: { key: true } }),
    ]);
    const current = history[history.length - 1];

    return {
      month: key,
      locked: current.locked,
      config,
      configSaved: !!savedConfig,
      collections,
      courses: courses.map((c) => ({ id: c.id, title: c.title, school: c.school || '—', status: c.status })),
      users,
      stats: current.stats,
      reimbursements: current.reimbursements,
      history,
    };
  }

  /** 可选为分成人员的用户 */
  private async splitUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { id: 'asc' }],
      select: { id: true, nickname: true, phone: true, role: true, status: true, teacherCert: { select: { realName: true } } },
      take: 3000,
    });
    return users.map((u) => ({
      id: u.id,
      name: this.splitUserName(u),
      role: u.role,
      status: u.status,
      phoneTail: u.phone ? String(u.phone).slice(-4) : '',
    }));
  }

  private splitUserName(u: { id: number; nickname?: string | null; phone?: string | null; teacherCert?: { realName?: string | null } | null }) {
    return u.teacherCert?.realName || u.nickname || (u.phone ? `用户${String(u.phone).slice(-4)}` : `用户#${u.id}`);
  }

  /** 合集列表；绑定用户的分成人员姓名按用户当前姓名刷新 */
  private async loadSplitCollections() {
    const rows = await this.prisma.splitCollection.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] });
    const collections = rows.map((row) => this.toSplitCollection(row));
    const ids = [...new Set(collections.flatMap((c) => c.members.map((m) => m.userId).filter(Boolean) as number[]))];
    if (!ids.length) return collections;
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, nickname: true, phone: true, teacherCert: { select: { realName: true } } },
    });
    const names = new Map(users.map((u) => [u.id, this.splitUserName(u)]));
    for (const c of collections) {
      for (const m of c.members) if (m.userId && names.has(m.userId)) m.name = names.get(m.userId)!;
    }
    return collections;
  }

  /** 财务打款：教师课时费（每人每月一笔）+ 分成收款人（同一人跨合集合并为一笔）+ 报销，同一人合并一笔打款 */
  async splitPayouts(month?: string) {
    const { calcs, ...rest } = await this.buildSplitPayouts(month);
    void calcs;
    return rest;
  }

  /**
   * 分成打款单：结算单未固定时是试算单（金额可能变化），固定后即最终打款单。
   * 只读角色（股东）也能看，所以只返回展示字段，不含打款记录 ID、操作人等内部信息。
   */
  async splitSheet(month?: string) {
    const { calcs, ...payout } = await this.buildSplitPayouts(month);
    const settlement = await this.prisma.monthlySettlement.findUnique({
      where: { month: payout.month },
      select: { lockedAt: true },
    });
    const payeeFee = (p: any) => (p.feeBy === 'payee' ? Number(p.fee || 0) : 0);
    const parts = (p: any) => {
      const out: { label: string; amount: number }[] = [];
      if (p.kind === 'teacher') out.push({ label: '课时费', amount: roundMoney(p.gross - payeeFee(p)) });
      if (p.kind === 'org') out.push({ label: '机构抽成', amount: roundMoney(p.gross - payeeFee(p)) });
      if (p.kind === 'both' && p.teacherPart) out.push({ label: '课时费', amount: p.teacherPart.net });
      if (p.kind === 'split' || p.kind === 'both') {
        for (const i of p.items || []) {
          if (i?.collectionName) out.push({ label: `${i.collectionName} · ${i.ratio}%`, amount: Number(i.net || 0) });
        }
      }
      if (p.reimburse?.total) out.push({ label: `报销（${p.reimburse.items.length} 笔）`, amount: p.reimburse.total });
      return out;
    };
    const cfg = payout.config;
    const byKey = new Map<string, any>(payout.list.map((p: any) => [p.key, p]));
    return {
      month: payout.month,
      final: payout.locked,
      lockedAt: payout.locked ? settlement?.lockedAt || null : null,
      generatedAt: new Date(),
      config: payout.config,
      notes: this.sheetNotes(cfg),
      collections: calcs.map((c) => ({
        id: c.id,
        name: c.name,
        sessionCount: c.sessionCount,
        schoolAmount: c.schoolAmount,
        profitAmount: c.profitAmount,
        base: c.base,
        teacherFeeTotal: c.teacherFeeTotal,
        orgFeeTotal: c.orgFeeTotal,
        reimburseTotal: c.reimburseTotal,
        pool: c.pool,
        members: c.members.map((m) => ({
          name: m.name,
          ratio: m.ratio,
          gross: m.gross,
          tax: m.tax,
          fee: m.fee,
          net: m.net,
          note: this.memberFeeNote(c.id, m, byKey.get(m.key), cfg),
        })),
      })),
      payees: payout.list.map((p: any) => ({
        key: p.key,
        kind: p.kind,
        name: p.name,
        gross: p.gross,
        tax: p.tax,
        fee: payeeFee(p),
        reimburse: Number(p.reimburse?.total || 0),
        net: p.net,
        parts: parts(p),
        feeNote: this.payeeFeeNote(p, cfg),
        status: p.status,
        paidAt: p.paidAt,
        paidNet: p.paidNet,
        changed: !!p.changed,
      })),
      totals: payout.totals,
    };
  }

  /** 结算单「计算说明」：按当前配置生成，发给股东核对用 */
  private sheetNotes(cfg: SplitConfig) {
    const step = Number(cfg.feeStep) || 0;
    const unit = Number(cfg.feeUnit) || 0;
    const basis = cfg.basis === 'school' ? '校方金额' : '利润（校方金额 − 课时费等成本）';
    const poolCuts = [cfg.teacherFee ? '教师课时费转账手续费' : '', cfg.orgFee ? '机构转账手续费' : '', '计入该合集的报销'].filter(Boolean);
    return [
      `分成池 = ${basis} − ${poolCuts.join(' − ')}。`,
      `成员应分 = 分成池 × 分成比例；税费 = 应分 × ${Number(cfg.taxRate) || 0}%，从每人应分中代扣，留在对公账户用于缴税，不参与分配。比例合计不足 100% 的部分为「留存」，同样留在对公账户。`,
      step > 0
        ? `转账手续费按每笔转账金额计：每 ${yuan(step)} 收 ${yuan(unit)}，不足 ${yuan(step)} 也按一档（例如 ${yuan(step * 1.2)} 收 ${yuan(unit * 2)}）。`
        : '转账不收手续费。',
      `教师课时费：每位教师当月所有课合并为一笔转账，手续费${cfg.teacherFee ? '由平台承担，按课时费金额摊到各合集分成池中扣除，教师全额到账' : '从课时费中扣除'}。`
        + `机构款同样每月一笔，手续费${cfg.orgFee ? '由平台承担、从分成池扣除' : '从机构款中扣除'}。`,
      cfg.memberFee
        ? '分成人员到账扣转账手续费。同一人当月在多个合集都有分成、或同时领课时费的，合并为一笔转账，手续费按合计金额只收一次；合并后由分成承担的手续费，按各合集应分金额比例分摊，所以单个合集里会出现带零头的手续费，加起来仍是整档。'
        : '分成人员到账不扣转账手续费。',
      '报销款随同一笔转账发放，不扣税、不扣手续费。实发 = 应分 − 税费 − 手续费 + 报销。',
    ];
  }

  /** 合集成员行：与其他合集或本人课时费合并打款时，说明手续费为什么不是整档 */
  private memberFeeNote(collectionId: number, member: any, payee: any, cfg: SplitConfig) {
    if (!payee) return '';
    const items: any[] = payee.items || [];
    const withTeacher = payee.kind === 'both';
    if (items.length < 2 && !withTeacher) return '';
    const others = items.filter((i) => i.collectionId !== collectionId).map((i) => `「${i.collectionName}」的分成`);
    if (withTeacher) others.push('本人课时费');
    let text = `与${others.join('、')}合并为一笔转账，手续费只收一次`;
    if (!cfg.memberFee) return `${text}；分成到账不扣手续费`;
    const splitFee = roundMoney(items.reduce((acc, i) => acc + Number(i.fee || 0), 0));
    if (splitFee > 0) {
      text += items.length > 1
        ? `；分成部分共承担 ${yuan(splitFee)}，按各合集应分金额比例分摊，本合集承担 ${yuan(member.fee)}`
        : `；分成部分承担合并后多出的 ${yuan(splitFee)}`;
    } else {
      text += '；合并后未跨档，分成部分不再收手续费';
    }
    return text;
  }

  /** 打款单每行的手续费说明 */
  private payeeFeeNote(p: any, cfg: SplitConfig) {
    const step = Number(cfg.feeStep) || 0;
    const tiers = (amount: number) => (amount > 0 && step > 0 ? Math.ceil(roundMoney(amount) / step) : 0);
    const feeText = (amount: number) => `${yuan(transferFee(amount, cfg))}（${tiers(amount)} 档）`;
    const items: any[] = p.items || [];
    const shares = () => items.filter((i) => Number(i.fee) > 0).map((i) => `${i.collectionName} ${yuan(i.fee)}`).join('、');
    const notes: string[] = [];
    if (p.kind === 'teacher' || p.kind === 'org') {
      const label = p.kind === 'teacher' ? '课时费' : '机构款';
      notes.push(p.feeBy === 'platform'
        ? `转账手续费 ${feeText(p.gross)}由平台承担（已在分成池扣除），${label}全额到账`
        : `转账手续费 ${feeText(p.gross)}从${label}中扣除`);
    }
    if (p.kind === 'split') {
      const amount = roundMoney(p.gross - p.tax);
      if (!cfg.memberFee) notes.push('分成到账不扣转账手续费');
      else if (items.length > 1) {
        notes.push(`在 ${items.length} 个合集分成，合并为一笔转账：应分 ${yuan(p.gross)} − 税 ${yuan(p.tax)} = ${yuan(amount)}，手续费只收一次 ${feeText(amount)}，按应分金额比例分摊到各合集：${shares()}`);
      } else if (amount > 0) {
        notes.push(`应分 ${yuan(p.gross)} − 税 ${yuan(p.tax)} = ${yuan(amount)}，手续费 ${feeText(amount)}`);
      }
    }
    if (p.kind === 'both') {
      const teacher = Number(p.teacherPart?.gross || 0);
      const split = roundMoney(Number(p.splitPart?.gross || 0) - Number(p.splitPart?.tax || 0));
      const total = roundMoney(teacher + split);
      const extra = Number(p.splitPart?.fee || 0);
      let text = `课时费 ${yuan(teacher)} 与分成 ${yuan(split)}（已扣税）合并为一笔转账，按合计 ${yuan(total)} 只收一次手续费 ${feeText(total)}。`
        + `其中课时费单独转账本应收 ${feeText(teacher)}，${cfg.teacherFee ? '由平台承担（已在分成池扣除）' : '从课时费中扣除'}；`;
      const mergedExtra = roundMoney(Math.max(0, transferFee(total, cfg) - transferFee(teacher, cfg)));
      if (!cfg.memberFee) text += mergedExtra > 0 ? `合并后多出的 ${yuan(mergedExtra)} 不向分成人员收取，由平台承担` : '合并后未跨档，没有多出的手续费';
      else if (extra > 0) text += `合并后多出的 ${yuan(extra)} 由分成部分承担${items.length > 1 ? `，按应分金额比例分摊到各合集：${shares()}` : ''}`;
      else text += '合并后未跨档，分成部分不再收手续费';
      notes.push(text);
    }
    if (p.reimburse?.total) notes.push(`含报销 ${yuan(p.reimburse.total)} 一并转账，报销不扣税、不扣手续费`);
    return notes.join('；');
  }

  private async buildSplitPayouts(month?: string) {
    const key = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(new Date());
    const [stmt, config, collections, records, deductions, reimburseRows] = await Promise.all([
      this.monthlyStatement(key),
      this.getSplitConfig(),
      this.loadSplitCollections(),
      this.prisma.splitPayout.findMany({ where: { month: key } }),
      this.splitDeductions(key),
      this.payoutReimbursements(key),
    ]);
    const statsMap = new Map<number, CourseStat>(this.statsFromStatement(stmt).map((s) => [s.courseId, s]));
    const { payees, collections: calcs } = computeSplitMonth(collections, statsMap, config, deductions);
    const recordMap = new Map(records.map((r) => [r.payeeKey, r]));
    const teachers = new Map(this.teacherPayees(stmt, config).map((t) => [t.userId, t]));
    const all: any[] = payees.map((p) => {
      const t = p.withTeacher && p.userId ? teachers.get(p.userId) : undefined;
      if (!t) return { ...p, kind: 'split' as const, feeBy: 'payee' };
      teachers.delete(t.userId);
      // 既是授课教师又是分成人员：课时费 + 分成合并为一笔打款，手续费按合计只收一次
      const transfer = p.withTeacher!.combinedFee;
      const fee = roundMoney((t.feeBy === 'payee' ? t.fee : 0) + p.fee);
      const priorTeacherPaid = recordMap.get(t.key);
      return {
        kind: 'both' as const,
        key: p.key,
        name: p.name || t.name,
        userId: p.userId,
        gross: roundMoney(t.gross + p.gross),
        tax: p.tax,
        fee,
        feeBy: 'payee',
        transferFee: transfer,
        platformFee: roundMoney(Math.max(0, transfer - fee)),
        net: roundMoney(t.net + p.net),
        teacherPart: { gross: t.gross, fee: t.feeBy === 'payee' ? t.fee : 0, net: t.net },
        splitPart: { gross: p.gross, tax: p.tax, fee: p.fee, net: p.net },
        courses: t.items,
        items: p.items,
        priorTeacherPaid: priorTeacherPaid?.status === 'paid' ? priorTeacherPaid.net : null,
      };
    });
    all.unshift(...teachers.values(), ...this.orgPayees(stmt, config));
    this.attachReimbursements(all, reimburseRows, records, config);

    const list: any[] = all.map((p) => {
      const rec = recordMap.get(p.key);
      recordMap.delete(p.key);
      const paid = rec?.status === 'paid';
      return {
        ...p,
        status: paid ? 'paid' : 'unpaid',
        paidAt: paid ? rec!.paidAt : null,
        note: rec?.note || '',
        paidNet: paid ? rec!.net : null,
        changed: paid ? Math.abs(Number(rec!.net) - p.net) > 0.009 : false,
      };
    });
    // 已打款但规则调整后不再参与分成的收款人，仍保留打款记录
    for (const rec of recordMap.values()) {
      if (rec.status !== 'paid') continue;
      const detail = this.parsePayoutDetail(rec.detail);
      const both = Array.isArray(detail.courses);
      const prefix = rec.payeeKey.slice(0, 2);
      list.push({
        kind: both ? 'both' : prefix === 't:' ? 'teacher' : prefix === 'o:' ? 'org' : prefix === 'r:' ? 'reimburse' : 'split',
        feeBy: 'payee',
        key: rec.payeeKey,
        name: rec.name,
        userId: rec.userId,
        gross: 0,
        tax: 0,
        fee: 0,
        net: 0,
        items: detail.items,
        ...(both ? { courses: detail.courses } : {}),
        status: 'paid',
        paidAt: rec.paidAt,
        note: rec.note || '',
        paidNet: rec.net,
        changed: true,
      });
    }
    await this.attachPayoutBanks(list);

    const kindOrder: Record<string, number> = { teacher: 0, both: 1, org: 2, split: 3, reimburse: 4 };
    list.sort((a, b) => Number(a.status === 'paid') - Number(b.status === 'paid')
      || (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9)
      || b.net - a.net);

    const totals = list.reduce(
      (acc, p) => {
        const reimburse = Number(p.reimburse?.total || 0);
        const own = roundMoney(p.net - reimburse);
        acc.net = roundMoney(acc.net + p.net);
        acc.tax = roundMoney(acc.tax + p.tax);
        acc.fee = roundMoney(acc.fee + (p.transferFee != null ? Number(p.transferFee || 0) : p.fee));
        acc.reimburseNet = roundMoney(acc.reimburseNet + reimburse);
        if (p.kind === 'both' && p.teacherPart) {
          acc.teacherNet = roundMoney(acc.teacherNet + p.teacherPart.net);
          acc.splitNet = roundMoney(acc.splitNet + p.splitPart.net);
        } else if (p.kind === 'teacher') acc.teacherNet = roundMoney(acc.teacherNet + own);
        else if (p.kind === 'org') acc.orgNet = roundMoney(acc.orgNet + own);
        else if (p.kind !== 'reimburse') acc.splitNet = roundMoney(acc.splitNet + own);
        if (p.status === 'paid') {
          acc.paid = roundMoney(acc.paid + Number(p.paidNet || 0));
          acc.paidCount += 1;
        } else {
          acc.unpaid = roundMoney(acc.unpaid + p.net);
          acc.unpaidCount += 1;
        }
        return acc;
      },
      { net: 0, tax: 0, fee: 0, teacherNet: 0, orgNet: 0, splitNet: 0, reimburseNet: 0, paid: 0, unpaid: 0, paidCount: 0, unpaidCount: 0 },
    );
    return { month: key, locked: stmt.locked, config, list, totals, calcs };
  }

  /** 给打款行挂上可复制的收款银行卡：教师/分成用户取认证资料，机构取对公账户 */
  private async attachPayoutBanks(list: any[]) {
    const userIds = new Set<number>();
    const orgIds = new Set<number>();
    for (const p of list) {
      const uid = Number(p.userId) || 0;
      if (uid > 0) userIds.add(uid);
      let orgId = Number(p.orgId) || 0;
      if (!orgId && String(p.key || '').startsWith('o:')) orgId = Number(String(p.key).slice(2)) || 0;
      if (orgId > 0) {
        p.orgId = orgId;
        orgIds.add(orgId);
      }
    }
    const [certs, orgs] = await Promise.all([
      userIds.size
        ? this.prisma.teacherCert.findMany({
          where: { userId: { in: [...userIds] } },
          select: { userId: true, bankName: true, bankAccountName: true, bankAccount: true },
        })
        : Promise.resolve([]),
      orgIds.size
        ? this.prisma.organization.findMany({
          where: { id: { in: [...orgIds] } },
          select: { id: true, name: true, corpName: true, bankName: true, bankAccount: true },
        })
        : Promise.resolve([]),
    ]);
    const certMap = new Map(certs.map((c) => [c.userId, c]));
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    for (const p of list) {
      if (p.kind === 'org' && p.orgId) {
        const org = orgMap.get(Number(p.orgId));
        p.bankName = String(org?.bankName || '').trim();
        p.bankAccountName = String(org?.corpName || org?.name || p.name || '').trim();
        p.bankAccount = String(org?.bankAccount || '').trim().replace(/[\s\-]/g, '');
      } else if (p.userId) {
        const cert = certMap.get(Number(p.userId));
        p.bankName = String(cert?.bankName || '').trim();
        p.bankAccountName = String(cert?.bankAccountName || '').trim();
        p.bankAccount = String(cert?.bankAccount || '').trim().replace(/[\s\-]/g, '');
      } else {
        p.bankName = '';
        p.bankAccountName = '';
        p.bankAccount = '';
      }
    }
  }

  /** 结算月份为当月、已通过或已报销的报销单（已报销的只有随某笔打款一起标记的才会并入） */
  private async payoutReimbursements(month: string) {
    const rows = await this.prisma.reimbursement.findMany({
      where: { month, status: { in: ['approved', 'reimbursed'] } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        userId: true,
        title: true,
        amount: true,
        status: true,
        expenseDate: true,
        splitCollectionId: true,
        user: { select: { id: true, nickname: true, phone: true, teacherCert: { select: { realName: true } } } },
      },
    });
    const collectionIds = [...new Set(rows.map((r) => r.splitCollectionId).filter((id): id is number => !!id))];
    const collections = collectionIds.length
      ? await this.prisma.splitCollection.findMany({ where: { id: { in: collectionIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(collections.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user ? this.splitUserName(r.user) : '',
      title: r.title,
      amount: roundMoney(Number(r.amount) || 0),
      status: r.status,
      expenseDate: r.expenseDate,
      collectionName: r.splitCollectionId ? names.get(r.splitCollectionId) || '（合集已删除）' : '',
    }));
  }

  /**
   * 报销并入同一收款人的打款：优先并入该用户的课时费 / 分成行，没有则单独一行（r:用户ID）。
   * 报销全额到账，不扣税费和手续费；合并后转账金额变大多出的手续费由平台承担。
   */
  private attachReimbursements(
    all: any[],
    rows: Awaited<ReturnType<FinanceService['payoutReimbursements']>>,
    records: Array<{ payeeKey: string; status: string; detail: string | null }>,
    config: SplitConfig,
  ) {
    const forced = new Map<number, string>();
    for (const rec of records) {
      if (rec.status !== 'paid') continue;
      for (const id of this.parsePayoutDetail(rec.detail).reimburseIds) forced.set(id, rec.payeeKey);
    }
    const byKey = new Map<string, any>(all.map((p) => [p.key, p]));
    const byUser = new Map<number, any>();
    for (const p of all) if (p.userId && p.kind !== 'org' && !byUser.has(p.userId)) byUser.set(p.userId, p);
    const touched = new Set<any>();
    for (const r of rows) {
      const forcedKey = forced.get(r.id);
      // 已在报销页单独标记报销的，不再并入打款
      if (r.status === 'reimbursed' && !forcedKey) continue;
      const key = forcedKey || `r:${r.userId}`;
      let target = forcedKey ? byKey.get(forcedKey) : byUser.get(r.userId);
      if (!target) {
        target = byKey.get(key);
        if (!target) {
          target = { kind: 'reimburse', key, name: r.userName || `用户#${r.userId}`, userId: r.userId, gross: 0, tax: 0, fee: 0, feeBy: 'platform', net: 0, items: [] };
          all.push(target);
          byKey.set(key, target);
          if (!forcedKey) byUser.set(r.userId, target);
        }
      }
      if (!target.reimburse) target.reimburse = { total: 0, items: [] };
      target.reimburse.items.push({
        id: r.id,
        title: r.title,
        amount: r.amount,
        status: r.status,
        expenseDate: r.expenseDate,
        collectionName: r.collectionName,
      });
      touched.add(target);
    }
    for (const target of touched) {
      const total = roundMoney(target.reimburse.items.reduce((acc: number, i: any) => acc + i.amount, 0));
      target.reimburse.total = total;
      const combined = transferFee(roundMoney(target.gross - target.tax + total), config);
      const payeeFee = target.feeBy === 'payee' ? Number(target.fee || 0) : 0;
      target.transferFee = combined;
      target.platformFee = roundMoney(Math.max(0, combined - payeeFee));
      target.net = roundMoney(target.net + total);
    }
  }

  /** 打款快照：旧数据为明细数组；含课时费 / 报销时为对象 */
  private parsePayoutDetail(text: string | null | undefined) {
    let detail: any = [];
    try {
      detail = JSON.parse(text || '[]');
    } catch {
      detail = [];
    }
    if (Array.isArray(detail)) return { items: detail, courses: undefined as any[] | undefined, reimburseIds: [] as number[] };
    const obj = detail && typeof detail === 'object' ? detail : {};
    return {
      items: Array.isArray(obj.items) ? obj.items : [],
      courses: Array.isArray(obj.courses) ? obj.courses : undefined,
      reimburseIds: Array.isArray(obj.reimburseIds) ? obj.reimburseIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [],
    };
  }

  private payoutDetail(p: any) {
    const reimburse = p.reimburse?.items || [];
    if (p.kind !== 'both' && !reimburse.length) return p.items || [];
    return {
      ...(p.kind === 'both' ? { courses: p.courses || [] } : {}),
      items: p.items || [],
      ...(reimburse.length ? { reimburseIds: reimburse.map((i: any) => i.id), reimburse } : {}),
    };
  }

  /** 标记已打款 / 未打款；已打款保存当时金额快照 */
  async markSplitPayouts(month: string, body: any, adminId?: number) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
    const status = body?.status === 'unpaid' ? 'unpaid' : 'paid';
    const keys = [...new Set<string>((Array.isArray(body?.keys) ? body.keys : []).map((k: any) => String(k)))].filter(Boolean);
    if (!keys.length) throw new BadRequestException('请选择收款人');
    const note = body?.note === undefined ? undefined : String(body.note || '').trim().slice(0, 200) || null;

    const current = await this.splitPayouts(month);
    if (!current.locked) throw new BadRequestException(`${month} 月度结算单尚未固定，请先在「月度结算单」确认并固定后再修改打款状态`);
    const byKey = new Map(current.list.map((p) => [p.key, p]));
    const prior = new Map(
      (await this.prisma.splitPayout.findMany({ where: { month, payeeKey: { in: keys } } }))
        .map((r) => [r.payeeKey, this.parsePayoutDetail(r.detail).reimburseIds]),
    );
    const now = new Date();
    let count = 0;
    for (const key of keys) {
      const p = byKey.get(key);
      if (!p) continue;
      const before = prior.get(key) || [];
      if (status === 'paid') {
        if (!(p.net > 0) && p.status !== 'paid') continue;
        const reimburseIds: number[] = (p.reimburse?.items || []).map((i: any) => i.id);
        const data = {
          userId: p.userId || null,
          name: p.name,
          gross: p.gross,
          tax: p.tax,
          fee: p.fee,
          net: p.net,
          detail: JSON.stringify(this.payoutDetail(p)),
          status: 'paid',
          paidAt: now,
          paidBy: adminId || null,
          ...(note !== undefined ? { note } : {}),
        };
        await this.prisma.splitPayout.upsert({
          where: { month_payeeKey: { month, payeeKey: key } },
          create: { month, payeeKey: key, ...data },
          update: data,
        });
        const dropped = before.filter((id) => !reimburseIds.includes(id));
        if (dropped.length) await this.reopenReimbursements(dropped);
        if (reimburseIds.length) {
          await this.prisma.reimbursement.updateMany({
            where: { id: { in: reimburseIds }, status: 'approved' },
            data: { status: 'reimbursed', reimbursedAt: now },
          });
        }
      } else {
        await this.prisma.splitPayout.updateMany({
          where: { month, payeeKey: key },
          data: { status: 'unpaid', paidAt: null, paidBy: null, ...(note !== undefined ? { note } : {}) },
        });
        if (before.length) await this.reopenReimbursements(before);
      }
      count += 1;
    }
    if (!count) throw new BadRequestException(status === 'paid' ? '所选收款人没有可打款金额' : '没有可撤销的记录');
    return { ok: true, count };
  }

  /** 撤销打款：随该笔打款标记的报销退回「已通过」，等待下次打款 */
  private async reopenReimbursements(ids: number[]) {
    await this.prisma.reimbursement.updateMany({
      where: { id: { in: ids }, status: 'reimbursed' },
      data: { status: 'approved', reimbursedAt: null },
    });
  }

  /** 某月按课程汇总的结算金额（口径同月度结算单） */
  private async splitMonthStats(month: string) {
    const [stmt, reimbursements] = await Promise.all([this.monthlyStatement(month), this.splitDeductions(month)]);
    return { month, locked: stmt.locked, stats: this.statsFromStatement(stmt), reimbursements };
  }

  /** 当月从合集利润中扣除的报销：审核通过 / 已报销且关联了合集 */
  async splitDeductions(month: string): Promise<SplitDeduction[]> {
    const rows = await this.prisma.reimbursement.findMany({
      where: { month, splitCollectionId: { not: null }, status: { in: ['approved', 'reimbursed'] } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        title: true,
        amount: true,
        status: true,
        splitCollectionId: true,
        user: { select: { id: true, nickname: true, phone: true, teacherCert: { select: { realName: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      collectionId: r.splitCollectionId as number,
      amount: Number(r.amount) || 0,
      title: r.title,
      userName: r.user ? this.splitUserName(r.user) : '',
      status: r.status,
    }));
  }

  private statsFromStatement(stmt: Awaited<ReturnType<FinanceService['monthlyStatement']>>): CourseStat[] {
    const stats = new Map<number, any>();
    for (const item of stmt.list) {
      const cur = stats.get(item.courseId) || {
        courseId: item.courseId,
        sessionCount: 0,
        schoolAmount: 0,
        teacherAmount: 0,
        institutionAmount: 0,
        costAmount: 0,
        profitAmount: 0,
        teachers: [] as Array<{ teacherId: number | null; name: string; amount: number }>,
        orgs: [] as Array<{ orgId: number; name: string; amount: number }>,
      };
      cur.sessionCount += item.sessionCount;
      cur.schoolAmount = roundMoney(cur.schoolAmount + item.schoolAmount);
      cur.teacherAmount = roundMoney(cur.teacherAmount + item.teacherAmount);
      cur.institutionAmount = roundMoney(cur.institutionAmount + item.institutionAmount);
      cur.costAmount = roundMoney(cur.costAmount + item.costAmount);
      cur.profitAmount = roundMoney(cur.profitAmount + item.profitAmount);
      if (Number(item.teacherAmount) > 0) {
        cur.teachers.push({ teacherId: item.teacherId, name: item.teacherName, amount: item.teacherAmount });
      }
      if (item.organizationId && Number(item.institutionAmount) > 0) {
        cur.orgs.push({ orgId: item.organizationId, name: this.orgPayeeName(item), amount: item.institutionAmount });
      }
      stats.set(item.courseId, cur);
    }
    return [...stats.values()];
  }

  private orgPayeeName(item: { organizationId?: number | null; organizationName?: string | null }) {
    return item.organizationName || `机构#${item.organizationId}`;
  }

  /** 机构打款：每个机构当月全部课程的机构费（含机构结算的整节课时费）合计一笔；手续费规则同教师 */
  private orgPayees(stmt: Awaited<ReturnType<FinanceService['monthlyStatement']>>, config: SplitConfig) {
    const map = new Map<number, any>();
    for (const item of stmt.list) {
      if (!item.organizationId || !(Number(item.institutionAmount) > 0)) continue;
      const cur = map.get(item.organizationId) || { orgId: item.organizationId, name: this.orgPayeeName(item), amount: 0, items: [] as any[] };
      cur.amount = roundMoney(cur.amount + Number(item.institutionAmount));
      cur.items.push({
        courseId: item.courseId,
        courseTitle: item.courseTitle,
        school: item.school,
        teacherName: item.teacherName,
        sessionCount: item.sessionCount,
        amount: roundMoney(Number(item.institutionAmount)),
      });
      map.set(item.organizationId, cur);
    }
    return [...map.values()].map((o) => {
      const fee = transferFee(o.amount, config);
      return {
        kind: 'org' as const,
        key: `o:${o.orgId}`,
        name: o.name,
        userId: null,
        orgId: o.orgId,
        gross: o.amount,
        tax: 0,
        fee,
        feeBy: config.orgFee ? 'platform' : 'payee',
        net: config.orgFee ? o.amount : roundMoney(Math.max(0, o.amount - fee)),
        items: o.items,
      };
    });
  }

  /** 教师课时费打款：每位教师当月全部课程合计一笔；手续费勾选「从分成池扣除」时由平台承担，否则从课时费扣 */
  private teacherPayees(stmt: Awaited<ReturnType<FinanceService['monthlyStatement']>>, config: SplitConfig) {
    const map = new Map<number, any>();
    for (const item of stmt.list) {
      if (!item.teacherId || !(Number(item.teacherAmount) > 0)) continue;
      const name = item.teacherName && item.teacherName !== '—' ? item.teacherName : `教师#${item.teacherId}`;
      const cur = map.get(item.teacherId) || { teacherId: item.teacherId, name, amount: 0, items: [] as any[] };
      cur.amount = roundMoney(cur.amount + Number(item.teacherAmount));
      cur.items.push({
        courseId: item.courseId,
        courseTitle: item.courseTitle,
        school: item.school,
        sessionCount: item.sessionCount,
        sessionDates: item.sessionDates || [],
        amount: roundMoney(Number(item.teacherAmount)),
      });
      map.set(item.teacherId, cur);
    }
    return [...map.values()].map((t) => {
      const fee = transferFee(t.amount, config);
      const platformBears = config.teacherFee;
      return {
        kind: 'teacher' as const,
        key: `t:${t.teacherId}`,
        name: t.name,
        userId: t.teacherId,
        gross: t.amount,
        tax: 0,
        fee,
        feeBy: platformBears ? 'platform' : 'payee',
        net: platformBears ? t.amount : roundMoney(Math.max(0, t.amount - fee)),
        items: t.items,
      };
    });
  }

  async createSplitCollection(body: any) {
    const data = await this.validateSplitCollection(body);
    const last = await this.prisma.splitCollection.findFirst({ orderBy: { sort: 'desc' }, select: { sort: true } });
    const row = await this.prisma.splitCollection.create({ data: { ...data, sort: (last?.sort ?? 0) + 1 } });
    return this.toSplitCollection(row);
  }

  async updateSplitCollection(id: number, body: any) {
    const exists = await this.prisma.splitCollection.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('合集不存在');
    const data = await this.validateSplitCollection(body, id);
    const row = await this.prisma.splitCollection.update({ where: { id }, data });
    return this.toSplitCollection(row);
  }

  async deleteSplitCollection(id: number) {
    const exists = await this.prisma.splitCollection.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('合集不存在');
    const linked = await this.prisma.reimbursement.count({ where: { splitCollectionId: id, status: { not: 'rejected' } } });
    if (linked) throw new BadRequestException(`有 ${linked} 张报销单从该合集扣除，请先在「报销单」中改为其他合集后再删除`);
    await this.prisma.splitCollection.delete({ where: { id } });
    return { ok: true };
  }

  private toSplitCollection(row: { id: number; name: string; courseIds: string; members: string; note: string | null; sort: number }) {
    const parse = (text: string) => {
      try {
        const value = JSON.parse(text || '[]');
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    };
    return {
      id: row.id,
      name: row.name,
      note: row.note || '',
      sort: row.sort,
      courseIds: parse(row.courseIds).map(Number).filter((n: number) => Number.isInteger(n) && n > 0),
      members: parse(row.members).map((m: any) => ({
        name: String(m?.name || ''),
        ratio: Number(m?.ratio) || 0,
        userId: Number.isInteger(Number(m?.userId)) && Number(m?.userId) > 0 ? Number(m.userId) : null,
      })),
    };
  }

  private async validateSplitCollection(body: any, selfId?: number) {
    const name = String(body?.name || '').trim();
    if (!name) throw new BadRequestException('请填写合集名称');
    if (name.length > 50) throw new BadRequestException('合集名称不超过 50 字');
    const courseIds = [...new Set<number>((Array.isArray(body?.courseIds) ? body.courseIds : []).map(Number))]
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!courseIds.length) throw new BadRequestException('请至少勾选一门课程');

    const others = await this.prisma.splitCollection.findMany({
      where: selfId ? { id: { not: selfId } } : {},
      select: { name: true, courseIds: true },
    });
    for (const other of others) {
      const taken = new Set(this.toSplitCollection({ ...other, id: 0, members: '[]', note: null, sort: 0 }).courseIds);
      const clash = courseIds.find((cid) => taken.has(cid));
      if (clash) {
        const course = await this.prisma.course.findUnique({ where: { id: clash }, select: { title: true } });
        throw new BadRequestException(`课程「${course?.title || clash}」已在合集「${other.name}」中，同一课程只能归入一个合集`);
      }
    }

    const members: SplitMember[] = (Array.isArray(body?.members) ? body.members : []).map((m: any) => {
      const userId = Number(m?.userId);
      return {
        name: String(m?.name || '').trim(),
        ratio: Math.round(Number(m?.ratio || 0) * 100) / 100,
        userId: Number.isInteger(userId) && userId > 0 ? userId : null,
      };
    });
    if (!members.length) throw new BadRequestException('请至少添加一位分成人员');
    const userIds = members.map((m) => m.userId).filter(Boolean) as number[];
    if (userIds.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nickname: true, phone: true, teacherCert: { select: { realName: true } } },
      });
      const names = new Map(users.map((u) => [u.id, this.splitUserName(u)]));
      for (const m of members) {
        if (!m.userId) continue;
        if (!names.has(m.userId)) throw new BadRequestException(`用户 #${m.userId} 不存在`);
        m.name = names.get(m.userId)!;
      }
    }
    const seen = new Set<string>();
    for (const m of members) {
      if (!m.name) throw new BadRequestException('虚拟人员请填写姓名，或选择一个用户');
      if (m.name.length > 30) throw new BadRequestException('分成人员姓名不超过 30 字');
      if (!(m.ratio > 0) || m.ratio > 100) throw new BadRequestException(`「${m.name}」的比例应在 0 ~ 100% 之间`);
      const key = payeeKey(m);
      if (seen.has(key)) throw new BadRequestException(`「${m.name}」在本合集中重复，请合并为一行`);
      seen.add(key);
    }
    const sum = members.reduce((acc: number, m: any) => acc + m.ratio, 0);
    if (sum > 100.0001) throw new BadRequestException(`分成比例合计 ${Math.round(sum * 100) / 100}%，不能超过 100%`);

    return {
      name,
      note: String(body?.note || '').trim() || null,
      courseIds: JSON.stringify(courseIds),
      members: JSON.stringify(members),
    };
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
