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
  if (id) return id;
  id = `h5_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export function assetUrl(path, origin = '') {
  if (!path) return '';
  if (/^https?:\/\//.test(path) || path.startsWith('blob:') || path.startsWith('data:')) return path;
  const base = origin || (typeof location !== 'undefined' ? location.origin : '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
