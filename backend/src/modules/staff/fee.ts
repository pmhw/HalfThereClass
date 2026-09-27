export type FeeMode = 'percent' | 'fixed' | null;
export type FeeVisibility = 'full' | 'final' | 'hidden';

export type FeeQuote = {
  configured: boolean;
  /** 课程标准课时费（教师所得基数） */
  baseFee: number | null;
  /** 机构分佣（单节）；不从教师课时费里扣除 */
  commission: number | null;
  /** 教师实得 = 课时费 */
  teacherFee: number | null;
  mode: FeeMode;
  value: number | null;
  visibility: FeeVisibility;
};

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * 课时费归教师；机构分佣按固定金额/节或按课时费比例另计，不从教师课时费扣减。
 * 平台利润在财务模块用：校方价格 − 课时费 − 分佣。
 */
export function calculateFee(input: {
  base: number | null;
  hasOrg: boolean;
  mode?: string | null;
  value?: number | null;
  visibility?: string | null;
}): FeeQuote {
  const visibility = (input.visibility === 'full' || input.visibility === 'hidden' ? input.visibility : 'final') as FeeVisibility;
  if (input.base == null || Number.isNaN(Number(input.base))) {
    return { configured: false, baseFee: null, commission: null, teacherFee: null, mode: null, value: null, visibility };
  }
  const baseFee = roundMoney(Number(input.base));
  if (!input.hasOrg) {
    return { configured: true, baseFee, commission: 0, teacherFee: baseFee, mode: null, value: null, visibility: 'final' };
  }
  const mode = input.mode === 'fixed' ? 'fixed' : 'percent';
  const raw = Number(input.value || 0);
  let commission = mode === 'percent' ? roundMoney(baseFee * raw / 100) : roundMoney(raw);
  if (commission < 0) commission = 0;
  return {
    configured: true,
    baseFee,
    commission,
    teacherFee: baseFee,
    mode,
    value: raw,
    visibility,
  };
}

export function teacherFeeView(quote: FeeQuote) {
  if (!quote.configured || quote.visibility === 'hidden') {
    return { configured: quote.configured, showFee: false };
  }
  if (quote.visibility === 'full') {
    return {
      configured: true,
      showFee: true,
      teacherFee: quote.teacherFee,
      baseFee: quote.baseFee,
      commission: quote.commission,
    };
  }
  return { configured: true, showFee: true, teacherFee: quote.teacherFee };
}
