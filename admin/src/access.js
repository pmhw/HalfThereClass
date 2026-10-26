/** 权限细分到子菜单，key 与后端 admin.permissions.ts 保持一致 */
export const PERMISSION_GROUPS = [
  {
    key: 'home',
    label: '首页',
    items: [{ key: 'home.overview', label: '数据概览', desc: '工作台数据和待办' }],
  },
  {
    key: 'course',
    label: '课程管理',
    items: [
      { key: 'course.list', label: '课程列表', desc: '新增、编辑、上下架课程及课次' },
      { key: 'course.assign', label: '预先排课', desc: '课程预分配老师与课时费授权、教师收入记录' },
      { key: 'course.term', label: '学期排课', desc: '学期、节假日和课表' },
      { key: 'course.category', label: '分类管理', desc: '分类增删改，批量调整课程分类' },
      { key: 'course.school', label: '学校管理', desc: '学校与地图定位' },
    ],
  },
  {
    key: 'trade',
    label: '订单管理',
    items: [
      { key: 'trade.order', label: '订单列表', desc: '查看订单、标记支付和退款' },
      { key: 'trade.comment', label: '评价管理', desc: '评价列表' },
    ],
  },
  {
    key: 'people',
    label: '用户管理',
    items: [
      { key: 'people.user', label: '用户列表', desc: '用户、上下级与冻结' },
      { key: 'people.teacher', label: '教师管理', desc: '教师详情、合同撤销、重置银行卡' },
      { key: 'people.cert', label: '教师认证', desc: '认证审核、合同审核、身份证人工确认' },
    ],
  },
  {
    key: 'org',
    label: '机构管理',
    items: [{ key: 'org.list', label: '机构列表', desc: '机构、抽成、绑定老师和课程' }],
  },
  {
    key: 'finance',
    label: '财务管理',
    items: [
      { key: 'finance.statement', label: '月度结算单', desc: '查看、固定和解锁结算单' },
      { key: 'finance.overview', label: '收益概览', desc: '收益汇总、同步课次、结算月份' },
      { key: 'finance.teacher', label: '教师收益', desc: '教师课时费明细' },
      { key: 'finance.org', label: '机构利润', desc: '机构利润与抽成明细' },
      { key: 'finance.split', label: '分成比例', desc: '股东分成、分成规则与合集、月度结算单' },
      { key: 'finance.sheet', label: '分成打款单（只读）', desc: '股东查看每月月度结算单，不能修改' },
      { key: 'finance.payout', label: '财务打款', desc: '按人合并打款并标记已打款' },
      { key: 'finance.bank', label: '交易流水', desc: '导入银行交易查询，按金额归属并锁定' },
      { key: 'finance.rule', label: '课程分成规则', desc: '课程校方价格与课时费（在分成比例页右上角打开）' },
      { key: 'finance.reimburse', label: '报销单', desc: '报销审核、扣除方式与打款' },
    ],
  },
  {
    key: 'admin',
    label: '权限管理',
    items: [
      { key: 'admin.account', label: '管理员', desc: '管理员账号（只能分配自己拥有的权限）' },
      { key: 'admin.settings', label: '系统设置', desc: '短信、微信、地图、协议与合同' },
    ],
  },
];

export const PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.items.map(({ key, label }) => ({ key, label, group: group.key })));

const VALID = new Set(PERMISSIONS.map((item) => item.key));

/** 旧版按模块授权的 key，展开为对应子菜单 */
const LEGACY = {
  overview: ['home.overview'],
  course: ['course.list', 'course.category', 'course.school'],
  schedule: ['course.term'],
  fee: ['course.assign'],
  order: ['trade.order'],
  comment: ['trade.comment'],
  people: ['people.user', 'people.teacher', 'people.cert'],
  org: ['org.list'],
  finance: PERMISSIONS.filter((item) => item.group === 'finance').map((item) => item.key),
  admin: ['admin.account', 'admin.settings'],
};

export function normalizePermissions(list) {
  const out = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const key = String(raw || '');
    if (VALID.has(key)) out.add(key);
    else for (const item of LEGACY[key] || []) out.add(item);
  }
  return PERMISSIONS.map((item) => item.key).filter((key) => out.has(key));
}

/** 拥有任一权限即返回 true */
export function allow(profile, ...perms) {
  if (!profile) return false;
  if (profile.isSuper) return true;
  const own = new Set(normalizePermissions(profile.permissions));
  return perms.flat().some((key) => own.has(key));
}

export const FINANCE_PERMS = [
  'finance.statement', 'finance.overview', 'finance.teacher', 'finance.org', 'finance.split',
  'finance.sheet', 'finance.payout', 'finance.bank', 'finance.rule', 'finance.reimburse',
];

/** 系统设置页：有财务权限的管理员也要进来设置自己的财务密码 */
export const SETTINGS_PERMS = ['admin.settings', ...FINANCE_PERMS];

/** 配置检查页：只要能看到任一检查分组即可进入 */
export const SETUP_PERMS = [
  'admin.settings', 'course.list', 'course.assign', 'course.term', 'course.school', 'finance.rule',
  'org.list', 'finance.overview', 'finance.statement', 'finance.teacher', 'finance.split', 'finance.payout',
];

const SCHOOL_PATHS = ['/courses', '/categories', '/term'];

/** 当前账号能否打开该路由（路由守卫与标签恢复共用） */
export function canOpen(profile, route) {
  if (!profile) return false;
  if (profile.role === 'school') return SCHOOL_PATHS.some((path) => route.path === path || route.path.startsWith(`${path}/`));
  const perm = route.meta?.perm;
  return !perm || allow(profile, perm);
}

const LANDING = [
  ['home.overview', '/'],
  ['course.list', '/courses'],
  ['course.assign', '/assign'],
  ['course.term', '/term'],
  ['course.category', '/categories'],
  ['course.school', '/schools'],
  ['trade.order', '/orders'],
  ['trade.comment', '/comments'],
  ['people.user', '/people'],
  ['people.teacher', '/faculty'],
  ['people.cert', '/certs'],
  ['org.list', '/orgs'],
  ['finance.statement', '/finance/statement'],
  ['finance.overview', '/finance'],
  ['finance.teacher', '/finance'],
  ['finance.org', '/finance'],
  ['finance.split', '/finance/split'],
  ['finance.sheet', '/finance/sheet'],
  ['finance.payout', '/finance/payouts'],
  ['finance.bank', '/finance/bank'],
  ['finance.rule', '/finance/rules'],
  ['finance.reimburse', '/reimbursements'],
  ['admin.account', '/admins'],
  ['admin.settings', '/settings'],
];

export function landingPath(profile) {
  if (!profile) return '/login';
  if (profile.role === 'school') return '/courses';
  if (profile.isSuper) return '/';
  return LANDING.find(([key]) => allow(profile, key))?.[1] || null;
}
