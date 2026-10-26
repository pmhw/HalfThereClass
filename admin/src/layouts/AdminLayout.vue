<template>
  <div class="shell" :class="{ collapsed }">
    <aside class="sidebar">
      <div
        ref="brandEl"
        class="brand"
        :class="{ 'has-update': updates.hasUpdate, open: versionOpen }"
        role="button"
        tabindex="0"
        title="点击查看系统版本"
        @click="toggleVersion"
        @keydown.enter.prevent="toggleVersion"
      >
        <div class="brand-text">
          <strong>
            对校课程平台
            <i v-if="updates.hasUpdate" class="update-dot"></i>
          </strong>
          <span>{{ updates.hasUpdate ? `有新版本 ${updates.latest?.tag || ''}` : '管理后台' }}</span>
        </div>
      </div>
      <Teleport to="body">
        <div
          v-if="versionOpen"
          ref="popEl"
          class="version-pop"
          :style="versionStyle"
        >
          <div class="version-head">
            <strong>系统版本</strong>
            <em v-if="updates.hasUpdate && !applying" class="new">有更新</em>
            <em v-else-if="applying" class="doing">更新中</em>
          </div>
          <p class="version-current">当前版本 <b>v{{ updates.current || version.current || '—' }}</b></p>
          <p v-if="updates.latest" class="version-latest">
            {{ updates.hasUpdate ? '可更新到' : '最新发布' }} <b>{{ updates.latest.tag }}</b>
            <small v-if="updates.latest.publishedAt"> · {{ formatTime(updates.latest.publishedAt) }}</small>
          </p>
          <p v-else class="version-latest muted">{{ versionLoading ? '正在检测更新…' : '暂未检测到可更新版本' }}</p>

          <div v-if="applying" class="update-progress">
            <div class="update-progress-meta">
              <span>{{ applyMessage || '正在更新…' }}</span>
              <b>{{ applyPercent }}%</b>
            </div>
            <div class="update-progress-track">
              <i :style="{ width: `${applyPercent}%` }"></i>
            </div>
          </div>

          <template v-else>
            <div v-if="updates.updates?.length" class="version-list">
              <div v-for="item in updates.updates" :key="item.tag" class="version-item">
                <div>
                  <strong>{{ item.tag }}</strong>
                  <small>{{ item.assetName || '发布包' }}</small>
                </div>
                <button class="link" type="button" @click="applyUpdate(item.tag)">更新</button>
              </div>
            </div>
            <div class="version-actions">
              <button type="button" class="link" :disabled="versionLoading" @click="refreshUpdates({ force: true })">
                {{ versionLoading ? '检测中…' : '立即检测' }}
              </button>
              <button
                v-if="updates.hasUpdate"
                class="btn tiny primary"
                type="button"
                @click="applyUpdate()"
              >一键更新</button>
            </div>
          </template>
          <p v-if="versionError" class="version-error">
            {{ versionError }}
            <button v-if="restartStuck" class="btn tiny primary" type="button" @click="reloadPage">刷新页面</button>
          </p>
        </div>
      </Teleport>
      <div class="sidebar-nav">
        <div v-for="group in menus" :key="group.key" class="nav-group">
          <router-link
            v-if="!group.children"
            :to="group.to"
            class="nav-item"
            :class="{ active: isActive(group.to) }"
            :title="group.label"
          >
            <Icon :name="group.icon" />
            <span class="nav-label">{{ group.label }}</span>
            <em v-if="group.key === 'setup' && setupBadge.count" class="nav-badge" :class="setupBadge.tone">{{ setupBadge.count }}</em>
          </router-link>
          <button
            v-else
            type="button"
            class="nav-item nav-parent"
            :class="{ open: opened[group.key], current: groupActive(group) }"
            :title="group.label"
            @click="toggleGroup(group.key)"
          >
            <Icon :name="group.icon" />
            <span class="nav-label">{{ group.label }}</span>
            <span class="chevron" :class="{ open: opened[group.key] }"><Icon name="chevron" /></span>
          </button>
          <div v-if="group.children && opened[group.key]" class="nav-children">
            <router-link
              v-for="item in group.children"
              :key="item.to"
              :to="item.to"
              class="nav-sub"
              :class="{ active: isActive(item.to) }"
              :title="item.label"
            >
              <Icon :name="item.icon" />
              <span>{{ item.label }}</span>
            </router-link>
          </div>
        </div>
      </div>
      <button type="button" class="collapse-btn" @click="toggleCollapse">
        <Icon name="collapse" />
        <span>{{ collapsed ? '展开' : '收起' }}</span>
      </button>
    </aside>

    <div class="main" :class="{ 'has-tabs': tabs.length }">
      <div class="main-chrome">
        <header class="header">
          <div class="crumb">
            <small>{{ route.meta.crumb }}</small>
            <strong>{{ route.meta.title }}</strong>
          </div>
          <MonthBar />
          <div v-if="canSearch" class="search">
            <span class="search-icon"><Icon name="search" /></span>
            <input v-model="keyword" placeholder="搜索课程、用户、订单号" @input="onSearch" @focus="open = true" />
            <div v-if="open && keyword" class="search-panel" @mousedown.prevent>
              <div v-if="!hasResult" class="search-empty">没有匹配结果</div>
              <router-link v-for="item in result.courses" :key="'c' + item.id" to="/courses" @click="open = false">
                <em>课程</em>{{ item.title }}
              </router-link>
              <router-link v-for="item in result.users" :key="'u' + item.id" :to="`/faculty/${item.id}`" @click="open = false">
                <em>用户</em>{{ item.nickname || '未命名用户' }}
              </router-link>
              <router-link v-for="item in result.orders" :key="'o' + item.id" to="/orders" @click="open = false">
                <em>订单</em>{{ item.orderNo }}
              </router-link>
            </div>
          </div>
          <div class="header-actions">
            <div v-if="canCert" class="notice-wrap">
              <router-link class="icon-btn" to="/certs" title="教师认证">
                <Icon name="message" />
                <i v-if="certCount" class="dot"></i>
              </router-link>
              <div v-if="showCertNotice" class="cert-notice">
                <strong>教师认证待审核</strong>
                <p>有 {{ certCount }} 条认证或证明需要处理{{ certNames ? `：${certNames}` : '' }}</p>
                <div class="cert-notice-actions">
                  <router-link to="/certs" @click="dismissCert">去审核</router-link>
                  <button type="button" @click="dismissCert">知道了</button>
                </div>
              </div>
            </div>
            <router-link v-if="profile?.role !== 'school'" class="icon-btn" to="/orders?status=pending" title="待支付订单">
              <Icon name="bell" />
              <i v-if="pendingCount" class="dot"></i>
            </router-link>
            <button type="button" class="icon-btn" title="刷新当前页" @click="refreshCurrent">
              <Icon name="refresh" />
            </button>
            <button type="button" class="icon-btn" title="帮助" @click="help = !help">
              <Icon name="help" />
            </button>
            <div style="position: relative">
              <button type="button" class="avatar-btn" @click="userMenu = !userMenu">
                <span class="avatar">{{ (profile?.name || '管').slice(0, 1) }}</span>
                <span class="avatar-meta">
                  <strong>{{ profile?.name || '管理员' }}</strong>
                  <small>{{ profile?.role === 'school' ? '学校账号' : (profile?.isSuper ? '超级管理员' : '管理员') }}</small>
                </span>
              </button>
              <div v-if="userMenu" class="menu">
                <button type="button" @click="logout">退出登录</button>
              </div>
            </div>
          </div>
        </header>

        <div class="workspace-tabs" v-if="tabs.length">
          <div class="workspace-tabs-scroll">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              type="button"
              class="workspace-tab"
              :class="{ active: tab.key === activeKey }"
              :title="tab.crumb || tab.title"
              @click="activate(tab)"
              @click.middle.prevent="closeTab(tab, $event)"
              @contextmenu.prevent="closeOthers(tab)"
            >
              <span class="workspace-tab-title">{{ tab.title }}</span>
              <i
                v-if="tabs.length > 1"
                class="workspace-tab-close"
                title="关闭"
                @click="closeTab(tab, $event)"
              >×</i>
            </button>
          </div>
          <button type="button" class="workspace-refresh" title="刷新当前页" @click="refreshCurrent">
            <Icon name="refresh" />
            <span>刷新</span>
          </button>
        </div>
      </div>

      <div class="content">
        <div v-if="showSmsLow" class="sms-low-banner" role="alert">
          <Icon name="info" />
          <div class="sms-low-text">
            <strong>阿里云短信余量不足</strong>
            <span>{{ smsLow.lowMessage }}，验证码登录可能发不出去，请及时充值或购买资源包。</span>
          </div>
          <router-link class="btn tiny primary" to="/settings" @click="dismissSmsLow">去查看</router-link>
          <button type="button" class="link" @click="dismissSmsLow">知道了</button>
        </div>
        <div v-if="showSetupNotice" class="setup-banner" role="alert">
          <Icon name="info" />
          <div class="setup-banner-text">
            <strong>有 {{ setupErrors.length }} 项关键配置缺失</strong>
            <span>{{ setupErrors.slice(0, 3).join('、') }}{{ setupErrors.length > 3 ? ' 等' : '' }}，会导致收益、结算或打款金额不准确。</span>
          </div>
          <router-link class="btn tiny primary" to="/setup">去处理</router-link>
          <button type="button" class="link" @click="dismissSetup">本次不再提示</button>
        </div>
        <router-view v-slot="{ Component, route: viewRoute }">
          <keep-alive :max="24">
            <component
              :is="Component"
              v-if="Component"
              :key="aliveKey(viewRoute)"
            />
          </keep-alive>
        </router-view>
      </div>
    </div>

    <div v-if="accountLock.message" class="update-mask freeze-mask">
      <div class="update-card">
        <strong>{{ accountLock.message.includes('停用') ? '账号已停用' : '账号已冻结' }}</strong>
        <p>{{ accountLock.message }}</p>
        <p>当前界面已锁定，无法继续操作。</p>
        <button class="btn primary" type="button" @click="logout">退出登录</button>
      </div>
    </div>

    <div v-if="help" class="card help-card">
      <strong>当前后台能做什么</strong>
      <p>可以按权限创建管理员。密码连续错误 5 次会冻结 15 分钟。已安排老师的课程不能删除。</p>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import MonthBar from '../components/MonthBar.vue';
