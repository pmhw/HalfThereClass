import { createRouter, createWebHistory } from 'vue-router';
import { clearToken, getProfile, getToken } from './api';
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
import Settings from './views/Settings.vue';
import { allow, landingPath } from './access';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: Login, meta: { public: true } },
    {
      path: '/',
      component: AdminLayout,
      children: [
        { path: '', component: Dashboard, meta: { title: '数据概览', crumb: '工作台 / 数据概览', perm: 'overview' } },
        { path: 'courses', component: Courses, meta: { title: '课程管理', crumb: '课程 / 课程管理', perm: 'course' } },
        { path: 'categories', component: Categories, meta: { title: '分类管理', crumb: '课程 / 分类管理', perm: 'course' } },
        { path: 'schools', component: Schools, meta: { title: '学校管理', crumb: '课程 / 学校管理', perm: 'course' } },
        { path: 'term', component: Term, meta: { title: '学期排课', crumb: '课程 / 学期排课', perm: 'schedule' } },
        { path: 'orders', component: Orders, meta: { title: '订单管理', crumb: '交易 / 订单管理', perm: 'order' } },
        { path: 'comments', component: Comments, meta: { title: '评价管理', crumb: '交易 / 评价管理', perm: 'comment' } },
        { path: 'people', component: People, meta: { title: '用户管理', crumb: '用户 / 用户列表', perm: 'people' } },
        { path: 'faculty', component: Faculty, meta: { title: '教师管理', crumb: '用户 / 教师管理', perm: 'people' } },
        { path: 'faculty/:id', component: TeacherDetail, meta: { title: '教师详情', crumb: '用户 / 教师详情', perm: 'people' } },
        { path: 'certs', component: Certs, meta: { title: '教师认证', crumb: '用户 / 教师认证', perm: 'people' } },
        { path: 'orgs', component: Orgs, meta: { title: '机构管理', crumb: '机构 / 机构列表', perm: 'org' } },
        { path: 'assign', component: Assign, meta: { title: '教师分配', crumb: '课程 / 教师分配', perm: 'fee' } },
        { path: 'incomes', component: Incomes, meta: { title: '收入记录', crumb: '数据 / 教师收入', perm: 'fee' } },
        { path: 'admins', component: Admins, meta: { title: '管理员', crumb: '权限 / 管理员', perm: 'admin' } },
        { path: 'settings', component: Settings, meta: { title: '系统设置', crumb: '系统 / 设置', perm: 'admin' } },
      ],
    },
  ],
});

router.beforeEach((to) => {
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
  const perm = to.meta.perm;
  if (perm && !allow(profile, perm)) {
    const next = landingPath(profile);
    return !next || next === to.path ? true : next;
  }
  return true;
});

export default router;
