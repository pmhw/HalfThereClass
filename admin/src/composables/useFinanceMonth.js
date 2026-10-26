import { computed, onActivated, onDeactivated, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const STORAGE_KEY = 'finance_month';
const MONTH_RE = /^\d{4}-\d{2}$/;

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month, delta) {
  const [y, m] = String(month).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function isMonth(value) {
  return MONTH_RE.test(String(value || ''));
}

function initial() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (isMonth(saved)) return saved;
  } catch {
    // ignore
  }
  return currentMonth();
}

/** 财务各页共用的结算月份，顶栏切换后所有财务页跟随 */
export const financeMonth = ref(initial());
/** 支持「全部月份」的页面各自记住是否看全部（key 为路由 path） */
export const monthAll = reactive({});

/** 当前页面的月份模式（true / 'all'）；同一路由下不同 tab 可用 meta.monthTabs 单独指定 */
export function monthMode(route) {
  const tabs = route.meta?.monthTabs;
  const tab = route.query?.tab;
  if (tabs && tab && tabs[tab] !== undefined) return tabs[tab];
  return route.meta?.month;
}

/** 「全部月份」开关的记忆键：按页面区分，有 monthTabs 的页面再按 tab 区分 */
export function monthKey(route) {
  return route.meta?.monthTabs && route.query?.tab ? `${route.path}?tab=${route.query.tab}` : route.path;
}

export function setFinanceMonth(month) {
  if (!isMonth(month)) return;
  financeMonth.value = month;
  try {
    sessionStorage.setItem(STORAGE_KEY, month);
  } catch {
    // ignore
  }
}

/**
 * 页面接入共用月份：返回可读写的 month（'' 表示全部月份，仅 allowAll 页面）。
 * 月份变化时只刷新当前可见的页面；keep-alive 隐藏的页面切回时由 bindLoad 自动刷新。
 */
export function useFinanceMonth(onChange, { allowAll = false, defaultAll = false } = {}) {
  const path = monthKey(useRoute());
  if (allowAll && monthAll[path] === undefined) monthAll[path] = defaultAll;
  const month = computed({
    get: () => (allowAll && monthAll[path] ? '' : financeMonth.value),
    set: (value) => {
      if (allowAll && !value) {
        monthAll[path] = true;
        return;
      }
      if (allowAll) monthAll[path] = false;
      setFinanceMonth(value);
    },
  });
  let active = true;
  onActivated(() => {
    active = true;
  });
  onDeactivated(() => {
    active = false;
  });
  watch(month, () => {
    if (active) onChange?.();
  });
  return month;
}
