import { reactive } from 'vue';

const TOKEN_KEY = 'finance_token';

/** 财务密码弹窗状态；unset 表示当前账号还没设置财务密码 */
export const financeGate = reactive({ open: false, unset: false });

let waiters = [];

/** 人离开电脑的判定：后台定时请求会让服务端续期，所以按真实的点击 / 键盘 / 滚动算空闲 */
const ACTIVE_KEY = 'finance_active_at';
const IDLE_MS = 2 * 60 * 60 * 1000;

function markActive() {
  localStorage.setItem(ACTIVE_KEY, String(Date.now()));
}

function idleTooLong() {
  const at = Number(localStorage.getItem(ACTIVE_KEY)) || 0;
  return Date.now() - at > IDLE_MS;
}

/** 存 localStorage：同一浏览器的多个标签页共用一次解锁，任一页面有操作都会续期 */
export function getFinanceToken() {
  try {
    const data = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (!data?.token) return '';
    if (Number(data.expiresAt) > Date.now() && !idleTooLong()) return data.token;
    clearFinanceToken();
  } catch {
    /* ignore */
  }
  return '';
}

/** 刚输入财务密码拿到的凭证 */
export function setFinanceToken(token, expiresAt) {
  if (!token) return;
  markActive();
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt: Number(expiresAt) || 0 }));
}

/** 接口响应里的续期凭证：本地已过期或已空闲的不复活 */
export function renewFinanceToken(token, expiresAt) {
  if (token && getFinanceToken()) localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt: Number(expiresAt) || 0 }));
}

export function clearFinanceToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

if (typeof window !== 'undefined') {
  const legacy = sessionStorage.getItem(TOKEN_KEY);
  if (legacy && !localStorage.getItem(TOKEN_KEY)) {
    localStorage.setItem(TOKEN_KEY, legacy);
    markActive();
  }
  sessionStorage.removeItem(TOKEN_KEY);
  let last = 0;
  const onActivity = () => {
    const now = Date.now();
    if (now - last < 30_000) return;
    last = now;
    if (localStorage.getItem(TOKEN_KEY) && !idleTooLong()) markActive();
  };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((type) => window.addEventListener(type, onActivity, { passive: true, capture: true }));
  /** 另一个标签页刚输入了财务密码：本页正在弹的密码框直接放行 */
  window.addEventListener('storage', (event) => {
    if (event.key === TOKEN_KEY && financeGate.open && !financeGate.unset && financeUnlocked()) settleFinancePin(true);
  });
}

export function financeUnlocked() {
  return !!getFinanceToken();
}

export function isFinancePath(path) {
  return path === '/finance' || path.startsWith('/finance/') || path === '/reimbursements';
}

/** 弹出财务密码框：输入正确返回 true，取消返回 false。同时触发多次只弹一个框 */
export function requireFinancePin({ unset = false } = {}) {
  if (!unset && financeUnlocked()) return Promise.resolve(true);
  financeGate.unset = unset;
  financeGate.open = true;
  return new Promise((resolve) => waiters.push(resolve));
}

export function settleFinancePin(ok) {
  financeGate.open = false;
  const list = waiters;
  waiters = [];
  list.forEach((resolve) => resolve(ok));
}
