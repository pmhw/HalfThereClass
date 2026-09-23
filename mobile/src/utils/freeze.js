import { getProfile } from '../api';
import { clearSession, getToken } from '../store';

const LOCK_PATH = '/frozen';

let reminded = false;
let modalOn = false;
let opening = false;
let pending = null;
let lastOkAt = 0;
let frozenMessage = '账号已冻结';
let routerRef = null;

export function bindRouter(router) {
  routerRef = router;
}

export function getFrozenMessage() {
  return frozenMessage;
}

export function isFrozenMessage(message) {
  return /账号已冻结/.test(String(message || ''));
}

function remember(message) {
  frozenMessage = message && /冻结/.test(message) ? message : '账号已冻结';
  return frozenMessage;
}

function openLock() {
  const current = routerRef?.currentRoute?.value?.path || '';
  if (current === LOCK_PATH || opening) return;
  opening = true;
  const done = () => {
    opening = false;
  };
  if (routerRef) {
    routerRef.replace(LOCK_PATH).finally(done);
  } else {
    const base = import.meta.env.BASE_URL || '/m/';
    location.assign(`${base}frozen`.replace(/([^:]\/)\/+/g, '$1'));
    done();
  }
}

export function lock(message) {
  const text = remember(message);
  const current = routerRef?.currentRoute?.value?.path || '';
  if (current === LOCK_PATH) return;
  if (!reminded) {
    reminded = true;
    modalOn = true;
    window.alert(`${text}。暂时无法使用，如有疑问请联系管理员。`);
    modalOn = false;
    openLock();
    return;
  }
  if (!modalOn) openLock();
}

export function clear() {
  reminded = false;
  modalOn = false;
  frozenMessage = '账号已冻结';
}

export async function check() {
  if (!getToken()) return false;
  if (Date.now() - lastOkAt < 2000) return false;
  if (pending) return pending;
  pending = Promise.race([
    runCheck(),
    new Promise((resolve) => {
      setTimeout(() => resolve(false), 3500);
    }),
  ]).finally(() => {
    pending = null;
  });
  return pending;
}

async function runCheck() {
  try {
    const user = await getProfile();
    if (user && Number(user.status) === 0) {
      lock('账号已冻结');
      return true;
    }
    lastOkAt = Date.now();
    clear();
    return false;
  } catch (err) {
    const message = err && err.message ? err.message : '';
    if (isFrozenMessage(message)) {
      lock(message);
      return true;
    }
    return false;
  }
}

export function logoutToLogin() {
  clear();
  clearSession();
  if (routerRef) routerRef.replace('/login');
  else {
    const base = import.meta.env.BASE_URL || '/m/';
    location.assign(`${base}login`.replace(/([^:]\/)\/+/g, '$1'));
  }
}
