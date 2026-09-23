import { getToken, clearSession } from '../store';
import { lock as freezeLock, isFrozenMessage } from '../utils/freeze';

const API_BASE = '/api';

function cleanData(data) {
  if (!data || typeof data !== 'object' || data instanceof FormData) return data || {};
  const result = {};
  Object.keys(data).forEach((key) => {
    const value = data[key];
    if (value === undefined || value === null || value === '') return;
    result[key] = value;
  });
  return result;
}

function toast(title) {
  if (typeof window !== 'undefined' && window.__novisToast) {
    window.__novisToast(title);
    return;
  }
  // fallback
  console.warn(title);
}

async function request(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    body = JSON.stringify(cleanData(body));
  }

  const response = await fetch(`${API_BASE}${url}`, {
    method: options.method || 'GET',
    headers,
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (payload.code === 0) return payload.data;

  const message = Array.isArray(payload.message) ? payload.message.join('，') : (payload.message || '请求失败');

  if (payload.code === 401) {
    clearSession();
    const base = import.meta.env.BASE_URL || '/m/';
    if (!location.pathname.includes('/login')) {
      location.assign(`${base}login`.replace(/([^:]\/)\/+/g, '$1'));
    }
    throw new Error('未授权');
  }

  if (isFrozenMessage(message)) {
    freezeLock(message);
  } else if (!options.silent) {
    toast(message);
  }
  throw new Error(message);
}

export const get = (url, params) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, value);
  });
  const query = search.toString();
  return request(query ? `${url}?${query}` : url, { method: 'GET' });
};

export const post = (url, data, options = {}) => request(url, { method: 'POST', body: data, ...options });
export const put = (url, data, options = {}) => request(url, { method: 'PUT', body: data, ...options });
export const del = (url, data) => request(url, { method: 'DELETE', body: data });

export async function upload(url, file, field = 'file') {
  const form = new FormData();
  form.append(field, file);
  return request(url, { method: 'POST', body: form, headers: {} });
}

export function showToast(title) {
  toast(title);
}

export function installToast(fn) {
  window.__novisToast = fn;
}
