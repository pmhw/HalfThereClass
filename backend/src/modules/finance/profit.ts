import { roundMoney } from '@/modules/staff/fee';

export type ShareMode = 'percent' | 'fixed' | 'per_lesson' | 'per_student';

export type ProfitSplit = {
  totalAmount: number;
  refundAmount: number;
  netAmount: number;
  teacherAmount: number;
  institutionAmount: number;
  platformAmount: number;
  teacherRate: number | null;
  institutionRate: number | null;
  platformRate: number | null;
  teacherShareMode: ShareMode;
  institutionShareMode: ShareMode;
};

function asMode(value: string | null | undefined, fallback: ShareMode): ShareMode {
  if (value === 'percent' || value === 'fixed' || value === 'per_lesson' || value === 'per_student') return value;
  return fallback;
}

export function calcPart(
  netAmount: number,
  mode: ShareMode,
  value: number,
  ctx: { lessonCount?: number; studentCount?: number },
) {
  const v = Number(value) || 0;
  if (mode === 'fixed') return roundMoney(Math.max(0, v));
  if (mode === 'per_lesson') return roundMoney(Math.max(0, v * Number(ctx.lessonCount || 0)));
  if (mode === 'per_student') return roundMoney(Math.max(0, v * Math.max(1, Number(ctx.studentCount || 1))));
  return roundMoney(Math.max(0, netAmount * v / 100));
}

/** 平台利润 = 净收入 - 教师所得 - 机构所得（不会为负到超过净收入之外，超额按比例压缩） */
export function calculateProfitSplit(input: {
  totalAmount: number;
  refundAmount?: number;
  teacherShareMode?: string | null;
  teacherShareValue?: number | null;
  institutionShareMode?: string | null;
  institutionShareValue?: number | null;
  lessonCount?: number;
  studentCount?: number;
}): ProfitSplit {
  const totalAmount = roundMoney(Math.max(0, Number(input.totalAmount) || 0));
  const refundAmount = roundMoney(Math.max(0, Math.min(totalAmount, Number(input.refundAmount) || 0)));
  const netAmount = roundMoney(totalAmount - refundAmount);
  const teacherShareMode = asMode(input.teacherShareMode, 'percent');
  const institutionShareMode = asMode(input.institutionShareMode, 'percent');
  const teacherShareValue = input.teacherShareValue == null ? 50 : Number(input.teacherShareValue);
  const institutionShareValue = input.institutionShareValue == null ? 20 : Number(input.institutionShareValue);
  const ctx = { lessonCount: input.lessonCount, studentCount: input.studentCount };

  let teacherAmount = netAmount <= 0 ? 0 : calcPart(netAmount, teacherShareMode, teacherShareValue, ctx);
  let institutionAmount = netAmount <= 0 ? 0 : calcPart(netAmount, institutionShareMode, institutionShareValue, ctx);

  if (teacherAmount + institutionAmount > netAmount && netAmount > 0) {
    const scale = netAmount / (teacherAmount + institutionAmount);
    teacherAmount = roundMoney(teacherAmount * scale);
    institutionAmount = roundMoney(netAmount - teacherAmount);
  }

  const platformAmount = roundMoney(netAmount - teacherAmount - institutionAmount);
  const rate = (part: number) => (netAmount > 0 ? roundMoney(part / netAmount) : null);

  return {
    totalAmount,
    refundAmount,
    netAmount,
    teacherAmount,
    institutionAmount,
    platformAmount,
    teacherRate: rate(teacherAmount),
    institutionRate: rate(institutionAmount),
    platformRate: rate(platformAmount),
    teacherShareMode,
    institutionShareMode,
  };
}

export function monthKey(date: Date | string | null | undefined) {
  const d = date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
