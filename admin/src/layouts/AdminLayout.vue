<template>
  <div class="shell" :class="{ collapsed }">
    <aside class="sidebar">
      <div
        class="brand"
        :class="{ 'has-update': updates.hasUpdate }"
        @mouseenter="openVersion(true)"
        @mouseleave="closeVersion"
        @focusin="openVersion(true)"
        @focusout="closeVersion"
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
          class="version-pop"
          :style="versionStyle"
          @mouseenter="openVersion(false)"
          @mouseleave="closeVersion"
          @mousedown.prevent
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
              <button type="button" class="link" :disabled="versionLoading" @click="refreshUpdates(true)">
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
          <p v-if="versionError" class="version-error">{{ versionError }}</p>
        </div>
      </Teleport>
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
      <button type="button" class="collapse-btn" @click="toggleCollapse">
        <Icon name="collapse" />
        <span>{{ collapsed ? '展开' : '收起' }}</span>
      </button>
    </aside>

    <div class="main">
      <header class="header">
        <div class="crumb">
          <small>{{ route.meta.crumb }}</small>
          <strong>{{ route.meta.title }}</strong>
        </div>
        <div v-if="profile?.role !== 'school'" class="search">
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

      <div class="content">
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
import { api, accountLock, clearToken, getProfile } from '../api';
import { allow } from '../access';
import { clearAdminTabsStorage, useAdminTabs } from '../composables/useAdminTabs';

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
const canCert = computed(() => profile.value?.role !== 'school' && allow(profile.value, 'people'));
const showCertNotice = computed(() => certCount.value > 0 && certCount.value !== certDismissed.value);
const versionOpen = ref(false);
const versionLoading = ref(false);
const applying = ref(false);
const applyMessage = ref('');
const applyPercent = ref(0);
const versionError = ref('');
const versionStyle = ref({ left: '12px', top: '64px' });
const version = ref({ current: '', repo: '' });
const updates = ref({ current: '', hasUpdate: false, updates: [], latest: null, releases: [], repo: '', releasesUrl: '' });
let versionTimer = 0;
let updateTimer = 0;
let pollTimer = 0;
let progressTimer = 0;
const collapsed = ref(localStorage.getItem('admin_nav_collapsed') === '1');
const opened = ref({ course: true, trade: false, admin: true, finance: true });
const result = ref({ courses: [], users: [], orders: [] });
const profile = ref(getProfile());
const menuSource = [
  { key: 'home', label: '首页', icon: 'overview', to: '/', perm: 'overview' },
  {
    key: 'course',
    label: '课程管理',
    icon: 'book',
    children: [
      { to: '/courses', label: '课程列表', icon: 'list', perm: 'course' },
      { to: '/assign', label: '预先排课', icon: 'list', perm: 'fee' },
      { to: '/term', label: '学期排课', icon: 'cal', perm: 'schedule' },
      { to: '/categories', label: '分类管理', icon: 'folder', perm: 'course' },
      { to: '/schools', label: '学校管理', icon: 'building', perm: 'course' },
    ],
  },
  {
    key: 'trade',
    label: '订单管理',
    icon: 'receipt',
    children: [
      { to: '/orders', label: '订单列表', icon: 'receipt', perm: 'order' },
      { to: '/comments', label: '评价管理', icon: 'message', perm: 'comment' },
    ],
  },
  {
    key: 'people',
    label: '用户管理',
    icon: 'users',
    children: [
      { to: '/people', label: '用户列表', icon: 'users', perm: 'people' },
      { to: '/faculty', label: '教师管理', icon: 'users', perm: 'people' },
      { to: '/certs', label: '教师认证', icon: 'message', perm: 'people' },
    ],
  },
  {
    key: 'org',
    label: '机构管理',
    icon: 'folder',
    children: [
      { to: '/orgs', label: '机构列表', icon: 'folder', perm: 'org' },
    ],
  },
  {
    key: 'fee',
    label: '费用结算',
    icon: 'receipt',
    children: [
      { to: '/incomes', label: '收入记录', icon: 'chart', perm: 'fee' },
    ],
  },
  {
    key: 'finance',
    label: '财务管理',
    icon: 'chart',
    children: [
      { to: '/finance', label: '收益概览', icon: 'chart', perm: 'finance' },
      { to: '/finance/monthly', label: '月度收益', icon: 'list', perm: 'finance' },
      { to: '/finance/teachers', label: '教师收益', icon: 'users', perm: 'finance' },
      { to: '/finance/orgs', label: '机构收益', icon: 'folder', perm: 'finance' },
      { to: '/finance/rules', label: '收益规则', icon: 'gear', perm: 'finance' },
      { to: '/reimbursements', label: '报销单', icon: 'receipt', perm: 'finance' },
    ],
  },
  {
    key: 'admin',
    label: '权限管理',
    icon: 'users',
    children: [
      { to: '/admins', label: '管理员', icon: 'users', perm: 'admin' },
      { to: '/settings', label: '系统设置', icon: 'gear', perm: 'admin' },
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
    if (!group.children) return allow(profile.value, group.perm) ? group : null;
    const children = group.children.filter((item) => allow(profile.value, item.perm));
    return children.length ? { ...group, children } : null;
  })
  .filter(Boolean);
});

