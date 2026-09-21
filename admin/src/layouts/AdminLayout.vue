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
        <div class="logo">
          半
          <i v-if="updates.hasUpdate" class="update-dot"></i>
        </div>
        <div class="brand-text">
          <strong>半堂课</strong>
          <span>{{ updates.hasUpdate ? `有新版本 ${updates.latest?.tag || ''}` : '课程平台管理后台' }}</span>
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
            <em v-if="updates.hasUpdate" class="new">有更新</em>
          </div>
          <p class="version-current">当前版本 <b>v{{ updates.current || version.current || '—' }}</b></p>
          <p v-if="updates.latest" class="version-latest">
            {{ updates.hasUpdate ? '可更新到' : '最新发布' }} <b>{{ updates.latest.tag }}</b>
            <small v-if="updates.latest.publishedAt"> · {{ formatTime(updates.latest.publishedAt) }}</small>
          </p>
          <p v-else class="version-latest muted">{{ versionLoading ? '正在检测更新…' : '暂未检测到可更新版本' }}</p>
          <div v-if="updates.updates?.length" class="version-list">
            <div v-for="item in updates.updates" :key="item.tag" class="version-item">
              <div>
                <strong>{{ item.tag }}</strong>
                <small>{{ item.assetName || '发布包' }}</small>
              </div>
              <button class="link" type="button" :disabled="applying" @click="applyUpdate(item.tag)">更新</button>
            </div>
          </div>
          <div class="version-actions">
            <button type="button" class="link" :disabled="versionLoading || applying" @click="refreshUpdates(true)">
              {{ versionLoading ? '检测中…' : '立即检测' }}
            </button>
            <button
              v-if="updates.hasUpdate"
              class="btn tiny primary"
              type="button"
              :disabled="applying"
              @click="applyUpdate()"
            >{{ applying ? '更新中…' : '一键更新并重启' }}</button>
          </div>
          <p v-if="versionError" class="version-error">{{ versionError }}</p>
        </div>
      </Teleport>
      <div v-if="applying" class="update-mask">
        <div class="update-card">
          <strong>正在更新并重启面板</strong>
          <p>{{ applyMessage || '下载安装包、替换文件后将自动重启，请稍候…' }}</p>
        </div>
      </div>
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
          <router-link v-if="profile?.role !== 'school'" class="icon-btn" to="/orders?status=pending" title="待支付订单">
            <Icon name="bell" />
            <i v-if="pendingCount" class="dot"></i>
          </router-link>
          <button type="button" class="icon-btn" title="帮助" @click="help = !help">
            <Icon name="help" />
          </button>
          <div style="position: relative">
            <button type="button" class="avatar-btn" @click="userMenu = !userMenu">
              <span class="avatar">管</span>
              {{ profile?.name || '管理员' }}
            </button>
            <div v-if="userMenu" class="menu">
              <button type="button" @click="logout">退出登录</button>
            </div>
          </div>
        </div>
      </header>
      <div class="content">
        <router-view />
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
import { api, clearToken, getProfile } from '../api';
import { allow } from '../access';

const route = useRoute();
const router = useRouter();
const keyword = ref('');
const open = ref(false);
const help = ref(false);
const userMenu = ref(false);
const pendingCount = ref(0);
const versionOpen = ref(false);
const versionLoading = ref(false);
const applying = ref(false);
const applyMessage = ref('');
const versionError = ref('');
const versionStyle = ref({ left: '12px', top: '64px' });
const version = ref({ current: '', repo: '' });
const updates = ref({ current: '', hasUpdate: false, updates: [], latest: null, releases: [], repo: '', releasesUrl: '' });
let versionTimer = 0;
let updateTimer = 0;
let pollTimer = 0;
const collapsed = ref(localStorage.getItem('admin_nav_collapsed') === '1');
const opened = ref({ course: true, trade: false, admin: true });
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
      { to: '/assign', label: '教师分配', icon: 'list', perm: 'fee' },
      { to: '/incomes', label: '收入记录', icon: 'chart', perm: 'fee' },
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
  versionLoading.value = true;
  versionError.value = '';
  try {
    const [info, list] = await Promise.all([api.systemVersion(), api.systemUpdates()]);
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
  if (check) refreshUpdates();
}

function closeVersion() {
  if (applying.value) return;
  clearTimeout(versionTimer);
  versionTimer = window.setTimeout(() => { versionOpen.value = false; }, 180);
}

async function waitForRestart(expectVersion) {
  applyMessage.value = '服务重启中，正在等待面板恢复…';
  const started = Date.now();
  while (Date.now() - started < 120000) {
    await new Promise((resolve) => { setTimeout(resolve, 1500); });
    try {
      const info = await api.systemVersion();
      if (!expectVersion || String(info.current) === String(expectVersion) || info.current) {
        applyMessage.value = '更新完成，正在刷新面板…';
        window.location.reload();
        return;
      }
    } catch {
      /* still restarting */
    }
  }
  applyMessage.value = '等待超时，请手动刷新页面';
  applying.value = false;
}

async function applyUpdate(tag) {
  if (applying.value) return;
  const label = tag || updates.value.latest?.tag || '最新版';
  if (!window.confirm(`确定更新到 ${label} 并自动重启面板？\n数据库与 .env 会保留。`)) return;
  applying.value = true;
  versionOpen.value = true;
  versionError.value = '';
  applyMessage.value = '正在下载并安装更新包…';
  try {
    const result = await api.applyUpdate(tag);
    applyMessage.value = result.message || '安装完成，准备重启…';
    await waitForRestart(result.version);
  } catch (err) {
    versionError.value = err.message || '更新失败';
    applyMessage.value = '';
    applying.value = false;
  }
}

watch(() => route.path, () => {
  syncOpen();
  refreshUpdates();
});
onMounted(async () => {
  syncOpen();
  await nextTick();
  refreshUpdates();
  updateTimer = window.setInterval(() => refreshUpdates(), 10 * 60 * 1000);
  window.addEventListener('resize', placeVersionPop);
  if (!allow(profile.value, 'overview')) return;
  try {
    const data = await api.dashboard();
    pendingCount.value = data.pendingOrderCount;
  } catch {
    pendingCount.value = 0;
  }
});

onUnmounted(() => {
  clearTimeout(versionTimer);
  clearInterval(updateTimer);
  clearInterval(pollTimer);
  window.removeEventListener('resize', placeVersionPop);
});
</script>
