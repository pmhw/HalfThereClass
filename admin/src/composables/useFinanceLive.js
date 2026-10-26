import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue';

const EVENT = 'finance-changed';
const STORAGE_KEY = 'finance_changed_at';
let seq = 0;

/**
 * 财务数据变动广播：本窗口内用事件，其他浏览器窗口通过 localStorage 的 storage 事件收到。
 * 结算单固定/解除、同步课次、改收益规则、改分成配置/合集、标记打款后调用。
 */
export function notifyFinanceChanged(reason = '', source = '') {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { reason, source } }));
  try {
    localStorage.setItem(STORAGE_KEY, `${Date.now()}|${reason}`);
  } catch {
    // 无痕模式等写不了 localStorage 时只做本窗口通知
  }
}

/**
 * 财务页实时刷新：收到变动广播即静默刷新；页面可见时每 interval 轮询一次（兜底其他管理员 / 自动结课产生的变动）；
 * keep-alive 隐藏期间暂停，切回时由 bindLoad 刷新。返回的 notify 会忽略自己发出的广播，避免重复加载。
 */
export function useFinanceLive(refresh, { interval = 60000 } = {}) {
  const id = `finance-live-${++seq}`;
  let active = true;
  let timer = 0;
  let pending = false;
  let last = Date.now();

  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const trigger = () => {
    if (!active || !visible()) {
      pending = true;
      return;
    }
    pending = false;
    last = Date.now();
    refresh();
  };
  const onEvent = (e) => {
    if (e?.detail?.source === id) return;
    trigger();
  };
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY) trigger();
  };
  const onVisible = () => {
    if (visible() && active && (pending || Date.now() - last > interval)) trigger();
  };
  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
  };
  const start = () => {
    stop();
    timer = window.setInterval(() => {
      if (active && visible()) trigger();
    }, interval);
  };

  onMounted(() => {
    window.addEventListener(EVENT, onEvent);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    start();
  });
  onActivated(() => {
    active = true;
    pending = false;
    last = Date.now();
    start();
  });
  onDeactivated(() => {
    active = false;
    stop();
  });
  onBeforeUnmount(() => {
    stop();
    window.removeEventListener(EVENT, onEvent);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', onVisible);
    document.removeEventListener('visibilitychange', onVisible);
  });

  return {
    notify: (reason = '') => notifyFinanceChanged(reason, id),
  };
}
