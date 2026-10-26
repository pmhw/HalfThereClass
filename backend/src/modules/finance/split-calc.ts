/**
 * 分成计算（与 admin/src/split.js 保持同一口径）：
 * 每个合集：基数（利润 / 校方合计）− 教师课时费打款手续费 − 机构打款手续费（平台承担时）− 关联该合集的当月报销 = 可分配；
 * 人员应分 = 可分配 × 比例，税费 = 应分 × 税率。
 * 同一收款人（同一用户 / 同名虚拟人员）当月跨合集合并为一笔转账：手续费按（应分合计 − 税费合计）分档只收一次，
 * 再按各合集应分占比分摊回各合集。收款人若同时是授课教师，再与其课时费合并为一笔（见 payees 计算）。
 */
export type SplitConfigLike = {
  taxRate: number;
  feeUnit: number;
  feeStep: number;
  basis: 'profit' | 'school';
  teacherFee: boolean;
  orgFee?: boolean;
  memberFee: boolean;
};

export type SplitMember = { name: string; ratio: number; userId?: number | null };
export type SplitCollectionLike = { id: number; name: string; courseIds: number[]; members: SplitMember[] };
/** 报销单扣除：审核通过 / 已报销且关联合集的当月报销 */
export type SplitDeduction = { id: number; collectionId: number; amount: number; title?: string; userName?: string; status?: string };

export type CourseStat = {
  courseId: number;
  sessionCount: number;
  schoolAmount: number;
  teacherAmount: number;
  institutionAmount: number;
  costAmount: number;
  profitAmount: number;
  teachers: Array<{ teacherId: number | null; name: string; amount: number }>;
  orgs?: Array<{ orgId: number; name: string; amount: number }>;
};

export const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function transferFee(amount: number, config: SplitConfigLike) {
  const value = round2(amount);
  const step = Number(config.feeStep) || 0;
  if (value <= 0 || step <= 0) return 0;
  return round2((Number(config.feeUnit) || 0) * Math.ceil(value / step));
}

export function payeeKey(member: SplitMember) {
  return member.userId ? `u:${member.userId}` : `n:${String(member.name || '').trim()}`;
}

