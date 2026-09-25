import { reactive } from 'vue';

const TOKEN_KEY = 'admin_token';
const PROFILE_KEY = 'admin_profile';

export const accountLock = reactive({ message: '' });

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

/** 受保护静态资源（证件/签名）追加 access_token */
export function protectedAssetUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path) || path.startsWith('blob:') || path.startsWith('data:')) return path;
  const token = getToken();
  if (!token || !/\/uploads\/(certs|signs)\//.test(path)) return path;
  return `${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
}

export function getProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setSession(token, admin) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(admin));
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

const inflightGet = new Map();
const NETWORK_RE = /failed to fetch|networkerror|load failed|network request failed|aborterror|the operation was aborted|err_network|err_connection|err_name_not_resolved/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkError(err) {
  const text = String(err?.message || err || '');
  return NETWORK_RE.test(text) || err?.name === 'AbortError' || err?.name === 'TypeError';
}

async function rawFetch(url, options = {}, attempt = 0) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 25_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (attempt < 2 && isNetworkError(err) && method === 'GET') {
      await sleep(300 * (attempt + 1) * (attempt + 1));
      return rawFetch(url, options, attempt + 1);
    }
    const text = String(err?.message || err || '');
    if (isNetworkError(err)) {
      throw new Error('网络异常或服务未响应，请稍后重试（若持续出现请检查域名解析与 halfthereclass 服务）');
    }
    throw new Error(text || '网络请求失败');
  }
  clearTimeout(timer);

  // 网关偶发 502/503/504：GET 自动重试
  if ([502, 503, 504].includes(response.status) && attempt < 2 && method === 'GET') {
    await sleep(400 * (attempt + 1));
    return rawFetch(url, options, attempt + 1);
  }

  let payload;
  const raw = await response.text();
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    if (attempt < 2 && method === 'GET' && !response.ok) {
      await sleep(400 * (attempt + 1));
      return rawFetch(url, options, attempt + 1);
    }
    throw new Error(response.ok ? '响应格式错误' : `请求失败（HTTP ${response.status}）`);
  }

  if (payload.code !== 0) {
    if (payload.code === 401) {
      clearToken();
      accountLock.message = '';
      if (!location.pathname.endsWith('/login')) location.href = '/login';
    }
    const message = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    const text = message || '请求失败';
    if (getToken() && /账号已冻结|账号已停用/.test(text)) accountLock.message = text;
    throw new Error(text);
  }
  accountLock.message = '';
  return payload.data;
}

export async function request(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  // 相同 GET 合并为一次，避免路由切换时重复打点
  if (method === 'GET' && !options.noDedupe) {
    const key = url;
    if (inflightGet.has(key)) return inflightGet.get(key);
    const pending = rawFetch(url, options).finally(() => inflightGet.delete(key));
    inflightGet.set(key, pending);
    return pending;
  }
  return rawFetch(url, options);
}

function withQuery(url, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

export const api = {
  login: (body) => request('/api/admin/login', { method: 'POST', body }),
  session: () => request('/api/admin/session'),
  captcha: () => request('/api/admin/captcha'),
  checkCaptcha: (body) => request('/api/admin/captcha/check', { method: 'POST', body }),
  admins: (params) => request(withQuery('/api/admin/admins', params)),
  adminPermissions: () => request('/api/admin/admins/permissions'),
  createAdmin: (body) => request('/api/admin/admins', { method: 'POST', body }),
  updateAdmin: (id, body) => request(`/api/admin/admins/${id}`, { method: 'PUT', body }),
  adminCourseOptions: () => request('/api/admin/admins/course-options'),
  assignAdminCourses: (id, courseIds) => request(`/api/admin/admins/${id}/courses`, { method: 'PUT', body: { courseIds } }),
  schoolAccounts: () => request('/api/admin/courses/school-accounts'),
  deleteAdmin: (id) => request(`/api/admin/admins/${id}`, { method: 'DELETE' }),
  people: (params) => request(withQuery('/api/admin/people', params)),
  faculty: () => request('/api/admin/faculty'),
  facultyDetail: (id) => request(`/api/admin/faculty/${id}`),
  setFacultyOrg: (id, organizationId) => request(`/api/admin/faculty/${id}/org`, { method: 'PUT', body: { organizationId } }),
  setFacultyParent: (id, parentId) => request(`/api/admin/faculty/${id}/parent`, { method: 'PUT', body: { parentId } }),
  freezeFaculty: (id, frozen) => request(`/api/admin/faculty/${id}/freeze`, { method: 'PUT', body: { frozen } }),
  saveGrant: (id, body) => request(`/api/admin/faculty/${id}/grants`, { method: 'POST', body }),
  certs: () => request('/api/admin/certs'),
  certsPendingCount: () => request('/api/admin/certs/pending-count'),
  contracts: (params) => request(withQuery('/api/admin/contracts', params)),
  reviewContract: (id, body) => request(`/api/admin/contracts/${id}/review`, { method: 'POST', body }),
  revokeContract: (id, body) => request(`/api/admin/contracts/${id}/revoke`, { method: 'POST', body: body || {} }),
  revokeFacultyContract: (id, body) => request(`/api/admin/faculty/${id}/revoke-contract`, { method: 'POST', body: body || {} }),
  reviewCert: (userId, body) => request(`/api/admin/certs/${userId}/review`, { method: 'POST', body }),
  dashboardPendingCount: () => request('/api/admin/dashboard/pending-count'),
  orgs: () => request('/api/admin/orgs'),
  org: (id) => request(`/api/admin/orgs/${id}`),
  createOrg: (body) => request('/api/admin/orgs', { method: 'POST', body }),
  updateOrg: (id, body) => request(`/api/admin/orgs/${id}`, { method: 'PUT', body }),
  feePreview: (params) => request(withQuery('/api/admin/fees/preview', params)),
  incomes: () => request('/api/admin/incomes'),
  dashboard: () => request('/api/admin/dashboard'),
  search: (keyword) => request(withQuery('/api/admin/search', { keyword })),
  users: (params) => request(withQuery('/api/admin/users', params)),
  courses: (params) => request(withQuery('/api/admin/courses', params)),
  course: (id) => request(`/api/admin/courses/${id}`),
  teachers: () => request('/api/admin/teachers'),
  createCourse: (body) => request('/api/admin/courses', { method: 'POST', body }),
  updateCourse: (id, body) => request(`/api/admin/courses/${id}`, { method: 'PUT', body }),
  deleteCourse: (id) => request(`/api/admin/courses/${id}`, { method: 'DELETE' }),
  deleteCourses: (ids) => request('/api/admin/courses/batch-delete', { method: 'POST', body: { ids } }),
  categories: () => request('/api/admin/categories'),
  schools: () => request('/api/admin/schools'),
  amapConfig: () => request('/api/admin/schools/amap-config'),
  settingsAmap: () => request('/api/admin/settings/amap'),
  saveSettingsAmap: (body) => request('/api/admin/settings/amap', { method: 'POST', body }),
  settingsWx: () => request('/api/admin/settings/wx'),
  saveSettingsWx: (body) => request('/api/admin/settings/wx', { method: 'POST', body }),
  settingsSms: () => request('/api/admin/settings/sms'),
  saveSettingsSms: (body) => request('/api/admin/settings/sms', { method: 'POST', body }),
  settingsAgreement: () => request('/api/admin/settings/agreement'),
  saveSettingsAgreement: (body) => request('/api/admin/settings/agreement', { method: 'POST', body }),
  settingsContract: () => request('/api/admin/settings/contract'),
  saveSettingsContract: (body) => request('/api/admin/settings/contract', { method: 'POST', body }),
  settingsPartyA: () => request('/api/admin/settings/party-a'),
  saveSettingsPartyA: (body) => request('/api/admin/settings/party-a', { method: 'POST', body }),
  systemVersion: () => request('/api/admin/system/version'),
  systemUpdates: (params) => request(withQuery('/api/admin/system/updates', params || {})),
  updateProgress: () => request('/api/admin/system/update-progress'),
  applyUpdate: (tag) => request('/api/admin/system/apply-update', { method: 'POST', body: tag ? { tag } : {} }),
  databaseInfo: () => request('/api/admin/system/database'),
  saveInitSnapshot: () => request('/api/admin/system/database/init-snapshot', { method: 'POST' }),
  async exportDatabase() {
    const token = getToken();
    const response = await fetch('/api/admin/system/database/export', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let message = '导出失败';
      try {
        const payload = await response.json();
        message = payload.message || message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    const blob = await response.blob();
    const match = /filename="?([^"]+)"?/i.exec(response.headers.get('content-disposition') || '');
    const name = match?.[1] || `HalfThereClass-db-${Date.now()}.db`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { name, size: blob.size };
  },
  async importDatabase(file) {
    const token = getToken();
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/admin/system/database/import', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    const payload = await response.json();
    if (payload.code !== 0) throw new Error(payload.message || '导入失败');
    return payload.data;
  },
  createSchool: (body) => request('/api/admin/schools', { method: 'POST', body }),
  updateSchool: (id, body) => request(`/api/admin/schools/${id}`, { method: 'PUT', body }),
  deleteSchool: (id) => request(`/api/admin/schools/${id}`, { method: 'DELETE' }),
  createCategory: (body) => request('/api/admin/categories', { method: 'POST', body }),
  updateCategory: (id, body) => request(`/api/admin/categories/${id}`, { method: 'PUT', body }),
  deleteCategory: (id) => request(`/api/admin/categories/${id}`, { method: 'DELETE' }),
  deleteCategories: (ids) => request('/api/admin/categories/batch-delete', { method: 'POST', body: { ids } }),
  orders: (params) => request(withQuery('/api/admin/orders', params)),
  comments: (params) => request(withQuery('/api/admin/comments', params)),
  semesters: () => request('/api/admin/semesters'),
  semesterRecords: () => request('/api/admin/semesters/records'),
  createSemester: (body) => request('/api/admin/semesters', { method: 'POST', body }),
  updateSemester: (id, body) => request(`/api/admin/semesters/${id}`, { method: 'PUT', body }),
  deleteSemester: (id) => request(`/api/admin/semesters/${id}`, { method: 'DELETE' }),
  generateSemester: (id, courseIds, slots, count) => request(`/api/admin/semesters/${id}/generate`, { method: 'POST', body: { courseIds, slots, count } }),
  updateSession: (id, body) => request(`/api/admin/sessions/${id}`, { method: 'PUT', body }),
  deleteSession: (id) => request(`/api/admin/sessions/${id}`, { method: 'DELETE' }),
  coursePlan: (id) => request(`/api/admin/courses/${id}/plan`),
  generateCourse: (id, body) => request(`/api/admin/courses/${id}/generate`, { method: 'POST', body }),
  continueCourse: (id, body) => request(`/api/admin/courses/${id}/continue`, { method: 'POST', body }),
  createCourseSession: (id, body) => request(`/api/admin/courses/${id}/sessions`, { method: 'POST', body }),
  updateCourseSession: (courseId, id, body) => request(`/api/admin/courses/${courseId}/sessions/${id}`, { method: 'PUT', body }),
  deleteCourseSession: (courseId, id) => request(`/api/admin/courses/${courseId}/sessions/${id}`, { method: 'DELETE' }),
  holidays: (semesterId) => request(withQuery('/api/admin/holidays', { semesterId })),
  createHoliday: (body) => request('/api/admin/holidays', { method: 'POST', body }),
  deleteHoliday: (id) => request(`/api/admin/holidays/${id}`, { method: 'DELETE' }),
  sessions: (params) => request(withQuery('/api/admin/sessions', params)),
};
