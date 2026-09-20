export const PERMISSION_GROUPS = [
  {
    key: 'home',
    label: '首页',
    items: [{ key: 'overview', label: '首页概览', desc: '工作台数据概览', icon: 'overview' }],
  },
  {
    key: 'course',
    label: '课程管理',
    items: [
      { key: 'course', label: '课程和分类', desc: '课程列表、分类和学校', icon: 'book' },
      { key: 'schedule', label: '学期排课', desc: '学期、节假日和课表', icon: 'cal' },
    ],
  },
  {
    key: 'trade',
    label: '订单管理',
    items: [
      { key: 'order', label: '订单', desc: '订单列表', icon: 'receipt' },
      { key: 'comment', label: '评价', desc: '评价管理', icon: 'message' },
    ],
  },
  {
    key: 'people',
    label: '用户管理',
    items: [{ key: 'people', label: '用户与教师', desc: '用户列表、教师管理和认证', icon: 'users' }],
  },
  {
    key: 'org',
    label: '机构管理',
    items: [{ key: 'org', label: '机构与分佣', desc: '机构列表', icon: 'folder' }],
  },
  {
    key: 'fee',
    label: '费用结算',
    items: [{ key: 'fee', label: '课程费用与收入', desc: '教师分配和收入记录', icon: 'receipt' }],
  },
  {
    key: 'admin',
    label: '权限管理',
    items: [{ key: 'admin', label: '管理员与权限', desc: '管理员账号、系统设置和用户协议', icon: 'users' }],
  },
];

export const PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.items.map(({ key, label }) => ({ key, label })));

export function allow(profile, perm) {
  if (!profile) return false;
  if (profile.isSuper) return true;
  return (profile.permissions || []).includes(perm);
}

const LANDING = [
  ['overview', '/'],
  ['course', '/courses'],
  ['schedule', '/term'],
  ['order', '/orders'],
  ['comment', '/comments'],
  ['people', '/people'],
  ['org', '/orgs'],
  ['fee', '/assign'],
  ['admin', '/admins'],
];

export function landingPath(profile) {
  if (!profile) return '/login';
  if (profile.role === 'school') return '/courses';
  if (profile.isSuper) return '/';
  return LANDING.find(([key]) => allow(profile, key))?.[1] || null;
}
