export const ADMIN_PERMISSIONS = [
  { key: 'overview', label: '首页概览' },
  { key: 'course', label: '课程和分类' },
  { key: 'schedule', label: '学期排课' },
  { key: 'order', label: '订单' },
  { key: 'comment', label: '评价' },
  { key: 'people', label: '用户与教师' },
  { key: 'org', label: '机构与分佣' },
  { key: 'fee', label: '课程费用与收入' },
  { key: 'admin', label: '管理员与权限' },
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]['key'];

const RULES: { test: RegExp; permission: AdminPermission }[] = [
  { test: /\/(people|faculty|certs)(?:\/|$)/, permission: 'people' },
  { test: /\/orgs(?:\/|$)/, permission: 'org' },
  { test: /\/(fees|incomes)(?:\/|$)/, permission: 'fee' },
  { test: /\/admins(?:\/|$)/, permission: 'admin' },
  { test: /\/settings(?:\/|$)/, permission: 'admin' },
  // 具体路径必须写在宽泛 /system 规则之前，否则 overview 会覆盖 database / apply-update
  { test: /\/system\/(database|apply-update)(?:\/|$)/, permission: 'admin' },
  { test: /\/system(?:\/|$)/, permission: 'overview' },
  { test: /\/(courses|categories|teachers|schools)(?:\/|$)/, permission: 'course' },
  { test: /\/(semesters|holidays|sessions)(?:\/|$)/, permission: 'schedule' },
  { test: /\/orders(?:\/|$)/, permission: 'order' },
  { test: /\/comments(?:\/|$)/, permission: 'comment' },
  { test: /\/(dashboard|search|me|permissions)(?:\/|$)/, permission: 'overview' },
];

export function permissionFor(url = '') {
  const path = url.split('?')[0];
  return RULES.find((rule) => rule.test.test(path))?.permission || null;
}

export function parsePermissions(value: string) {
  try {
    const list = JSON.parse(value || '[]');
    const allowed = new Set(ADMIN_PERMISSIONS.map((item) => item.key));
    return Array.isArray(list) ? list.filter((item) => allowed.has(item)) : [];
  } catch {
    return [];
  }
}
