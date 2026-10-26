import { createRouter, createWebHistory } from 'vue-router';
import { clearToken, getProfile, getToken } from './api';
import { adminBase } from './adminBase';
import Login from './views/Login.vue';
import AdminLayout from './layouts/AdminLayout.vue';
import Dashboard from './views/Dashboard.vue';
import Courses from './views/Courses.vue';
import Categories from './views/Categories.vue';
import Schools from './views/Schools.vue';
import Orders from './views/Orders.vue';
import Comments from './views/Comments.vue';
import Term from './views/Term.vue';
import Admins from './views/Admins.vue';
import People from './views/People.vue';
import Faculty from './views/Faculty.vue';
import TeacherDetail from './views/TeacherDetail.vue';
import Certs from './views/Certs.vue';
import Orgs from './views/Orgs.vue';
import Assign from './views/Assign.vue';
import Incomes from './views/Incomes.vue';
import FinanceHub from './views/FinanceHub.vue';
import FinanceMonthly from './views/FinanceMonthly.vue';
import FinanceOrgs from './views/FinanceOrgs.vue';
import FinanceStatement from './views/FinanceStatement.vue';
import FinanceRules from './views/FinanceRules.vue';
import FinanceSplit from './views/FinanceSplit.vue';
import FinancePayouts from './views/FinancePayouts.vue';
import FinanceBank from './views/FinanceBank.vue';
import FinanceSheet from './views/FinanceSheet.vue';
import Reimbursements from './views/Reimbursements.vue';
import Settings from './views/Settings.vue';
import Setup from './views/Setup.vue';
import DocEdit from './views/DocEdit.vue';
import { SETTINGS_PERMS, SETUP_PERMS, allow, canOpen, landingPath } from './access';
import { financeUnlocked, isFinancePath, requireFinancePin } from './financePin';

