export const DEFAULT_SPLIT_CONFIG = {
  taxRate: 0,
  feeUnit: 4.5,
  feeStep: 5000,
  basis: 'profit',
  teacherFee: true,
  orgFee: true,
  memberFee: true,
};

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** 单笔转账手续费：每 feeStep 元（不足按一档）收 feeUnit 元，如 5000 内 4.5，5000.01~10000 为 9 */
export function transferFee(amount, config = DEFAULT_SPLIT_CONFIG) {
  const value = round2(amount);
  const step = Number(config.feeStep) || 0;
  if (value <= 0 || step <= 0) return 0;
  return round2((Number(config.feeUnit) || 0) * Math.ceil(value / step));
}

/** 说明文字里的金额：¥28,931.26 */
export function yuan(value) {
  return `¥${(Number(value) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function feeTiers(amount, config) {
  const step = Number(config.feeStep) || 0;
  return amount > 0 && step > 0 ? Math.ceil(round2(amount) / step) : 0;
}

/** 计算说明（与后端结算单 sheetNotes 同一口径），给股东看的截图 / 打印用 */
export function splitNotes(config = DEFAULT_SPLIT_CONFIG) {
  const step = Number(config.feeStep) || 0;
  const unit = Number(config.feeUnit) || 0;
  const basis = config.basis === 'school' ? '校方金额' : '利润（校方金额 − 课时费等成本）';
  const cuts = [config.teacherFee ? '教师课时费转账手续费' : '', config.orgFee ? '机构转账手续费' : '', '计入该合集的报销'].filter(Boolean);
  return [
    `分成池（可分配）= ${basis} − ${cuts.join(' − ')}。`,
    `成员应分 = 分成池 × 分成比例；税费 = 应分 × ${Number(config.taxRate) || 0}%，从每人应分中代扣，留在对公账户用于缴税，不参与分配。比例合计不足 100% 的部分为「未分配留存」，同样留在对公账户。`,
    step > 0
      ? `转账手续费按每笔转账金额计：每 ${yuan(step)} 收 ${yuan(unit)}，不足 ${yuan(step)} 也按一档（例如 ${yuan(step * 1.2)} 收 ${yuan(unit * 2)}）。`
      : '转账不收手续费。',
    `教师课时费：每位教师当月所有课合并为一笔转账，手续费${config.teacherFee ? '由平台承担，按课时费金额摊到各合集分成池中扣除，教师全额到账' : '从课时费中扣除'}。`
      + `机构款同样每月一笔，手续费${config.orgFee ? '由平台承担、从分成池扣除' : '从机构款中扣除'}。`,
    config.memberFee
      ? '分成人员到账扣转账手续费。同一人当月在多个合集都有分成、或同时领课时费的，合并为一笔转账，手续费按合计金额只收一次；合并后由分成承担的手续费，按各合集应分金额比例分摊，所以单个合集里会出现带零头的手续费，加起来仍是整档。'
      : '分成人员到账不扣转账手续费。',
    '报销款随同一笔转账发放，不扣税、不扣手续费。实发 = 应分 − 税费 − 手续费（+ 报销）。',
  ];
}

/** 合集成员行说明：跨合集或与本人课时费合并打款时，写清手续费怎么来的 */
export function memberFeeNote(calc, member, payee, config = DEFAULT_SPLIT_CONFIG) {
  if (!payee) return '';
  const merged = payee.items.length > 1;
  const wt = payee.withTeacher;
  if (!merged && !wt) return '';
  const who = [];
  const others = payee.items.filter((i) => i.collectionId !== calc.id).map((i) => `「${i.collectionName}」`);
  if (others.length) who.push(`在${others.join('、')}也有分成`);
  if (wt) who.push(`同时领课时费 ${yuan(wt.amount)}`);
  let text = `${who.join('，')}，合并为一笔转账，手续费按合计金额只收一次`;
  const splitNet = round2(payee.gross - payee.tax);
  if (!config.memberFee) {
    const extra = wt ? round2(Math.max(0, wt.combinedFee - wt.ownFee)) : 0;
    return `${text}；${extra > 0 ? `合并后多出的 ${yuan(extra)} 由平台承担，` : ''}分成到账不扣手续费`;
  }
  if (wt) {
    const total = round2(wt.amount + splitNet);
    text += `：课时费 ${yuan(wt.amount)} + 分成 ${yuan(splitNet)}（已扣税）= ${yuan(total)}，手续费 ${yuan(wt.combinedFee)}（${feeTiers(total, config)} 档）；`
      + `课时费单独转账本应 ${yuan(wt.ownFee)}（${feeTiers(wt.amount, config)} 档），${config.teacherFee ? '由平台承担' : '从课时费中扣'}`;
    text += payee.fee > 0 ? `，多出的 ${yuan(payee.fee)} 由分成承担` : '，合并后未跨档，分成不再收手续费';
  } else {
    text += `：应分合计 ${yuan(payee.gross)} − 税 ${yuan(payee.tax)} = ${yuan(splitNet)}，手续费 ${yuan(payee.fee)}（${feeTiers(splitNet, config)} 档）`;
  }
  if (merged && payee.fee > 0) text += `，按各合集应分金额比例分摊，本合集承担 ${yuan(member.fee)}`;
  return text;
}

/** 收款人标识：选了用户按用户，虚拟人员按姓名 */
export function payeeKey(member) {
  return member?.userId ? `u:${member.userId}` : `n:${String(member?.name || '').trim()}`;
}

/**
 * 计算一个月所有合集的分成（与后端 split-calc.ts 同一口径）：
 * 每个合集：基数（利润 / 校方合计）− 教师课时费打款手续费 − 机构打款手续费（平台承担时）− 关联该合集的当月报销 = 可分配；
 * 人员应分 = 可分配 × 比例，税费 = 应分 × 税率。
 * 同一收款人当月跨合集合并为一笔转账：手续费按（应分合计 − 税费合计）分档只收一次，再按应分占比分摊回各合集。
 */
export function computeSplitMonth(collections, statsMap, config = DEFAULT_SPLIT_CONFIG, deductions = []) {
  const taxRate = Number(config.taxRate) || 0;
  // 教师每月只转一笔：手续费按当月全部课程的课时费合计计算，再按金额分摊到各合集
  const teacherTotals = new Map();
  for (const stat of statsMap.values()) {
    for (const t of stat.teachers || []) {
      const key = t.teacherId ? `id:${t.teacherId}` : `name:${t.name}`;
      teacherTotals.set(key, round2((teacherTotals.get(key) || 0) + Number(t.amount || 0)));
    }
  }
  // 机构同样每月一笔：手续费按机构当月合计计算，再按金额分摊到各合集
  const orgTotals = new Map();
  for (const stat of statsMap.values()) {
    for (const o of stat.orgs || []) orgTotals.set(o.orgId, round2((orgTotals.get(o.orgId) || 0) + Number(o.amount || 0)));
  }
  const calcs = (collections || []).map((collection) => {
    const sum = { sessionCount: 0, schoolAmount: 0, teacherAmount: 0, institutionAmount: 0, costAmount: 0, profitAmount: 0 };
    const teacherMap = new Map();
    const orgMap = new Map();
    for (const id of collection?.courseIds || []) {
      const stat = statsMap.get(Number(id));
      if (!stat) continue;
      for (const key of Object.keys(sum)) sum[key] = round2(sum[key] + Number(stat[key] || 0));
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
        const fee = config.teacherFee && total > 0 ? round2(transferFee(total, config) * t.amount / total) : 0;
        return { ...t, total, fee };
      })
      .sort((a, b) => b.amount - a.amount);
    const teacherFeeTotal = round2(teachers.reduce((acc, t) => acc + t.fee, 0));
    const orgs = [...orgMap.values()]
      .map((o) => {
        const total = orgTotals.get(o.orgId) || o.amount;
        const fee = config.orgFee && total > 0 ? round2(transferFee(total, config) * o.amount / total) : 0;
        return { ...o, total, fee };
      })
      .sort((a, b) => b.amount - a.amount);
    const orgFeeTotal = round2(orgs.reduce((acc, o) => acc + o.fee, 0));
    const base = config.basis === 'school' ? sum.schoolAmount : sum.profitAmount;
    const reimbursements = (deductions || []).filter((d) => Number(d.collectionId) === Number(collection?.id));
    const reimburseTotal = round2(reimbursements.reduce((acc, d) => acc + Number(d.amount || 0), 0));
    const pool = round2(Math.max(0, base - teacherFeeTotal - orgFeeTotal - reimburseTotal));
    const members = (collection?.members || []).map((m) => {
      const ratio = Number(m.ratio) || 0;
      const gross = round2(pool * ratio / 100);
      const tax = round2(gross * taxRate / 100);
      return { key: payeeKey(m), name: m.name, userId: m.userId || null, ratio, gross, tax, fee: 0, net: 0, merged: false, withTeacher: false };
    });
    return { id: collection?.id, name: collection?.name, ...sum, base, teachers, teacherFeeTotal, orgs, orgFeeTotal, reimbursements, reimburseTotal, pool, members };
  });

  const payeeMap = new Map();
  for (const calc of calcs) {
    for (const m of calc.members) {
      if (!m.name && !m.userId) continue;
      const cur = payeeMap.get(m.key) || { key: m.key, name: m.name, userId: m.userId, gross: 0, tax: 0, fee: 0, net: 0, items: [] };
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
    let left = p.fee;
    p.items.forEach((item, idx) => {
      const m = item.member;
      const share = idx === p.items.length - 1 ? round2(left) : (p.gross > 0 ? round2(p.fee * m.gross / p.gross) : 0);
      left = round2(left - share);
      m.fee = share;
      m.net = round2(Math.max(0, m.gross - m.tax - share));
      m.merged = p.items.length > 1;
      m.withTeacher = !!p.withTeacher;
    });
    return p;
  });

  for (const calc of calcs) {
    calc.ratioSum = round2(calc.members.reduce((acc, m) => acc + m.ratio, 0));
    calc.totals = calc.members.reduce(
      (acc, m) => ({
        gross: round2(acc.gross + m.gross),
        tax: round2(acc.tax + m.tax),
        fee: round2(acc.fee + m.fee),
        net: round2(acc.net + m.net),
      }),
      { gross: 0, tax: 0, fee: 0, net: 0 },
    );
    calc.retained = round2(calc.pool - calc.totals.gross);
  }

  return { collections: calcs, payees };
}