import { api, accountLock, clearToken, getProfile, updateProfile } from '../api';
import { SETTINGS_PERMS, SETUP_PERMS, allow, landingPath } from '../access';
import { clearAdminTabsStorage, useAdminTabs } from '../composables/useAdminTabs';
import { markSetupDirty, refreshSetupStatus, setupStatus } from '../composables/useSetupStatus';
import { notify } from '../notify';

const route = useRoute();
const router = useRouter();
const {
  tabs,
  activeKey,
  aliveKey,
  hydrate,
  activate,
  closeTab,
  closeOthers,
  refreshCurrent,
} = useAdminTabs();
const keyword = ref('');
const open = ref(false);
const help = ref(false);
const userMenu = ref(false);
const pendingCount = ref(0);
const certCount = ref(0);
const certNames = ref('');
const certDismissed = ref(Number(sessionStorage.getItem('cert_notice_count') || 0));
const canSearch = computed(() => profile.value?.role !== 'school' && allow(profile.value, 'course.list', 'people.user', 'trade.order'));
const canCert = computed(() => profile.value?.role !== 'school' && allow(profile.value, 'people.cert'));
const showCertNotice = computed(() => certCount.value > 0 && certCount.value !== certDismissed.value);
const smsLow = ref({ low: false, lowMessage: '' });
const smsLowDismissed = ref(sessionStorage.getItem('sms_low_notice') || '');
const canSms = computed(() => profile.value?.role !== 'school' && allow(profile.value, 'admin.settings'));
const showSmsLow = computed(() => canSms.value && smsLow.value.low && smsLow.value.lowMessage !== smsLowDismissed.value);
let smsTimer = null;
const setupDismissed = ref(sessionStorage.getItem('setup_notice') || '');
const setupErrors = computed(() => setupStatus.data?.top || []);
const setupBadge = computed(() => {
  const s = setupStatus.data?.summary;
  if (!s) return { count: 0, tone: '' };
  return { count: (s.error || 0) + (s.warn || 0), tone: s.error ? 'error' : 'warn' };
});
const showSetupNotice = computed(() => profile.value?.role !== 'school'
  && allow(profile.value, SETUP_PERMS)
  && route.path !== '/setup'
  && setupErrors.value.length > 0
  && setupErrors.value.join('|') !== setupDismissed.value);
