const TOKEN_KEY = 'token';
const USER_KEY = 'userInfo';
const DEVICE_KEY = 'mobile_device_id';

const state = {
  token: '',
  userInfo: null,
};

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

export function initStore() {
  state.token = localStorage.getItem(TOKEN_KEY) || '';
  state.userInfo = readJson(USER_KEY);
}

export function getToken() {
  return state.token || localStorage.getItem(TOKEN_KEY) || '';
}

export function getUser() {
  return state.userInfo || readJson(USER_KEY);
}

export function setSession(token, user) {
  state.token = token || '';
  state.userInfo = user || null;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function clearSession() {
  setSession('', null);
}

export function isLoggedIn() {
  return !!getToken();
}

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (id && /^[A-Za-z0-9_-]{32,64}$/.test(id)) return id;
  const raw =
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
      : `h5${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
    ).slice(0, 48);
  id = raw.replace(/[^A-Za-z0-9_-]/g, 'x').padEnd(32, '0').slice(0, 48);
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export function assetUrl(path, origin = '') {
  if (!path) return '';
  if (/^https?:\/\//.test(path) || path.startsWith('blob:') || path.startsWith('data:')) return path;
  const base = origin || (typeof location !== 'undefined' ? location.origin : '');
  let url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (/\/uploads\/(certs|signs)\//.test(path)) {
    const token = getToken();
    if (token) {
      url += `${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
    }
  }
  return url;
}
