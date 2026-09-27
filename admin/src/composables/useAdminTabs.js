import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const STORAGE_KEY = 'admin_workspace_tabs_v1';
const MAX_TABS = 24;

/** @type {import('vue').Ref<Array<{ key: string, path: string, fullPath: string, title: string, crumb: string }>>} */
const tabs = ref([]);
const activeKey = ref('');
/** refresh bump per tab key — changes keep-alive key to remount */
const refreshMap = ref({});

let hydrated = false;

function tabKeyOf(route) {
  return route.path || '/';
}

function titleOf(route) {
  const title = route.meta?.title || '未命名';
  if (route.params?.id) return `${title} #${route.params.id}`;
  return title;
}

function readStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tabs)) return null;
    return data;
  } catch {
    return null;
  }
}

function persist() {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: tabs.value,
        activeKey: activeKey.value,
        refreshMap: refreshMap.value,
      }),
    );
  } catch {
    // ignore quota
  }
}

function ensureTab(route) {
  if (!route || route.path === '/login' || route.meta?.public) return;
  const key = tabKeyOf(route);
  const existing = tabs.value.find((item) => item.key === key);
  const next = {
    key,
    path: route.path,
    fullPath: route.fullPath,
    title: titleOf(route),
    crumb: route.meta?.crumb || '',
  };
  if (existing) {
    existing.fullPath = next.fullPath;
    existing.title = next.title;
    existing.crumb = next.crumb;
    existing.path = next.path;
  } else {
    tabs.value = [...tabs.value, next].slice(-MAX_TABS);
  }
  activeKey.value = key;
  persist();
}

export function useAdminTabs() {
  const route = useRoute();
  const router = useRouter();

  const currentTab = computed(() => tabs.value.find((item) => item.key === activeKey.value) || null);

  function aliveKey(forRoute = route) {
    const key = tabKeyOf(forRoute);
    const bump = refreshMap.value[key] || 0;
    return `${key}__${bump}`;
  }

  function hydrate() {
    if (hydrated) return;
    hydrated = true;
    const saved = readStorage();
    if (saved?.tabs?.length) {
      tabs.value = saved.tabs;
      refreshMap.value = saved.refreshMap || {};
      activeKey.value = saved.activeKey || saved.tabs[0]?.key || '';
      const active = tabs.value.find((item) => item.key === activeKey.value) || tabs.value[0];
      if (active && active.fullPath !== route.fullPath) {
        router.replace(active.fullPath).catch(() => {});
      }
    }
    ensureTab(route);
  }

  function activate(tab) {
    if (!tab) return;
    activeKey.value = tab.key;
    persist();
    if (route.fullPath !== tab.fullPath) {
      router.push(tab.fullPath).catch(() => {});
    }
  }

  function closeTab(tab, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!tab || tabs.value.length <= 1) return;
    const idx = tabs.value.findIndex((item) => item.key === tab.key);
    if (idx < 0) return;
    const wasActive = activeKey.value === tab.key;
    tabs.value = tabs.value.filter((item) => item.key !== tab.key);
    const nextMap = { ...refreshMap.value };
    delete nextMap[tab.key];
    refreshMap.value = nextMap;
    if (wasActive) {
      const fallback = tabs.value[Math.max(0, idx - 1)] || tabs.value[0];
      activeKey.value = fallback.key;
      persist();
      router.push(fallback.fullPath).catch(() => {});
    } else {
      persist();
    }
  }

  function closeOthers(tab) {
    if (!tab) return;
    tabs.value = tabs.value.filter((item) => item.key === tab.key);
    refreshMap.value = { [tab.key]: refreshMap.value[tab.key] || 0 };
    activeKey.value = tab.key;
    persist();
    if (route.fullPath !== tab.fullPath) router.push(tab.fullPath).catch(() => {});
  }

  function refreshCurrent() {
    const key = activeKey.value || tabKeyOf(route);
    refreshMap.value = {
      ...refreshMap.value,
      [key]: (refreshMap.value[key] || 0) + 1,
    };
    persist();
  }

  function clearTabs() {
    tabs.value = [];
    activeKey.value = '';
    refreshMap.value = {};
    hydrated = false;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  watch(
    () => route.fullPath,
    () => {
      if (route.path === '/login' || route.meta?.public) return;
      ensureTab(route);
    },
  );

  return {
    tabs,
    activeKey,
    currentTab,
    aliveKey,
    hydrate,
    activate,
    closeTab,
    closeOthers,
    refreshCurrent,
    clearTabs,
    ensureTab,
  };
}

export function clearAdminTabsStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  tabs.value = [];
  activeKey.value = '';
  refreshMap.value = {};
  hydrated = false;
}
