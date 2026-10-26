import { SetMetadata } from '@nestjs/common';

/** 权限细分到子菜单；key 与后台菜单一一对应 */
export const ADMIN_PERMISSION_GROUPS = [
  { key: 'home', label: '首页', items: [{ key: 'home.overview', label: '数据概览' }] },
  {
    key: 'course',
    label: '课程管理',
    items: [
      { key: 'course.list', label: '课程列表' },
      { key: 'course.assign', label: '预先排课' },
      { key: 'course.term', label: '学期排课' },
      { key: 'course.category', label: '分类管理' },
      { key: 'course.school', label: '学校管理' },
    ],
  },
  {
    key: 'trade',
    label: '订单管理',
    items: [
      { key: 'trade.order', label: '订单列表' },
      { key: 'trade.comment', label: '评价管理' },
    ],
  },
  {
    key: 'people',
    label: '用户管理',
    items: [
      { key: 'people.user', label: '用户列表' },
      { key: 'people.teacher', label: '教师管理' },
      { key: 'people.cert', label: '教师认证' },
    ],
  },
  { key: 'org', label: '机构管理', items: [{ key: 'org.list', label: '机构列表' }] },
  {
    key: 'finance',
    label: '财务管理',
    items: [
      { key: 'finance.statement', label: '月度结算单' },
      { key: 'finance.overview', label: '收益概览' },
      { key: 'finance.teacher', label: '教师收益' },
      { key: 'finance.org', label: '机构利润' },
      { key: 'finance.split', label: '分成比例' },
      { key: 'finance.sheet', label: '分成打款单（只读）' },
      { key: 'finance.payout', label: '财务打款' },
      { key: 'finance.bank', label: '交易流水' },
      { key: 'finance.rule', label: '课程分成规则' },
      { key: 'finance.reimburse', label: '报销单' },
    ],
  },
  {
    key: 'admin',
    label: '权限管理',
    items: [
      { key: 'admin.account', label: '管理员' },
      { key: 'admin.settings', label: '系统设置' },
    ],
  },
] as const;

export const ADMIN_PERMISSIONS = ADMIN_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.key })));

export type AdminPermission = (typeof ADMIN_PERMISSION_GROUPS)[number]['items'][number]['key'];

const VALID = new Set<string>(ADMIN_PERMISSIONS.map((item) => item.key));

/** 旧版按模块授权的 key，读取时展开为对应子菜单，保证升级后原有权限不变 */
const LEGACY: Record<string, AdminPermission[]> = {
  overview: ['home.overview'],
  course: ['course.list', 'course.category', 'course.school'],
  schedule: ['course.term'],
  fee: ['course.assign'],
  order: ['trade.order'],
  comment: ['trade.comment'],
  people: ['people.user', 'people.teacher', 'people.cert'],
  org: ['org.list'],
  finance: [
    'finance.statement', 'finance.overview', 'finance.teacher', 'finance.org', 'finance.split',
    'finance.sheet', 'finance.payout', 'finance.bank', 'finance.rule', 'finance.reimburse',
  ],
  admin: ['admin.account', 'admin.settings'],
};

export function normalizePermissions(list: unknown): AdminPermission[] {
  const out = new Set<AdminPermission>();
  for (const raw of Array.isArray(list) ? list : []) {
    const key = String(raw || '');
    if (VALID.has(key)) out.add(key as AdminPermission);
    else for (const item of LEGACY[key] || []) out.add(item);
  }
  return ADMIN_PERMISSIONS.map((item) => item.key).filter((key) => out.has(key));
}

export function parsePermissions(value: string | null | undefined): AdminPermission[] {
  try {
    return normalizePermissions(JSON.parse(value || '[]'));
  } catch {
    return [];
  }
}

export function hasPermission(admin: any, ...keys: AdminPermission[]) {
  if (!admin || admin.status !== 1) return false;
  if (admin.role === 'school') return false;
  if (admin.isSuper) return true;
  const own = new Set(parsePermissions(admin.permissions));
  return keys.some((key) => own.has(key));
}

/**
 * 接口访问规则（写在 Controller 方法上，由 AdminPermissionGuard 校验）：
 * - perms：拥有其中任一权限即可；'any' 表示任意已登录的普通管理员
 * - school：校企业账号也可访问（数据范围由服务层按 ownerId 限制）
 * - superOnly：仅超级管理员
 * 未标注规则的接口一律只允许超级管理员，避免新接口漏配权限。
 */
export type AdminAccessRule = {
  perms?: AdminPermission[] | 'any';
  school?: boolean;
  superOnly?: boolean;
};

export const ADMIN_ACCESS_KEY = 'admin_access_rule';

/** 只开放给财务权限的接口，调用前需输入财务密码 */
export function isFinanceRule(rule?: AdminAccessRule) {
  return Array.isArray(rule?.perms) && rule.perms.length > 0 && rule.perms.every((key) => key.startsWith('finance.'));
}

export const AdminAccess = (rule: AdminAccessRule) => SetMetadata(ADMIN_ACCESS_KEY, rule);

export const Perm = (...perms: AdminPermission[]) => AdminAccess({ perms });

/** 校企业账号也可访问（仅限自己名下数据） */
export const SchoolPerm = (...perms: AdminPermission[]) => AdminAccess({ perms, school: true });

/** 校企业账号固定可见的菜单（实际数据范围仅限名下课程） */
export const SCHOOL_PERMISSIONS: AdminPermission[] = ['course.list', 'course.term', 'course.category'];
