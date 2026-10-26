import { roundMoney } from '@/modules/staff/fee';

/**
 * 单节课利润：
 *   教师所得 = 教师实得课时费（承接机构课：课时费 − 机构利润）
 *   机构利润 = 机构抽成（归属机构，不是平台）
 *   平台利润 = 校方价格 − 教师所得 − 机构利润（承接机构课即 校方价格 − 课时费）
 *
 * 机构设为「不展示金额」时直接结算给机构：
 *   教师所得记 0，机构结算额 = 教师部分 + 机构利润，由机构自行给老师发放
 */
export type SessionProfit = {
  schoolPrice: number;
  sessionFee: number;
  teacherAmount: number;
  institutionAmount: number;
  platformAmount: number;
  costAmount: number;
  orgSettleAmount: number;
  settleTo: 'teacher' | 'org';
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
  settleToOrg?: boolean;
}): SessionProfit {
  const schoolPrice = roundMoney(Math.max(0, Number(input.schoolPrice) || 0));
  const institutionAmount = roundMoney(Math.max(0, Number(input.commission) || 0));
  const teacherShare = roundMoney(Math.max(0, Number(
    input.teacherFee != null ? input.teacherFee : input.sessionFee,
  ) || 0));
  const sessionFee = input.sessionFee != null
    ? roundMoney(Math.max(0, Number(input.sessionFee) || 0))
    : teacherShare;
  const costAmount = roundMoney(teacherShare + institutionAmount);
  const platformAmount = roundMoney(schoolPrice - costAmount);
  const settleTo = input.settleToOrg ? 'org' : 'teacher';
  const teacherAmount = settleTo === 'org' ? 0 : teacherShare;
  const orgSettleAmount = settleTo === 'org' ? costAmount : institutionAmount;
  const rate = (part: number) => (schoolPrice > 0 ? roundMoney(part / schoolPrice) : null);

  return {
    schoolPrice,
    sessionFee,
    teacherAmount,
    institutionAmount,
    platformAmount,
    costAmount,
    orgSettleAmount,
    settleTo,
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