const versionOpen = ref(false);
const versionLoading = ref(false);
const applying = ref(false);
const applyMessage = ref('');
const applyPercent = ref(0);
const versionError = ref('');
const restartStuck = ref(false);
const versionStyle = ref({ left: '12px', top: '64px' });
const version = ref({ current: '', repo: '' });
const updates = ref({ current: '', hasUpdate: false, updates: [], latest: null, releases: [], repo: '', releasesUrl: '' });
const brandEl = ref(null);
const popEl = ref(null);
let updateTimer = 0;
let pollTimer = 0;
let updateRun = 0;
const collapsed = ref(localStorage.getItem('admin_nav_collapsed') === '1');
const opened = ref({ course: true, trade: false, admin: true, finance: true });
const result = ref({ courses: [], users: [], orders: [] });
const profile = ref(getProfile());
const menuSource = [
  { key: 'home', label: '首页', icon: 'overview', to: '/', perm: 'home.overview' },
  { key: 'setup', label: '配置检查', icon: 'check', to: '/setup', perm: SETUP_PERMS },
  {
    key: 'course',
    label: '课程管理',
    icon: 'book',
    children: [
      { to: '/courses', label: '课程列表', icon: 'list', perm: 'course.list' },
      { to: '/assign', label: '预先排课', icon: 'list', perm: 'course.assign' },
      { to: '/term', label: '学期排课', icon: 'cal', perm: 'course.term' },
      { to: '/categories', label: '分类管理', icon: 'folder', perm: 'course.category' },
      { to: '/schools', label: '学校管理', icon: 'building', perm: 'course.school' },
    ],
  },
  {
    key: 'trade',
    label: '订单管理',
    icon: 'receipt',
    children: [
      { to: '/orders', label: '订单列表', icon: 'receipt', perm: 'trade.order' },
      { to: '/comments', label: '评价管理', icon: 'message', perm: 'trade.comment' },
    ],
  },
  {
    key: 'people',
    label: '用户管理',
    icon: 'users',
    children: [
      { to: '/people', label: '用户列表', icon: 'users', perm: 'people.user' },
      { to: '/faculty', label: '教师管理', icon: 'users', perm: 'people.teacher' },
      { to: '/certs', label: '教师认证', icon: 'message', perm: 'people.cert' },
    ],
  },
  {
    key: 'org',
    label: '机构管理',
    icon: 'folder',
    children: [
      { to: '/orgs', label: '机构列表', icon: 'folder', perm: 'org.list' },
    ],
  },
  {
    key: 'finance',
    label: '财务管理',
    icon: 'chart',
    children: [
      { to: '/finance/statement', label: '月度结算单', icon: 'list', perm: 'finance.statement' },
      { to: '/finance', label: '收益概览', icon: 'chart', perm: ['finance.overview', 'finance.teacher', 'finance.org'] },
      { to: '/finance/split', label: '分成比例', icon: 'users', perm: 'finance.split' },
      { to: '/finance/sheet', label: '分成打款单', icon: 'list', perm: 'finance.sheet', hideIf: 'finance.split' },
      { to: '/finance/payouts', label: '财务打款', icon: 'receipt', perm: 'finance.payout' },
      { to: '/finance/bank', label: '交易流水', icon: 'list', perm: 'finance.bank' },
      { to: '/finance/rules', label: '课程分成规则', icon: 'gear', perm: 'finance.rule', hideIf: 'finance.split' },
      { to: '/reimbursements', label: '报销单', icon: 'receipt', perm: 'finance.reimburse' },
    ],
  },
  {
    key: 'admin',
    label: '权限管理',
    icon: 'users',
    children: [
      { to: '/admins', label: '管理员', icon: 'users', perm: 'admin.account' },
      { to: '/settings', label: '系统设置', icon: 'gear', perm: SETTINGS_PERMS },
    ],
  },
];
const menus = computed(() => {
  if (profile.value?.role === 'school') {
    return [{
      key: 'course',
      label: '课程管理',
      icon: 'book',
      children: [
        { to: '/courses', label: '课程列表', icon: 'list' },
        { to: '/term', label: '学期排课', icon: 'cal' },
        { to: '/categories', label: '分类管理', icon: 'folder' },
      ],
    }];
  }
  return menuSource
  .map((group) => {
    if (!group.children) return !group.perm || allow(profile.value, group.perm) ? group : null;
    const children = group.children.filter((item) => allow(profile.value, item.perm) && !(item.hideIf && allow(profile.value, item.hideIf)));
    return children.length ? { ...group, children } : null;
  })
  .filter(Boolean);
});

