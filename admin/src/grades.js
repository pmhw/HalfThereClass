/** 年级选项与范围展开（课程 gradeLabel 存「一年级」或「一年级、二年级」） */

export const GRADE_GROUPS = [
  {
    key: 'kindergarten',
    label: '幼儿园',
    items: ['小班', '中班', '大班'],
  },
  {
    key: 'primary',
    label: '小学',
    items: ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
  },
  {
    key: 'junior',
    label: '初中',
    items: ['初一', '初二', '初三'],
  },
  {
    key: 'senior',
    label: '高中',
    items: ['高一', '高二', '高三'],
  },
  {
    key: 'college',
    label: '大学',
    items: ['大一', '大二', '大三', '大四'],
  },
  {
    key: 'other',
    label: '其他',
    items: ['全部年级', '其他'],
  },
];

/** 扁平有序列表（用于范围选择） */
export const GRADE_ORDER = GRADE_GROUPS.flatMap((g) => g.items.filter((x) => x !== '全部年级' && x !== '其他'));

export function parseGrades(label) {
  if (!label || !String(label).trim()) return [];
  return String(label)
    .split(/[,，、/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinGrades(grades) {
  const list = [...new Set((grades || []).map((s) => String(s).trim()).filter(Boolean))];
  if (!list.length) return '';
  if (list.includes('全部年级')) return '全部年级';
  return list.join('、');
}

/** 起止年级（含）展开为有序列表 */
export function expandGradeRange(start, end) {
  const a = GRADE_ORDER.indexOf(start);
  const b = GRADE_ORDER.indexOf(end);
  if (a < 0 || b < 0) return start === end && start ? [start] : [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return GRADE_ORDER.slice(lo, hi + 1);
}

export function displayGrade(label) {
  const list = parseGrades(label);
  if (!list.length) return '—';
  if (list.length <= 2) return list.join('、');
  return `${list[0]}～${list[list.length - 1]}（${list.length}）`;
}