const hasResult = computed(() => result.value.courses.length || result.value.users.length || result.value.orders.length);

function isActive(path) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path);
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

async function refreshUpdates(forceOpen = false) {
  if (versionLoading.value) return;
  // 路由切换不强制打 GitHub；仅打开浮层或定时器时检测
  if (!forceOpen && !versionOpen.value && updates.value?.current) return;
  versionLoading.value = true;
  versionError.value = '';
  try {
    const [info, list] = await Promise.all([
      api.systemVersion(),
      api.systemUpdates({ force: forceOpen || versionOpen.value ? '1' : '' }),
    ]);
    version.value = info;
    updates.value = {
      ...list,
      releasesUrl: list.repo ? `${list.repo}/releases` : '',
    };
    if (forceOpen) {
      placeVersionPop();
      versionOpen.value = true;
    }
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
    if (forceOpen || versionOpen.value) versionError.value = err.message || '检测失败';
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

function openVersion(check = false) {
  clearTimeout(versionTimer);
  placeVersionPop();
  versionOpen.value = true;
  if (check) refreshUpdates(true);
}

function closeVersion() {
  if (applying.value) return;
  clearTimeout(versionTimer);
  versionTimer = window.setTimeout(() => { versionOpen.value = false; }, 180);
}

function stopProgressPoll() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = 0;
  }
}

function startProgressPoll() {
  stopProgressPoll();
  progressTimer = window.setInterval(async () => {
    try {
      const p = await api.updateProgress();
      if (typeof p.percent === 'number') applyPercent.value = Math.max(applyPercent.value, Math.min(99, p.percent));
      if (p.message) applyMessage.value = p.message;
      if (p.phase === 'error' && p.error) {
        versionError.value = p.error;
        applyMessage.value = p.error;
      }
    } catch {
      /* 重启期间接口短暂不可用 */
    }
  }, 700);
}

async function waitForRestart(expectVersion) {
  applyPercent.value = Math.max(applyPercent.value, 96);
  applyMessage.value = '服务重启中，即将刷新界面…';
  const started = Date.now();
  while (Date.now() - started < 120000) {
    await new Promise((resolve) => { setTimeout(resolve, 1200); });
    try {
      const info = await api.systemVersion();
      if (!expectVersion || String(info.current) === String(expectVersion) || info.current) {
        applyPercent.value = 100;
        applyMessage.value = '更新完成';
        window.location.reload();
        return;
      }
    } catch {
      /* still restarting */
    }
  }
  versionError.value = '等待超时，请手动刷新页面';
  applying.value = false;
  stopProgressPoll();
}

async function applyUpdate(tag) {
  if (applying.value) return;
  applying.value = true;
  versionOpen.value = true;
  versionError.value = '';
  applyPercent.value = 4;
  applyMessage.value = '开始更新…';
  startProgressPoll();
  try {
    const result = await api.applyUpdate(tag);
    applyPercent.value = Math.max(applyPercent.value, 96);
    applyMessage.value = result.message || '安装完成，正在重启…';
    await waitForRestart(result.version);
  } catch (err) {
    versionError.value = err.message || '更新失败';
    applyMessage.value = err.message || '更新失败';
    applying.value = false;
    stopProgressPoll();
  }
}

function dismissCert() {
  certDismissed.value = certCount.value;
  sessionStorage.setItem('cert_notice_count', String(certCount.value));
}

async function loadHeaderNotices(force = false) {
  const now = Date.now();
  if (!force && now - (loadHeaderNotices._at || 0) < 45_000) return;
  loadHeaderNotices._at = now;
  if (profile.value?.role === 'school') return;
  if (allow(profile.value, 'overview')) {
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
    await api.session();
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
});
onMounted(async () => {
  hydrate();
  syncOpen();
  await nextTick();
  refreshUpdates(false);
  updateTimer = window.setInterval(() => refreshUpdates(true), 10 * 60 * 1000);
  window.addEventListener('resize', placeVersionPop);
  loadHeaderNotices(true);
  guardAccount(true);
});

onUnmounted(() => {
  clearTimeout(versionTimer);
  clearInterval(updateTimer);
  clearInterval(pollTimer);
  stopProgressPoll();
  window.removeEventListener('resize', placeVersionPop);
});
</script>
