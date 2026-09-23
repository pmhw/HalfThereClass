import { createRouter, createWebHistory } from 'vue-router';
import { isLoggedIn } from './store';
import { bindRouter, check as freezeCheck } from './utils/freeze';

const routes = [
  {
    path: '/',
    component: () => import('./layouts/TabLayout.vue'),
    children: [
      { path: '', name: 'index', component: () => import('./views/Index.vue'), meta: { tab: 0 } },
      { path: 'schedule', name: 'schedule', component: () => import('./views/Schedule.vue'), meta: { tab: 1 } },
      { path: 'teaching', name: 'teaching', component: () => import('./views/Teaching.vue'), meta: { tab: 2 } },
      { path: 'my', name: 'my', component: () => import('./views/My.vue'), meta: { tab: 3 } },
    ],
  },
  { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { public: true } },
  { path: '/frozen', name: 'frozen', component: () => import('./views/Frozen.vue') },
  { path: '/courses', name: 'courses', component: () => import('./views/CourseList.vue') },
  { path: '/course/:id', name: 'course-detail', component: () => import('./views/CourseDetail.vue') },
  { path: '/search', name: 'search', component: () => import('./views/Search.vue') },
  { path: '/certify', name: 'certify', component: () => import('./views/Certify.vue') },
  { path: '/id-shot', name: 'id-shot', component: () => import('./views/IdShot.vue') },
  { path: '/contract', name: 'contract', component: () => import('./views/Contract.vue') },
  { path: '/checkin', name: 'checkin', component: () => import('./views/Checkin.vue') },
  { path: '/adjust', name: 'adjust', component: () => import('./views/Adjust.vue') },
  { path: '/income', name: 'income', component: () => import('./views/Income.vue') },
  { path: '/profile', name: 'profile', component: () => import('./views/Profile.vue') },
  { path: '/order', name: 'order', component: () => import('./views/Order.vue') },
  { path: '/comment', name: 'comment', component: () => import('./views/Comment.vue') },
  { path: '/study/:id', name: 'study', component: () => import('./views/Study.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  if (to.path === '/login' || to.path === '/frozen') return true;
  if (isLoggedIn()) {
    const locked = await freezeCheck();
    if (locked) return to.path === '/frozen' ? true : '/frozen';
  }
  return true;
});

bindRouter(router);

export default router;