const router = createRouter({
  history: createWebHistory(adminBase()),
  routes: [
    { path: '/login', component: Login, meta: { public: true } },
    {
      path: '/',
      component: AdminLayout,
      children: [
        { path: '', component: Dashboard, meta: { title: '数据概览', crumb: '工作台 / 数据概览', perm: 'home.overview' } },
        { path: 'courses', component: Courses, meta: { title: '课程管理', crumb: '课程 / 课程管理', perm: 'course.list' } },
        { path: 'categories', component: Categories, meta: { title: '分类管理', crumb: '课程 / 分类管理', perm: 'course.category' } },
        { path: 'schools', component: Schools, meta: { title: '学校管理', crumb: '课程 / 学校管理', perm: 'course.school' } },
        { path: 'term', component: Term, meta: { title: '学期排课', crumb: '课程 / 学期排课', perm: 'course.term' } },
        { path: 'orders', component: Orders, meta: { title: '订单管理', crumb: '交易 / 订单管理', perm: 'trade.order' } },
        { path: 'comments', component: Comments, meta: { title: '评价管理', crumb: '交易 / 评价管理', perm: 'trade.comment' } },
        { path: 'people', component: People, meta: { title: '用户管理', crumb: '用户 / 用户列表', perm: 'people.user' } },
        { path: 'faculty', component: Faculty, meta: { title: '教师管理', crumb: '用户 / 教师管理', perm: 'people.teacher' } },
        { path: 'faculty/:id', component: TeacherDetail, meta: { title: '教师详情', crumb: '用户 / 教师详情', perm: 'people.teacher' } },
        { path: 'certs', component: Certs, meta: { title: '教师认证', crumb: '用户 / 教师认证', perm: 'people.cert' } },
        { path: 'orgs', component: Orgs, meta: { title: '机构管理', crumb: '机构 / 机构列表', perm: 'org.list' } },
        { path: 'assign', component: Assign, meta: { title: '预先排课', crumb: '课程 / 预先排课', perm: 'course.assign' } },
        { path: 'incomes', component: Incomes, meta: { title: '收入记录', crumb: '数据 / 教师收入', perm: ['course.assign', 'finance.teacher'] } },
        { path: 'finance', component: FinanceHub, meta: { title: '收益概览', crumb: '财务 / 收益概览', perm: ['finance.overview', 'finance.teacher', 'finance.org'], month: true, monthTabs: { org: 'all' } } },
        { path: 'finance/monthly', component: FinanceMonthly, meta: { title: '月度收益', crumb: '财务 / 月度收益', perm: 'finance.overview' } },
        { path: 'finance/teachers', redirect: (to) => ({ path: '/finance', query: { ...to.query, tab: 'teachers' } }) },
        { path: 'finance/orgs', component: FinanceOrgs, meta: { title: '机构收益', crumb: '财务 / 机构收益', perm: 'finance.org', month: true } },
        { path: 'finance/statement', component: FinanceStatement, meta: { title: '月度结算单', crumb: '财务 / 月度结算单', perm: 'finance.statement', month: true } },
        { path: 'finance/org-profit', redirect: (to) => ({ path: '/finance', query: { ...to.query, tab: 'org' } }) },
        { path: 'finance/split', component: FinanceSplit, meta: { title: '分成比例', crumb: '财务 / 分成比例', perm: 'finance.split', month: true } },
        { path: 'finance/sheet', component: FinanceSheet, beforeEnter: (to) => (allow(getProfile(), 'finance.split') ? { path: '/finance/split', query: { ...to.query, tab: 'sheet' } } : true), meta: { title: '分成打款单', crumb: '财务 / 分成打款单', perm: ['finance.sheet', 'finance.split', 'finance.payout'], month: true } },
        { path: 'finance/payouts', component: FinancePayouts, meta: { title: '财务打款', crumb: '财务 / 财务打款', perm: 'finance.payout', month: true } },
        { path: 'finance/bank', component: FinanceBank, meta: { title: '交易流水', crumb: '财务 / 交易流水', perm: 'finance.bank' } },
        { path: 'finance/rules', component: FinanceRules, beforeEnter: (to) => (allow(getProfile(), 'finance.split') ? { path: '/finance/split', query: { ...to.query, dialog: 'course-rules' } } : true), meta: { title: '课程分成规则', crumb: '财务 / 课程分成规则', perm: 'finance.rule' } },
        { path: 'reimbursements', component: Reimbursements, meta: { title: '报销单', crumb: '财务 / 报销单', perm: 'finance.reimburse', month: 'all', monthDefault: 'all' } },
        { path: 'admins', component: Admins, meta: { title: '管理员', crumb: '权限 / 管理员', perm: 'admin.account' } },
        { path: 'setup', component: Setup, meta: { title: '配置检查', crumb: '系统 / 配置检查', perm: SETUP_PERMS } },
        { path: 'settings', component: Settings, meta: { title: '系统设置', crumb: '系统 / 设置', perm: SETTINGS_PERMS } },
        { path: 'settings/agreement', component: DocEdit, meta: { title: '用户协议', crumb: '系统 / 设置 / 用户协议', perm: 'admin.settings', kind: 'agreement' } },
        { path: 'settings/contract', component: DocEdit, meta: { title: '教师服务合同', crumb: '系统 / 设置 / 教师服务合同', perm: 'admin.settings', kind: 'contract' } },
      ],
    },
  ],
});

/** 进入财务页面前先输入财务密码；取消时留在原页，首次打开则退到非财务页 */
async function financeGuard(to, from, profile) {
  if (!isFinancePath(to.path) || financeUnlocked()) return true;
  if (await requireFinancePin()) return true;
  if (from.matched.length) return false;
  const next = landingPath(profile);
  return next && !isFinancePath(next) ? next : '/settings';
}

router.beforeEach((to, from) => {
  const token = getToken();
  const profile = getProfile();
  if (token && !profile) {
    clearToken();
    return to.path === '/login' ? true : '/login';
  }
  if (!token && to.path !== '/login') return '/login';
  if (to.path === '/login') {
    if (!token || !profile) return true;
    const next = landingPath(profile);
    return !next || next === to.path ? true : next;
  }
  if (profile?.role === 'school') return canOpen(profile, to) ? true : '/courses';
  if (!canOpen(profile, to)) {
    const next = landingPath(profile);
    if (next && next !== to.path) return next;
    if (next) return financeGuard(to, from, profile);
    return true;
  }
  return financeGuard(to, from, profile);
});

export default router;
