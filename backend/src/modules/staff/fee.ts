export type FeeMode = 'percent' | 'fixed' | null;
export type FeeVisibility = 'full' | 'final' | 'hidden';

export type FeeQuote = {
  configured: boolean;
  /** 课程标准课时费（教师所得基数） */
  baseFee: number | null;
  /** 机构分佣（单节） */
  commission: number | null;
  /** 教师实得课时费 */
  teacherFee: number | null;
  mode: FeeMode;
  value: number | null;
  visibility: FeeVisibility;
  /** 校方价格（有承接机构时用于拆分） */
  schoolPrice?: number | null;
  /** 平台利润（承接机构课程：校方价格 − 课时费） */
  platformAmount?: number | null;
  /** course_org: 课时费−机构=教师；teacher_org: 旧版课时费+机构另计 */
  splitMode?: 'course_org' | 'teacher_org' | 'none';
};

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * 承接机构课程拆分：
 *   平台利润 = 校方价格 − 课时费
 *   机构利润 = 固定金额 / 或按课时费比例
 *   教师课时费 = 课时费 − 机构利润（教师只看这一项）
 * 例：校方 1200、课时费 1000、机构 20% → 平台 200、机构 200、教师 800
 */
export function calculateCourseOrgFee(input: {
  schoolPrice: number | null | undefined;
  sessionFee: number | null | undefined;
  mode?: string | null;
  value?: number | null;
}): FeeQuote {
  const schoolPrice = roundMoney(Math.max(0, Number(input.schoolPrice) || 0));
  const sessionFee = input.sessionFee == null || Number.isNaN(Number(input.sessionFee))
    ? 0
    : roundMoney(Math.max(0, Number(input.sessionFee)));
  if (!sessionFee) {
    return {
      configured: false,
      baseFee: null,
      commission: null,
      teacherFee: null,
      mode: null,
      value: null,
      visibility: 'final',
      schoolPrice,
      platformAmount: null,
      splitMode: 'course_org',
    };
  }
  const mode = input.mode === 'fixed' ? 'fixed' : 'percent';
  const raw = Number(input.value || 0);
  let commission = mode === 'percent' ? roundMoney(sessionFee * raw / 100) : roundMoney(raw);
  if (commission < 0) commission = 0;
  if (commission > sessionFee) commission = sessionFee;
  const teacherFee = roundMoney(sessionFee - commission);
  return {
    configured: true,
    baseFee: sessionFee,
    commission,
    teacherFee,
    mode,
    value: raw,
    visibility: 'final',
    schoolPrice,
    platformAmount: roundMoney(schoolPrice - sessionFee),
    splitMode: 'course_org',
  };
}

/**
 * 旧版：课时费归教师；机构分佣按固定金额/节或按课时费比例另计，不从教师课时费扣减。
 * 平台利润在财务模块用：校方价格 − 课时费 − 分佣。
 */
export function calculateFee(input: {
  base: number | null;
  hasOrg: boolean;
  mode?: string | null;
  value?: number | null;
  visibility?: string | null;
  schoolPrice?: number | null;
}): FeeQuote {
  // 教师只能看自己的最终课时费；历史 full 一律按 final 处理，机构抽成永不下发教师
  const visibility: FeeVisibility = input.visibility === 'hidden' ? 'hidden' : 'final';
  if (input.base == null || Number.isNaN(Number(input.base))) {
    return {
      configured: false,
      baseFee: null,
      commission: null,
      teacherFee: null,
      mode: null,
      value: null,
      visibility,
      schoolPrice: input.schoolPrice ?? null,
      splitMode: 'none',
    };
  }
  const baseFee = roundMoney(Number(input.base));
  if (!input.hasOrg) {
    return {
      configured: true,
      baseFee,
      commission: 0,
      teacherFee: baseFee,
      mode: null,
      value: null,
      visibility: 'final',
      schoolPrice: input.schoolPrice ?? null,
      splitMode: 'none',
    };
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
    schoolPrice: input.schoolPrice ?? null,
    splitMode: 'teacher_org',
  };
}

export function teacherFeeView(quote: FeeQuote) {
  if (!quote.configured || quote.visibility === 'hidden') {
    return { configured: quote.configured, showFee: false };
  }
  // 允许查看时只给最终课时费，不下发课时费基数与机构抽成
  return { configured: true, showFee: true, teacherFee: quote.teacherFee };
}