const hasResult = computed(() => result.value.courses.length || result.value.users.length || result.value.orders.length);

const menuPaths = computed(() => menus.value.flatMap((group) => (group.children || [group]).map((item) => item.to)).filter(Boolean));
const activePath = computed(() => {
  const current = route.path;
  if (current === '/') return '/';
  let best = '';
  for (const path of menuPaths.value) {
    if (path === '/') continue;
    if ((current === path || current.startsWith(`${path}/`)) && path.length > best.length) best = path;
  }
  return best;
});
function isActive(path) {
  return activePath.value === path;
}
function groupActive(group) {
  return group.children?.some((item) => isActive(item.to));
}
function toggleGroup(key) {
  if (collapsed.value) {
    collapsed.value = false;
    localStorage.setItem('admin_nav_collapsed', '0');
    opened.value[key] = true;
    return;
  }
  opened.value[key] = !opened.value[key];
}
function toggleCollapse() {
  collapsed.value = !collapsed.value;
  localStorage.setItem('admin_nav_collapsed', collapsed.value ? '1' : '0');
}
function syncOpen() {
  menus.value.forEach((group) => {
    if (groupActive(group)) opened.value[group.key] = true;
  });
}

let timer;
function onSearch() {
  open.value = true;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!keyword.value.trim()) {
      result.value = { courses: [], users: [], orders: [] };
      return;
    }
    result.value = await api.search(keyword.value.trim());
  }, 250);
}

