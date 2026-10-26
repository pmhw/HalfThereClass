import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AGREEMENT_TITLE_KEY } from '@/common/agreement';
import { CONTRACT_PARTY_A_KEY, DEFAULT_PARTY_A, parsePartyA } from '@/common/contract';
import { AdminPermission, hasPermission } from '@/modules/admin/admin.permissions';
import { SmsService } from '@/modules/sms/sms.service';
import { FinanceService } from '@/modules/finance/finance.service';

/** error：会导致金额算错 / 功能不可用；warn：建议尽快处理；info：提示，可按需忽略 */
type Level = 'error' | 'warn' | 'info';
type Sample = { label: string; to?: string };
type CheckItem = {
  id: string;
  level: Level;
  title: string;
  /** 有问题时的说明（为什么要配） */
  desc: string;
  /** 没问题时显示的文字 */
  okText: string;
  count: number;
  samples?: Sample[];
  link?: { to: string; label: string };
  ignorable?: boolean;
};
type Group = { key: string; step: number; title: string; desc: string; perm: AdminPermission[]; items: CheckItem[] };

const IGNORED_KEY = 'setup_ignored';
const SPLIT_CONFIG_KEY = 'split_config';
const SAMPLE_LIMIT = 6;

function monthOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dayOf(date: Date) {
  return `${monthOf(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

function usable(value?: string | null) {
  const text = String(value || '').trim();
  return text && !text.includes('your-') ? text : '';
}

@Injectable()
export class SetupService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    private finance: FinanceService,
  ) {}

  private async ignoredSet() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: IGNORED_KEY } });
    try {
      const list = JSON.parse(row?.value || '[]');
      return new Set<string>(Array.isArray(list) ? list.map(String) : []);
    } catch {
      return new Set<string>();
    }
  }

  private canSee(admin: any, perms: AdminPermission[]) {
    return hasPermission(admin, ...perms);
  }

  /** 全部检查项（按配置顺序分组），只返回当前管理员有权限的分组 */
  async check(admin: any) {
    const ignored = await this.ignoredSet();
    const groups = (await this.buildGroups()).filter((g) => this.canSee(admin, g.perm));
    const summary = { total: 0, ok: 0, error: 0, warn: 0, info: 0, ignored: 0 };
    const outGroups = groups.map((g) => {
      const items = g.items.map((item) => {
        const isIgnored = item.count > 0 && !!item.ignorable && ignored.has(item.id);
        const status = item.count === 0 ? 'ok' : isIgnored ? 'ignored' : 'issue';
        summary.total += 1;
        if (status === 'ok') summary.ok += 1;
        else if (status === 'ignored') summary.ignored += 1;
        else summary[item.level] += 1;
        return { ...item, status, samples: item.samples || [] };
      });
      const issues = items.filter((i) => i.status === 'issue');
      return {
        key: g.key,
        step: g.step,
        title: g.title,
        desc: g.desc,
        items,
        done: issues.length === 0,
        errorCount: issues.filter((i) => i.level === 'error').length,
      };
    });
    const top = outGroups
      .flatMap((g) => g.items)
      .filter((i) => i.status === 'issue' && i.level === 'error')
      .map((i) => i.title);
    return { checkedAt: new Date(), summary, top, groups: outGroups };
  }

  async setIgnored(admin: any, id: string, value: boolean) {
    const key = String(id || '').trim();
    const groups = await this.buildGroups();
    const group = groups.find((g) => g.items.some((i) => i.id === key));
    const item = group?.items.find((i) => i.id === key);
    if (!group || !item) throw new BadRequestException('检查项不存在');
    if (!this.canSee(admin, group.perm)) throw new ForbiddenException('没有该功能权限');
    if (!item.ignorable) throw new BadRequestException('这一项会影响金额计算，不能忽略');
    const set = await this.ignoredSet();
    if (value) set.add(key);
    else set.delete(key);
    await this.prisma.appSetting.upsert({
      where: { key: IGNORED_KEY },
      create: { key: IGNORED_KEY, value: JSON.stringify([...set]) },
      update: { value: JSON.stringify([...set]) },
    });
    return { ok: true, id: key, ignored: value };
  }

  private async buildGroups(): Promise<Group[]> {
    const [system, course, org, finance, split] = await Promise.all([
      this.systemChecks(),
      this.courseChecks(),
      this.orgChecks(),
      this.financeChecks(),
      this.splitChecks(),
    ]);
    return [
      { key: 'system', step: 1, title: '系统基础', desc: '登录、短信、地图、合同等基础服务', perm: ['admin.settings'], items: system },
      { key: 'course', step: 2, title: '学校与课程', desc: '课程的学校、校方价格、课时费、任课老师与排课', perm: ['course.list', 'course.assign', 'course.term', 'course.school', 'finance.rule'], items: course },
      { key: 'org', step: 3, title: '机构与分佣', desc: '承接机构、抽成规则与机构收款账户', perm: ['org.list'], items: org },
      { key: 'finance', step: 4, title: '收益与结算', desc: '课次同步、教师收入、月度结算单固定', perm: ['finance.overview', 'finance.statement', 'finance.teacher'], items: finance },
      { key: 'split', step: 5, title: '分成与打款', desc: '分成计算规则、合集与打款状态', perm: ['finance.split', 'finance.payout'], items: split },
    ];
  }

  private async systemChecks(): Promise<CheckItem[]> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: ['wxAppId', 'wxAppSecret', 'amapKey', AGREEMENT_TITLE_KEY, CONTRACT_PARTY_A_KEY] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const wxReady = !!(usable(map.wxAppId) || usable(process.env.WX_APPID)) && !!(usable(map.wxAppSecret) || usable(process.env.WX_SECRET));
    let smsReady = false;
    try {
      smsReady = !!(await this.sms.getAdminConfig()).ready;
    } catch {
      smsReady = false;
    }
    const partyA = parsePartyA(map[CONTRACT_PARTY_A_KEY]);
    const partyADefault = !map[CONTRACT_PARTY_A_KEY] || (partyA.name === DEFAULT_PARTY_A.name && partyA.creditCode === DEFAULT_PARTY_A.creditCode);
    const settings = { to: '/settings', label: '去系统设置' };
    return [
      {
        id: 'system.wx',
        level: 'error',
        title: '小程序登录（AppID / AppSecret）',
        desc: '未配置时教师与家长无法在小程序登录。',
        okText: '已配置',
        count: wxReady ? 0 : 1,
        link: settings,
      },
      {
        id: 'system.partyA',
        level: 'warn',
        title: '合同甲方对公信息',
        desc: '仍是默认甲方信息，教师签的服务合同会带上错误的甲方名称与信用代码。',
        okText: `甲方：${partyA.name}`,
        count: partyADefault ? 1 : 0,
        link: settings,
      },
      {
        id: 'system.sms',
        level: 'warn',
        title: '阿里云短信',
        desc: '手机网页端（/m/）验证码登录需要；只用小程序可忽略。',
        okText: '已配置',
        count: smsReady ? 0 : 1,
        link: settings,
        ignorable: true,
      },
      {
        id: 'system.amap',
        level: 'info',
        title: '高德地图密钥',
        desc: '学校地图搜索与选点需要；不用地图选点可忽略。',
        okText: '已配置',
        count: usable(map.amapKey) ? 0 : 1,
        link: settings,
        ignorable: true,
      },
      {
        id: 'system.agreement',
        level: 'info',
        title: '用户协议',
        desc: '正在使用内置默认协议，建议按实际情况修改。',
        okText: '已自定义',
        count: usable(map[AGREEMENT_TITLE_KEY]) ? 0 : 1,
        link: { to: '/settings/agreement', label: '去编辑' },
        ignorable: true,
      },
    ];
  }

  private activeCourses() {
    return this.prisma.course.findMany({
      where: { status: 1 },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        title: true,
        price: true,
        isFree: true,
        sessionFee: true,
        schoolId: true,
        school: true,
        teacherId: true,
        organizationId: true,
        orgCommissionMode: true,
        orgCommissionValue: true,
        organization: { select: { id: true, name: true, status: true, commissionMode: true, commissionValue: true, feeVisibility: true } },
        _count: { select: { sessions: true, termTeachers: true } },
      },
    });
  }

  private courseSamples(list: Array<{ title: string }>, to: string) {
    return list.slice(0, SAMPLE_LIMIT).map((c) => ({ label: c.title, to }));
  }

  private async courseChecks(): Promise<CheckItem[]> {
    const [courses, schoolCount] = await Promise.all([
      this.activeCourses(),
      this.prisma.school.count({ where: { status: 1 } }),
    ]);
    const noSchool = courses.filter((c) => !c.schoolId && !String(c.school || '').trim());
    const noPrice = courses.filter((c) => !c.isFree && !(Number(c.price) > 0));
    const noFee = courses.filter((c) => c.sessionFee == null);
    const feeOver = courses.filter((c) => !c.isFree && c.sessionFee != null && Number(c.price) > 0 && Number(c.sessionFee) > Number(c.price));
    const noTeacher = courses.filter((c) => c._count.sessions > 0 && !c.teacherId && c._count.termTeachers === 0);
    const noSessions = courses.filter((c) => c._count.sessions === 0);
    return [
      {
        id: 'course.schools',
        level: 'warn',
        title: '学校',
        desc: '还没有启用的学校，课程无法按学校归类，结算单也无法按学校小计。',
        okText: `${schoolCount} 所学校`,
        count: schoolCount ? 0 : 1,
        link: { to: '/schools', label: '去添加学校' },
      },
      {
        id: 'course.noPrice',
        level: 'error',
        title: '校方价格',
        desc: '上架课程没有校方价格（非免费课），结算单校方合计与利润会少算。',
        okText: '上架课程均已配置',
        count: noPrice.length,
        samples: this.courseSamples(noPrice, '/finance/rules'),
        link: { to: '/finance/rules', label: '去课程分成规则配置' },
      },
      {
        id: 'course.noSessionFee',
        level: 'error',
        title: '课时费',
        desc: '未配置课时费的课程，同步课次收益时会被跳过，结算单与教师课时费都不会包含这些课。',
        okText: '上架课程均已配置',
        count: noFee.length,
        samples: this.courseSamples(noFee, '/finance/rules'),
        link: { to: '/finance/rules', label: '去课程分成规则配置' },
      },
      {
        id: 'course.feeOverPrice',
        level: 'warn',
        title: '课时费高于校方价格',
        desc: '这些课每上一节平台都是亏损的，请确认价格是否填反。',
        okText: '没有亏损课程',
        count: feeOver.length,
        samples: this.courseSamples(feeOver, '/finance/rules'),
        link: { to: '/finance/rules', label: '去课程分成规则核对' },
      },
      {
        id: 'course.noSchool',
        level: 'warn',
        title: '课程所属学校',
        desc: '上架课程没有绑定学校，结算单会归到「—」。',
        okText: '均已绑定学校',
        count: noSchool.length,
        samples: this.courseSamples(noSchool, '/courses'),
        link: { to: '/courses', label: '去课程列表' },
      },
      {
        id: 'course.noTeacher',
        level: 'warn',
        title: '任课老师',
        desc: '已排课但没安排老师，课次收益没有教师可结算（课时费不会进入教师打款）。',
        okText: '已排课的课程都有老师',
        count: noTeacher.length,
        samples: this.courseSamples(noTeacher, '/assign'),
        link: { to: '/assign', label: '去预先排课' },
      },
      {
        id: 'course.noSessions',
        level: 'info',
        title: '排课',
        desc: '上架课程还没有任何课次，不会产生收益。',
        okText: '上架课程都已排课',
        count: noSessions.length,
        samples: this.courseSamples(noSessions, '/term'),
        link: { to: '/term', label: '去学期排课' },
        ignorable: true,
      },
    ];
  }

  private async orgChecks(): Promise<CheckItem[]> {
    const [courses, orgs] = await Promise.all([
      this.activeCourses(),
      this.prisma.organization.findMany({
        where: { status: 1 },
        select: {
          id: true,
          name: true,
          bankName: true,
          bankAccount: true,
          _count: { select: { courses: true, teachers: true } },
        },
      }),
    ]);
    const linked = courses.filter((c) => c.organizationId && c.organization);
    const disabled = linked.filter((c) => c.organization!.status !== 1);
    const active = linked.filter((c) => c.organization!.status === 1);
    const commissionOf = (c: (typeof active)[number]) => {
      const mode = c.orgCommissionMode || c.organization!.commissionMode;
      const value = c.orgCommissionValue != null ? Number(c.orgCommissionValue) : Number(c.organization!.commissionValue || 0);
      return { mode, value };
    };
    const zero = active.filter((c) => c.organization!.feeVisibility !== 'hidden' && !(commissionOf(c).value > 0));
    const over = active.filter((c) => {
      const { mode, value } = commissionOf(c);
      if (mode === 'fixed') return c.sessionFee != null && value > Number(c.sessionFee);
      return value > 100;
    });
    const noBank = orgs.filter((o) => (o._count.courses > 0 || o._count.teachers > 0) && !(String(o.bankAccount || '').trim() && String(o.bankName || '').trim()));
    return [
      {
        id: 'org.disabled',
        level: 'error',
        title: '承接机构已停用',
        desc: '课程绑定的机构已停用，结算单会按「无机构」处理：机构费清零、课时费全给教师。',
        okText: '没有绑定停用机构的课程',
        count: disabled.length,
        samples: disabled.slice(0, SAMPLE_LIMIT).map((c) => ({ label: `${c.title}（${c.organization!.name}）`, to: '/courses' })),
        link: { to: '/courses', label: '去课程列表改机构' },
      },
      {
        id: 'org.zeroCommission',
        level: 'warn',
        title: '机构抽成为 0',
        desc: '这些承接机构的课抽成是 0，机构拿不到机构费；如确实不抽成可忽略。',
        okText: '承接机构的课都配置了抽成',
        count: zero.length,
        samples: zero.slice(0, SAMPLE_LIMIT).map((c) => ({ label: `${c.title}（${c.organization!.name}）`, to: '/orgs' })),
        link: { to: '/orgs', label: '去机构管理配置抽成' },
        ignorable: true,
      },
      {
        id: 'org.commissionOver',
        level: 'warn',
        title: '抽成超过课时费',
        desc: '按比例超过 100% 或固定抽成大于课时费，系统会按课时费封顶，教师课时费变成 0。',
        okText: '抽成均在合理范围',
        count: over.length,
        samples: over.slice(0, SAMPLE_LIMIT).map((c) => ({ label: `${c.title}（${c.organization!.name}）`, to: '/orgs' })),
        link: { to: '/orgs', label: '去机构管理核对' },
      },
      {
        id: 'org.noBank',
        level: 'warn',
        title: '机构收款账户',
        desc: '有课程或教师的机构没填开户行 / 银行账号，财务打款时不知道往哪打。',
        okText: '机构收款账户齐全',
        count: noBank.length,
        samples: noBank.slice(0, SAMPLE_LIMIT).map((o) => ({ label: o.name, to: '/orgs' })),
        link: { to: '/orgs', label: '去机构管理补充' },
      },
    ];
  }

  private async financeChecks(): Promise<CheckItem[]> {
    const now = new Date();
    const today = dayOf(now);
    const thisMonth = monthOf(now);
    const since = dayOf(new Date(now.getFullYear(), now.getMonth() - 5, 1));
    const recentMonth = monthOf(new Date(now.getFullYear(), now.getMonth() - 2, 1));

    const [sessions, records, unconfigured, monthRows, settlements, payees] = await Promise.all([
      this.prisma.courseSession.findMany({
        where: {
          date: { gte: since, lte: today },
          course: { status: 1, sessionFee: { not: null } },
          OR: [{ status: 'completed' }, { status: 'scheduled', completionMode: 'auto' }],
        },
        select: { courseId: true, date: true, course: { select: { title: true } } },
      }),
      this.prisma.profitRecord.findMany({
        where: { sessionDate: { gte: since } },
        select: { courseId: true, sessionDate: true },
      }),
      this.prisma.sessionIncome.findMany({
        where: { status: 'unconfigured' },
        select: { course: { select: { title: true } } },
        take: 500,
      }),
      this.prisma.profitRecord.groupBy({ by: ['settlementMonth'], _count: true }),
      this.prisma.monthlySettlement.findMany({ where: { locked: true }, select: { month: true } }),
      this.prisma.profitRecord.groupBy({
        by: ['teacherId'],
        where: { settlementMonth: { gte: recentMonth }, teacherId: { not: null }, teacherAmount: { gt: 0 } },
      }),
    ]);

    const synced = new Set(records.map((r) => `${r.courseId}|${r.sessionDate}`));
    const missing = sessions.filter((s) => !synced.has(`${s.courseId}|${s.date}`));
    const missingByCourse = new Map<string, number>();
    for (const s of missing) missingByCourse.set(s.course.title, (missingByCourse.get(s.course.title) || 0) + 1);

    const unconfiguredByCourse = new Map<string, number>();
    for (const r of unconfigured) {
      const title = r.course?.title || '未知课程';
      unconfiguredByCourse.set(title, (unconfiguredByCourse.get(title) || 0) + 1);
    }

    const lockedSet = new Set(settlements.map((s) => s.month));
    const unlocked = monthRows
      .map((m) => m.settlementMonth)
      .filter((m) => m && m < thisMonth && !lockedSet.has(m))
      .sort();

    const teacherIds = payees.map((p) => p.teacherId!).filter(Boolean);
    const teachers = teacherIds.length
      ? await this.prisma.user.findMany({
        where: { id: { in: teacherIds } },
        select: { id: true, nickname: true, teacherCert: { select: { realName: true, bankName: true, bankAccount: true } } },
      })
      : [];
    const noBank = teachers.filter((t) => !(String(t.teacherCert?.bankAccount || '').trim() && String(t.teacherCert?.bankName || '').trim()));

    const countSamples = (map: Map<string, number>, to: string) =>
      [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, SAMPLE_LIMIT).map(([title, n]) => ({ label: `${title} ×${n}`, to }));

    return [
      {
        id: 'finance.unsynced',
        level: 'warn',
        title: '已上课次未同步收益',
        desc: '近 6 个月有已上（或已到期自动完课）的课次还没同步收益，结算单与打款会少算。',
        okText: '近 6 个月课次均已同步',
        count: missing.length,
        samples: countSamples(missingByCourse, '/finance'),
        link: { to: '/finance', label: '去收益概览同步' },
      },
      {
        id: 'finance.unconfiguredIncome',
        level: 'error',
        title: '教师收入未配置费用',
        desc: '这些课次的教师收入状态为「未配置」，教师端看不到金额、也无法正确结算。',
        okText: '没有未配置的教师收入',
        count: unconfigured.length,
        samples: countSamples(unconfiguredByCourse, '/incomes'),
        link: { to: '/incomes', label: '去收入记录' },
      },
      {
        id: 'finance.unlockedMonths',
        level: 'warn',
        title: '往月结算单未固定',
        desc: '往月结算单未固定前，收益概览、教师收益、机构利润都不统计这些月份。',
        okText: '往月结算单均已固定',
        count: unlocked.length,
        samples: unlocked.slice(0, SAMPLE_LIMIT).map((m) => ({ label: m, to: `/finance/statement?month=${m}` })),
        link: { to: unlocked.length ? `/finance/statement?month=${unlocked[0]}` : '/finance/statement', label: '去月度结算单' },
      },
      {
        id: 'finance.teacherNoBank',
        level: 'warn',
        title: '教师收款账户',
        desc: '近 3 个月有课时费的教师没填开户行 / 银行账号，财务打款时不知道往哪打。',
        okText: '有课时费的教师收款账户齐全',
        count: noBank.length,
        samples: noBank.slice(0, SAMPLE_LIMIT).map((t) => ({
          label: t.teacherCert?.realName || t.nickname || `教师#${t.id}`,
          to: `/faculty/${t.id}`,
        })),
        link: { to: '/faculty', label: '去教师管理' },
      },
    ];
  }

  private async splitChecks(): Promise<CheckItem[]> {
    const now = new Date();
    const recentMonth = monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const [configRow, collections, recentCourses, lastLocked] = await Promise.all([
      this.prisma.appSetting.findUnique({ where: { key: SPLIT_CONFIG_KEY } }),
      this.prisma.splitCollection.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
      this.prisma.profitRecord.groupBy({ by: ['courseId'], where: { settlementMonth: { gte: recentMonth } } }),
      this.prisma.monthlySettlement.findFirst({ where: { locked: true }, orderBy: { month: 'desc' }, select: { month: true } }),
    ]);

    const parsed = collections.map((c) => {
      const parse = (raw: string) => {
        try {
          const v = JSON.parse(raw || '[]');
          return Array.isArray(v) ? v : [];
        } catch {
          return [];
        }
      };
      return { id: c.id, name: c.name, courseIds: parse(c.courseIds).map(Number), members: parse(c.members) };
    });
    const covered = new Set(parsed.flatMap((c) => c.courseIds));
    const uncoveredIds = parsed.length ? recentCourses.map((r) => r.courseId).filter((id) => !covered.has(id)) : [];
    const uncovered = uncoveredIds.length
      ? await this.prisma.course.findMany({ where: { id: { in: uncoveredIds } }, select: { id: true, title: true } })
      : [];

    const memberUserIds = [...new Set(parsed.flatMap((c) => c.members.map((m: any) => Number(m?.userId)).filter((id) => id > 0)))];
    const users = memberUserIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: memberUserIds } }, select: { id: true, status: true } })
      : [];
    const okUsers = new Set(users.filter((u) => u.status === 1).map((u) => u.id));
    const badMembers = parsed.flatMap((c) =>
      c.members
        .filter((m: any) => Number(m?.userId) > 0 && !okUsers.has(Number(m.userId)))
        .map((m: any) => ({ label: `${c.name}：${m.name || `用户#${m.userId}`}`, to: '/finance/split' })),
    );

    let unpaid = { count: 0, amount: 0, month: '' };
    if (lastLocked?.month) {
      try {
        const payouts = await this.finance.splitPayouts(lastLocked.month);
        unpaid = { count: payouts.totals.unpaidCount, amount: payouts.totals.unpaid, month: lastLocked.month };
      } catch {
        unpaid = { count: 0, amount: 0, month: lastLocked.month };
      }
    }

    return [
      {
        id: 'split.config',
        level: 'warn',
        title: '分成计算规则',
        desc: '还没保存过计算规则，正在使用默认值（税率 0%、每 5000 元手续费 4.5），请确认税率与手续费后保存。',
        okText: '已确认',
        count: configRow ? 0 : 1,
        link: { to: '/finance/split', label: '去分成比例' },
      },
      {
        id: 'split.collections',
        level: 'info',
        title: '分成合集',
        desc: '还没有分成合集；不做利润分成可忽略。',
        okText: `${parsed.length} 个合集`,
        count: parsed.length ? 0 : 1,
        link: { to: '/finance/split', label: '去新建合集' },
        ignorable: true,
      },
      {
        id: 'split.uncovered',
        level: 'warn',
        title: '有收益但未归入合集的课程',
        desc: '近两个月有收益的课程没放进任何合集，这部分利润不会参与分成。',
        okText: parsed.length ? '有收益的课程都已归入合集' : '未启用分成',
        count: uncovered.length,
        samples: uncovered.slice(0, SAMPLE_LIMIT).map((c) => ({ label: c.title, to: '/finance/split' })),
        link: { to: '/finance/split', label: '去编辑合集' },
        ignorable: true,
      },
      {
        id: 'split.badMember',
        level: 'error',
        title: '分成人员账号异常',
        desc: '合集里绑定的用户已删除或被冻结，分成仍会计算但无法正常打款。',
        okText: '分成人员账号正常',
        count: badMembers.length,
        samples: badMembers.slice(0, SAMPLE_LIMIT),
        link: { to: '/finance/split', label: '去编辑合集' },
      },
      {
        id: 'payout.unpaid',
        level: 'info',
        title: '最近固定月份待打款',
        desc: unpaid.month
          ? `${unpaid.month} 还有 ${unpaid.count} 笔未标记打款，合计 ¥${unpaid.amount.toFixed(2)}。`
          : '还没有固定的月份。',
        okText: unpaid.month ? `${unpaid.month} 已全部打款` : '暂无已固定月份',
        count: unpaid.count,
        link: { to: unpaid.month ? `/finance/payouts?month=${unpaid.month}` : '/finance/payouts', label: '去财务打款' },
      },
    ];
  }
}
