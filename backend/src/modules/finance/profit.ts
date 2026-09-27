import { roundMoney } from '@/modules/staff/fee';

/**
 * 单节课利润（与机构分佣 / 课时费一致）：
 *   教师所得 = 课时费
 *   机构所得 = 分佣（固定金额/节 或 按课时费比例；不从教师课时费里扣）
 *   平台利润 = 校方价格 − 课时费 − 分佣
 *
 * 全职机构分佣多为 0：平台利润 = 校方价格 − 课时费
 * 兼职机构固定抽成：平台利润 = 校方价格 − 课时费 − 分佣值
 * 一般定价：校方价格 ≈ 课时费 + 分佣值
 */
export type SessionProfit = {
  schoolPrice: number;
  sessionFee: number;
  teacherAmount: number;
  institutionAmount: number;
  platformAmount: number;
  costAmount: number;
  teacherRate: number | null;
  institutionRate: number | null;
  platformRate: number | null;
  commissionMode: string | null;
  commissionValue: number | null;
};

export function calculateSessionProfit(input: {
  schoolPrice: number | null | undefined;
  sessionFee: number | null | undefined;
  commission?: number | null;
  commissionMode?: string | null;
  commissionValue?: number | null;
  teacherFee?: number | null;
}): SessionProfit {
  const schoolPrice = roundMoney(Math.max(0, Number(input.schoolPrice) || 0));
  const sessionFee = roundMoney(Math.max(0, Number(
    input.sessionFee != null ? input.sessionFee : input.teacherFee,
  ) || 0));
  const institutionAmount = roundMoney(Math.max(0, Number(input.commission) || 0));
  const teacherAmount = roundMoney(
    input.teacherFee != null ? Math.max(0, Number(input.teacherFee) || 0) : sessionFee,
  );
  const costAmount = roundMoney(teacherAmount + institutionAmount);
  const platformAmount = roundMoney(schoolPrice - teacherAmount - institutionAmount);
  const rate = (part: number) => (schoolPrice > 0 ? roundMoney(part / schoolPrice) : null);

  return {
    schoolPrice,
    sessionFee,
    teacherAmount,
    institutionAmount,
    platformAmount,
    costAmount,
    teacherRate: rate(teacherAmount),
    institutionRate: rate(institutionAmount),
    platformRate: rate(platformAmount),
    commissionMode: input.commissionMode || null,
    commissionValue: input.commissionValue == null ? null : Number(input.commissionValue),
  };
}

export function monthKey(date: Date | string | null | undefined) {
  const d = date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  // date 可能已是 YYYY-MM-DD
  if (typeof date === 'string' && /^\d{4}-\d{2}/.test(date)) {
    return date.slice(0, 7);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function prevMonthKey(month: string) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function moneyPct(part: number, total: number) {
  if (!total) return 0;
  return roundMoney((part / total) * 100);
}