function logout() {
  accountLock.message = '';
  clearAdminTabsStorage();
  clearToken();
  router.push('/login');
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** 只刷新数据，不主动弹出浮层（有新版本靠左上角红点和文案提示） */
async function refreshUpdates({ force = false } = {}) {
  if (versionLoading.value) return;
  // 路由切换不强制打 GitHub；仅打开浮层或定时器时检测
  if (!force && !versionOpen.value && updates.value?.current) return;
  versionLoading.value = true;
  versionError.value = '';
  try {
    const [info, list] = await Promise.all([
      api.systemVersion(),
      profile.value?.role === 'school'
        ? Promise.resolve(updates.value)
        : api.systemUpdates({ force: force || versionOpen.value ? '1' : '' }),
    ]);
    version.value = info;
    updates.value = {
      ...list,
      releasesUrl: list.repo ? `${list.repo}/releases` : '',
    };
  } catch (err) {
    updates.value = {
      current: version.value.current || '',
      hasUpdate: false,
      updates: [],
      latest: null,
      releases: [],
      repo: version.value.repo || '',
      releasesUrl: '',
    };
    if (versionOpen.value) versionError.value = err.message || '检测失败';
  } finally {
    versionLoading.value = false;
  }
}

function placeVersionPop() {
  const el = document.querySelector('.brand');
  if (!el) {
    versionStyle.value = { left: '12px', top: '64px' };
    return;
  }
  const rect = el.getBoundingClientRect();
  versionStyle.value = {
    left: `${Math.max(12, rect.left)}px`,
    top: `${rect.bottom + 8}px`,
  };
}

function toggleVersion() {
  if (versionOpen.value) {
    closeVersion();
    return;
  }
  placeVersionPop();
  versionOpen.value = true;
  refreshUpdates({ force: true });
}

function closeVersion() {
  if (applying.value) return;
  versionOpen.value = false;
}

function onVersionOutside(e) {
  if (!versionOpen.value) return;
  if (brandEl.value?.contains(e.target) || popEl.value?.contains(e.target)) return;
  closeVersion();
}

function onVersionKey(e) {
  if (e.key === 'Escape' && versionOpen.value) closeVersion();
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function failUpdate(message) {
  versionError.value = message;
  applyMessage.value = message;
  applying.value = false;
}

/** 后台更新：轮询进度；进入重启阶段或服务连不上时转入等待重启 */
async function followUpdate(run, bootAt) {
  let misses = 0;
  while (run === updateRun) {
    await sleep(1000);
    if (run !== updateRun) return;
    try {
      const p = await api.updateProgress();
      misses = 0;
      if (typeof p.percent === 'number') applyPercent.value = Math.max(applyPercent.value, Math.min(99, p.percent));
      if (p.message) applyMessage.value = p.message;
      if (p.phase === 'error') {
        failUpdate(p.error || p.message || '更新失败');
        return;
      }
      if (p.phase === 'restart' || (p.phase === 'idle' && !p.running)) break;
    } catch {
      misses += 1;
      if (misses >= 2) break;
    }
  }
  if (run === updateRun) await waitForRestart(run, bootAt);
}

/**
 * VERSION 文件在重启前就已替换，不能用版本号判断；以服务启动时间 bootAt 变化为准，
 * 且入口页可正常访问后再刷新，避免刷到网关错误页或旧资源。
 */
async function waitForRestart(run, bootAt) {
  applyPercent.value = Math.max(applyPercent.value, 96);
  applyMessage.value = '服务重启中，完成后自动刷新…';
  const started = Date.now();
  while (run === updateRun && Date.now() - started < 180000) {
    await sleep(1500);
    if (run !== updateRun) return;
    try {
      const info = await api.systemVersion({ fresh: true });
      const restarted = info?.bootAt && (!bootAt || info.bootAt !== bootAt);
      if (!restarted) continue;
      const page = await fetch(window.location.href, { cache: 'no-store' });
      if (!page.ok) continue;
      applyPercent.value = 100;
      applyMessage.value = `已更新到 v${info.current}，正在刷新…`;
      window.location.reload();
      return;
    } catch {
      /* 服务重启中 */
    }
  }
  if (run !== updateRun) return;
  restartStuck.value = true;
  failUpdate('服务重启时间较长，请稍后点击「刷新页面」');
}

function reloadPage() {
  window.location.reload();
}

async function applyUpdate(tag) {
  if (applying.value) return;
  const target = tag || updates.value.latest?.tag || '最新版本';
  versionOpen.value = false;
  const ok = await notify.confirm({
    title: '确认更新系统',
    message: `将从 v${updates.value.current || version.value.current || '—'} 更新到 ${target}。更新过程中服务会重启，约 1 分钟内后台、手机端和小程序暂时无法使用，确定现在更新吗？`,
    okText: '开始更新',
    icon: 'refresh',
  });
  if (!ok || applying.value) return;
  placeVersionPop();
  const run = ++updateRun;
  applying.value = true;
  restartStuck.value = false;
  versionOpen.value = true;
  versionError.value = '';
  applyPercent.value = 4;
  applyMessage.value = '开始更新…';
  let bootAt = 0;
  try {
    bootAt = (await api.systemVersion({ fresh: true }))?.bootAt || 0;
  } catch {
    /* 拿不到启动时间时以「出现 bootAt」作为重启完成 */
  }
  try {
    const result = await api.applyUpdate(tag);
    if (result?.started) {
      await followUpdate(run, result.bootAt || bootAt);
      return;
    }
    applyPercent.value = Math.max(applyPercent.value, 96);
    applyMessage.value = result?.message || '安装完成，正在重启…';
    await waitForRestart(run, bootAt);
  } catch (err) {
    const message = err?.message || '更新失败';
    // 请求被超时 / 网关掐断时更新可能仍在进行，改为跟踪进度
    if (/网络异常|服务未响应|HTTP 5\d\d|响应格式错误/.test(message)) {
      await followUpdate(run, bootAt);
      return;
    }
    failUpdate(message);
  }
}

function dismissCert() {
  certDismissed.value = certCount.value;
  sessionStorage.setItem('cert_notice_count', String(certCount.value));
}

function dismissSetup() {
  setupDismissed.value = setupErrors.value.join('|');
  sessionStorage.setItem('setup_notice', setupDismissed.value);
}

function loadSetup(force = false) {
  if (profile.value?.role === 'school' || !allow(profile.value, SETUP_PERMS)) return;
  refreshSetupStatus(force).catch(() => {
    /* 检查失败不打断页面 */
  });
}

function onFinanceChanged() {
  markSetupDirty();
  loadSetup(true);
}

function dismissSmsLow() {
  smsLowDismissed.value = smsLow.value.lowMessage;
  sessionStorage.setItem('sms_low_notice', smsLow.value.lowMessage);
}

async function loadSmsBalance(force = false) {
  if (!canSms.value) return;
  try {
    const data = await api.smsBalance(force);
    smsLow.value = { low: !!data.low, lowMessage: data.lowMessage || '' };
  } catch {
    /* 余量查询失败不打断页面 */
  }
}

function onSmsBalanceChanged() {
  loadSmsBalance(false);
}

async function loadHeaderNotices(force = false) {
  const now = Date.now();
  if (!force && now - (loadHeaderNotices._at || 0) < 45_000) return;
  loadHeaderNotices._at = now;
  if (profile.value?.role === 'school') return;
  if (allow(profile.value, 'home.overview', 'trade.order')) {
    try {
      const data = await api.dashboardPendingCount();
      pendingCount.value = data.pendingOrderCount || 0;
    } catch {
      /* 角标失败不打断页面 */
    }
  }
  if (!canCert.value) return;
  try {
    const data = await api.certsPendingCount();
    certCount.value = data.count || 0;
    certNames.value = data.names || '';
  } catch {
    /* ignore */
  }
}
async function guardAccount(force = false) {
  const now = Date.now();
  if (!force && now - (guardAccount._at || 0) < 60_000) return;
  guardAccount._at = now;
  try {
    const data = await api.session();
    if (data?.admin) {
      updateProfile(data.admin);
      profile.value = data.admin;
      const perm = route.meta?.perm;
      if (perm && data.admin.role !== 'school' && !allow(data.admin, perm)) {
        const next = landingPath(data.admin);
        if (next && next !== route.path) router.replace(next);
      }
    }
  } catch (err) {
    const text = err?.message || '';
    if (/账号已冻结|账号已停用/.test(text)) accountLock.message = text;
  }
}
watch(() => route.path, () => {
  syncOpen();
  // 路由切换只做轻量节流刷新，避免每次切页打满接口
  loadHeaderNotices(false);
  guardAccount(false);
  loadSetup(false);
});
onMounted(async () => {
  hydrate();
  syncOpen();
  await nextTick();
  refreshUpdates();
  updateTimer = window.setInterval(() => refreshUpdates({ force: true }), 10 * 60 * 1000);
  window.addEventListener('resize', placeVersionPop);
  document.addEventListener('pointerdown', onVersionOutside, true);
  document.addEventListener('keydown', onVersionKey);
  loadHeaderNotices(true);
  guardAccount(true);
  loadSmsBalance(false);
  smsTimer = window.setInterval(() => loadSmsBalance(true), 30 * 60 * 1000);
  window.addEventListener('sms-balance-changed', onSmsBalanceChanged);
  loadSetup(true);
  window.addEventListener('finance-changed', onFinanceChanged);
});

onUnmounted(() => {
  clearInterval(updateTimer);
  document.removeEventListener('pointerdown', onVersionOutside, true);
  document.removeEventListener('keydown', onVersionKey);
  clearInterval(smsTimer);
  window.removeEventListener('sms-balance-changed', onSmsBalanceChanged);
  window.removeEventListener('finance-changed', onFinanceChanged);
  clearInterval(pollTimer);
  updateRun += 1;
  window.removeEventListener('resize', placeVersionPop);
});
</script>