export function computeSplitMonth(
  collections: SplitCollectionLike[],
  statsMap: Map<number, CourseStat>,
  config: SplitConfigLike,
  deductions: SplitDeduction[] = [],
) {
  const taxRate = Number(config.taxRate) || 0;
  // 教师每月只转一笔：手续费按当月全部课程的课时费合计计算，再按金额分摊到各合集
  const teacherTotals = new Map<string, number>();
  for (const stat of statsMap.values()) {
    for (const t of stat.teachers || []) {
      const key = t.teacherId ? `id:${t.teacherId}` : `name:${t.name}`;
      teacherTotals.set(key, round2((teacherTotals.get(key) || 0) + Number(t.amount || 0)));
    }
  }
  // 机构同样每月一笔：手续费按机构当月合计计算，再按金额分摊到各合集
  const orgTotals = new Map<number, number>();
  for (const stat of statsMap.values()) {
    for (const o of stat.orgs || []) orgTotals.set(o.orgId, round2((orgTotals.get(o.orgId) || 0) + Number(o.amount || 0)));
  }
  const calcs = collections.map((collection) => {
    const sum = { sessionCount: 0, schoolAmount: 0, teacherAmount: 0, institutionAmount: 0, costAmount: 0, profitAmount: 0 };
    const teacherMap = new Map<string, { key: string; name: string; amount: number }>();
    const orgMap = new Map<number, { key: string; orgId: number; name: string; amount: number }>();
    for (const id of collection.courseIds || []) {
      const stat = statsMap.get(Number(id));
      if (!stat) continue;
      for (const key of Object.keys(sum) as Array<keyof typeof sum>) sum[key] = round2(sum[key] + Number(stat[key] || 0));
      for (const t of stat.teachers || []) {
        const key = t.teacherId ? `id:${t.teacherId}` : `name:${t.name}`;
        const cur = teacherMap.get(key) || { key, name: t.name, amount: 0 };
        cur.amount = round2(cur.amount + Number(t.amount || 0));
        teacherMap.set(key, cur);
      }
      for (const o of stat.orgs || []) {
        const cur = orgMap.get(o.orgId) || { key: `o:${o.orgId}`, orgId: o.orgId, name: o.name, amount: 0 };
        cur.amount = round2(cur.amount + Number(o.amount || 0));
        orgMap.set(o.orgId, cur);
      }
    }
    const teachers = [...teacherMap.values()]
      .map((t) => {
        const total = teacherTotals.get(t.key) || t.amount;
        const fee = config.teacherFee && total > 0 ? round2((transferFee(total, config) * t.amount) / total) : 0;
        return { ...t, total, fee };
      })
      .sort((a, b) => b.amount - a.amount);
    const teacherFeeTotal = round2(teachers.reduce((acc, t) => acc + t.fee, 0));
    const orgs = [...orgMap.values()]
      .map((o) => {
        const total = orgTotals.get(o.orgId) || o.amount;
        const fee = config.orgFee && total > 0 ? round2((transferFee(total, config) * o.amount) / total) : 0;
        return { ...o, total, fee };
      })
      .sort((a, b) => b.amount - a.amount);
    const orgFeeTotal = round2(orgs.reduce((acc, o) => acc + o.fee, 0));
    const base = config.basis === 'school' ? sum.schoolAmount : sum.profitAmount;
    const reimbursements = deductions.filter((d) => Number(d.collectionId) === Number(collection.id));
    const reimburseTotal = round2(reimbursements.reduce((acc, d) => acc + Number(d.amount || 0), 0));
    const pool = round2(Math.max(0, base - teacherFeeTotal - orgFeeTotal - reimburseTotal));
    const members = (collection.members || []).map((m) => {
      const ratio = Number(m.ratio) || 0;
      const gross = round2((pool * ratio) / 100);
      const tax = round2((gross * taxRate) / 100);
      return { key: payeeKey(m), name: m.name, userId: m.userId || null, ratio, gross, tax, fee: 0, net: 0, merged: false, withTeacher: false };
    });
    return { id: collection.id, name: collection.name, ...sum, base, teachers, teacherFeeTotal, orgs, orgFeeTotal, reimbursements, reimburseTotal, pool, members };
  });

  const payeeMap = new Map<string, any>();
  for (const calc of calcs) {
    for (const m of calc.members) {
      const cur = payeeMap.get(m.key) || { key: m.key, name: m.name, userId: m.userId, gross: 0, tax: 0, fee: 0, net: 0, items: [] as any[] };
      cur.gross = round2(cur.gross + m.gross);
      cur.tax = round2(cur.tax + m.tax);
      cur.items.push({ collectionId: calc.id, collectionName: calc.name, ratio: m.ratio, member: m });
      payeeMap.set(m.key, cur);
    }
  }

  const payees = [...payeeMap.values()].map((p) => {
    // 收款人同时是授课教师：分成与课时费合并为一笔转账，手续费按合计金额分档只收一次。
    // 课时费部分仍按原口径承担自己的手续费（不影响分成池），分成部分只承担合并后多出的手续费。
    const teacherAmount = p.userId ? teacherTotals.get(`id:${p.userId}`) || 0 : 0;
    const splitAmount = round2(p.gross - p.tax);
    if (teacherAmount > 0) {
      const teacherOwnFee = transferFee(teacherAmount, config);
      const combinedFee = transferFee(teacherAmount + splitAmount, config);
      p.withTeacher = { amount: teacherAmount, ownFee: teacherOwnFee, combinedFee };
      p.fee = config.memberFee ? round2(Math.max(0, combinedFee - teacherOwnFee)) : 0;
    } else {
      p.withTeacher = null;
      p.fee = config.memberFee ? transferFee(splitAmount, config) : 0;
    }
    p.net = round2(Math.max(0, p.gross - p.tax - p.fee));
    // 手续费按应分占比分摊回各合集，最后一项吃尾差
    let left = p.fee;
    p.items.forEach((item: any, idx: number) => {
      const m = item.member;
      const share = idx === p.items.length - 1 ? round2(left) : (p.gross > 0 ? round2((p.fee * m.gross) / p.gross) : 0);
      left = round2(left - share);
      m.fee = share;
      m.net = round2(Math.max(0, m.gross - m.tax - share));
      m.merged = p.items.length > 1;
      m.withTeacher = !!p.withTeacher;
    });
    return {
      key: p.key,
      name: p.name,
      userId: p.userId,
      gross: p.gross,
      tax: p.tax,
      fee: p.fee,
      net: p.net,
      withTeacher: p.withTeacher as { amount: number; ownFee: number; combinedFee: number } | null,
      items: p.items.map((item: any) => ({
        collectionId: item.collectionId,
        collectionName: item.collectionName,
        ratio: item.ratio,
        gross: item.member.gross,
        tax: item.member.tax,
        fee: item.member.fee,
        net: item.member.net,
      })),
    };
  });

  return { collections: calcs, payees };
}
