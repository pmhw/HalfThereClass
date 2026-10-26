import { reactive } from 'vue';
import { withAdminBase } from './adminBase';
import { clearFinanceToken, getFinanceToken, renewFinanceToken, requireFinancePin } from './financePin';

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
  if (!token || !/\/uploads\/(certs|signs|reimbursements)\//.test(path)) return path;
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
  if (getProfile()?.id !== admin?.id) clearFinanceToken();
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(admin));
}

/** 会话检查返回的最新资料（权限被调整后无需重新登录） */
export function updateProfile(admin) {
  if (admin) localStorage.setItem(PROFILE_KEY, JSON.stringify(admin));
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  clearFinanceToken();
}

function authHeaders() {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const financeToken = getFinanceToken();
  if (financeToken) headers['X-Finance-Token'] = financeToken;
  return headers;
}

function keepFinanceToken(response) {
  const renewed = response.headers.get('X-Finance-Token');
  if (renewed) renewFinanceToken(renewed, response.headers.get('X-Finance-Expires'));
}

const FINANCE_REASONS = ['finance_pin', 'finance_pin_unset'];

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
  const canRetry = method === 'GET' && !options.noRetry;
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...(options.headers || {}),
  };

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
    if (attempt < 2 && isNetworkError(err) && canRetry) {
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
  keepFinanceToken(response);

  // 网关偶发 502/503/504：GET 自动重试
  if ([502, 503, 504].includes(response.status) && attempt < 2 && canRetry) {
    await sleep(400 * (attempt + 1));
    return rawFetch(url, options, attempt + 1);
  }

  let payload;
  const raw = await response.text();
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    if (attempt < 2 && canRetry && !response.ok) {
      await sleep(400 * (attempt + 1));
      return rawFetch(url, options, attempt + 1);
    }
    throw new Error(response.ok ? '响应格式错误' : `请求失败（HTTP ${response.status}）`);
  }

  if (payload.code !== 0) {
    if (payload.code === 401) {
      clearToken();
      accountLock.message = '';
      if (!location.pathname.endsWith('/login')) location.href = withAdminBase('/login');
    }
    const message = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    const text = message || '请求失败';
    if (getToken() && /账号已冻结|账号已停用/.test(text)) accountLock.message = text;
    if (FINANCE_REASONS.includes(payload.reason)) {
      clearFinanceToken();
      if (!options.noFinancePrompt && !options.pinRetried) {
        if (await requireFinancePin({ unset: payload.reason === 'finance_pin_unset' })) return rawFetch(url, { ...options, pinRetried: true });
      }
      const err = new Error(text);
      err.financeLocked = true;
      throw err;
    }
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
  financePinStatus: () => request('/api/admin/finance-pin', { noDedupe: true }),
  setFinancePin: (body) => request('/api/admin/finance-pin', { method: 'PUT', body }),
  verifyFinancePin: (body) => request('/api/admin/finance-pin/verify', { method: 'POST', body }),
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
  mergeCandidates: (id) => request(`/api/admin/people/${id}/merge-candidates`),
  mergePreview: (id, other) => request(withQuery(`/api/admin/people/${id}/merge-preview`, { with: other })),
  mergePeople: (body) => request('/api/admin/people/merge', { method: 'POST', body }),
  deletePerson: (id) => request(`/api/admin/people/${id}`, { method: 'DELETE' }),
  faculty: () => request('/api/admin/faculty'),
  facultyDetail: (id) => request(`/api/admin/faculty/${id}`),
  setFacultyOrg: (id, organizationId) => request(`/api/admin/faculty/${id}/org`, { method: 'PUT', body: { organizationId } }),
  setFacultyParent: (id, parentId) => request(`/api/admin/faculty/${id}/parent`, { method: 'PUT', body: { parentId } }),
  freezeFaculty: (id, frozen) => request(`/api/admin/faculty/${id}/freeze`, { method: 'PUT', body: { frozen } }),
  saveGrant: (id, body) => request(`/api/admin/faculty/${id}/grants`, { method: 'POST', body }),
  listGrants: () => request('/api/admin/grants'),
  revokeGrant: (id, courseId, from) => request(`/api/admin/faculty/${id}/grants/${courseId}${from ? `?from=${encodeURIComponent(from)}` : ''}`, { method: 'DELETE' }),
  certs: () => request('/api/admin/certs'),
  certsPendingCount: () => request('/api/admin/certs/pending-count'),
  contracts: (params) => request(withQuery('/api/admin/contracts', params)),
  ocrReviews: () => request('/api/admin/ocr-reviews'),
  confirmOcrReview: (userId, body) => request(`/api/admin/ocr-reviews/${userId}/confirm`, { method: 'POST', body }),
  reviewContract: (id, body) => request(`/api/admin/contracts/${id}/review`, { method: 'POST', body }),
  revokeContract: (id, body) => request(`/api/admin/contracts/${id}/revoke`, { method: 'POST', body: body || {} }),
  revokeFacultyContract: (id, body) => request(`/api/admin/faculty/${id}/revoke-contract`, { method: 'POST', body: body || {} }),
  resetFacultyBank: (id, body) => request(`/api/admin/faculty/${id}/reset-bank`, { method: 'POST', body: body || {} }),
  reviewCert: (userId, body) => request(`/api/admin/certs/${userId}/review`, { method: 'POST', body }),
  dashboardPendingCount: () => request('/api/admin/dashboard/pending-count'),
  orgs: () => request('/api/admin/orgs'),
  org: (id) => request(`/api/admin/orgs/${id}`),
  createOrg: (body) => request('/api/admin/orgs', { method: 'POST', body }),
  updateOrg: (id, body) => request(`/api/admin/orgs/${id}`, { method: 'PUT', body }),
  bindOrgTeachers: (id, body) => request(`/api/admin/orgs/${id}/teachers`, { method: 'POST', body }),
  assignOrgCourse: (id, body) => request(`/api/admin/orgs/${id}/courses`, { method: 'POST', body }),
  unassignOrgCourse: (id, courseId) => request(`/api/admin/orgs/${id}/courses/${courseId}`, { method: 'DELETE' }),
  feePreview: (params) => request(withQuery('/api/admin/fees/preview', params)),
  incomes: () => request('/api/admin/incomes'),
  reimbursements: (params) => request(withQuery('/api/admin/reimbursements', params)),
  reimbursementsPendingCount: () => request('/api/admin/reimbursements/pending-count'),
  reviewReimbursement: (id, body) => request(`/api/admin/reimbursements/${id}/review`, { method: 'POST', body }),
  reimbursementCollections: () => request('/api/admin/reimbursements/collections'),
  updateReimbursementDeduction: (id, body) => request(`/api/admin/reimbursements/${id}/deduction`, { method: 'PUT', body }),
  markReimbursementPaid: (id) => request(`/api/admin/reimbursements/${id}/pay`, { method: 'POST' }),
  reimbursementTeachers: () => request('/api/admin/reimbursements/teachers'),
  createReimbursement: (body) => request('/api/admin/reimbursements', { method: 'POST', body }),
  async uploadReimbursementReceipt(file) {
    if (!(await requireFinancePin())) throw new Error('请输入财务密码');
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/admin/reimbursements/receipt', {
      method: 'POST',
      headers: authHeaders(),
      body,
    });
    keepFinanceToken(response);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`上传失败（HTTP ${response.status}）`);
    }
    if (payload.code !== 0) throw new Error(payload.message || '上传失败');
    return payload.data;
  },
  financeOverview: (params, options) => request(withQuery('/api/admin/finance/overview', params), options),
  financeMonthly: (params) => request(withQuery('/api/admin/finance/monthly', params)),
  financeMonthCourses: (month, params) => request(withQuery(`/api/admin/finance/months/${month}/courses`, params)),
  financeTeachers: (params) => request(withQuery('/api/admin/finance/teachers', params)),
  financeTeacher: (id, params) => request(withQuery(`/api/admin/finance/teachers/${id}`, params)),
  financeOrgs: (params) => request(withQuery('/api/admin/finance/orgs', params)),
  financeOrg: (id, params) => request(withQuery(`/api/admin/finance/orgs/${id}`, params)),
  financeOrgProfit: (params) => request(withQuery('/api/admin/finance/org-profit', params)),
  financeStatement: (month) => request(withQuery('/api/admin/finance/statement', { month })),
  financeLockMonth: (month) => request(`/api/admin/finance/statement/${month}/lock`, { method: 'POST' }),
  financeUnlockMonth: (month) => request(`/api/admin/finance/statement/${month}/unlock`, { method: 'POST' }),
  financeSplit: (month) => request(withQuery('/api/admin/finance/split', { month })),
  financeSaveSplitConfig: (body) => request('/api/admin/finance/split/config', { method: 'PUT', body }),
  financeCreateSplit: (body) => request('/api/admin/finance/split/collections', { method: 'POST', body }),
  financeUpdateSplit: (id, body) => request(`/api/admin/finance/split/collections/${id}`, { method: 'PUT', body }),
  financeDeleteSplit: (id) => request(`/api/admin/finance/split/collections/${id}`, { method: 'DELETE' }),
  financePayouts: (month) => request(withQuery('/api/admin/finance/payouts', { month })),
  financeSplitSheet: (month) => request(withQuery('/api/admin/finance/split/sheet', { month })),
  financeMarkPayouts: (month, body) => request(`/api/admin/finance/payouts/${month}/mark`, { method: 'POST', body }),
  setupCheck: () => request('/api/admin/setup/check'),
  setupIgnore: (id, ignored) => request(`/api/admin/setup/ignore/${encodeURIComponent(id)}`, { method: 'PUT', body: { ignored } }),
  financeRules: () => request('/api/admin/finance/rules'),
  financeSaveRule: (courseId, body) => request(`/api/admin/finance/rules/${courseId}`, { method: 'PUT', body }),
  financeSyncCourses: () => request('/api/admin/finance/sync-courses'),
  financeSync: (body) => request('/api/admin/finance/sync', { method: 'POST', body: body || {} }),
  financeSettle: (month, body) => request(`/api/admin/finance/settle/${month}`, { method: 'POST', body: body || {} }),
  financeReopen: (month) => request(`/api/admin/finance/reopen/${month}`, { method: 'POST' }),
  financeMarkPaid: (id, body) => request(`/api/admin/finance/orders/${id}/paid`, { method: 'POST', body: body || {} }),
  financeRefund: (id, body) => request(`/api/admin/finance/orders/${id}/refund`, { method: 'POST', body: body || {} }),
  dashboard: () => request('/api/admin/dashboard'),
  schoolMap: (semesterId) => request(withQuery('/api/admin/dashboard/school-map', { semesterId })),
  saveSchoolMapMeta: (id, body) => request(`/api/admin/dashboard/school-map/${id}`, { method: 'PUT', body }),
  schoolValue: (options) => request('/api/admin/finance/school-value', options),
  search: (keyword) => request(withQuery('/api/admin/search', { keyword })),
  users: (params) => request(withQuery('/api/admin/users', params)),
  courses: (params) => request(withQuery('/api/admin/courses', params)),
  course: (id) => request(`/api/admin/courses/${id}`),
  teachers: () => request('/api/admin/teachers'),
  createCourse: (body) => request('/api/admin/courses', { method: 'POST', body }),
  updateCourse: (id, body) => request(`/api/admin/courses/${id}`, { method: 'PUT', body }),
  setCourseTeacher: (id, body) => request(`/api/admin/courses/${id}/teacher`, { method: 'PUT', body }),
  courseTeacherChange: (id, from) => request(`/api/admin/courses/${id}/teacher-change?from=${encodeURIComponent(from)}`),
  deleteCourse: (id) => request(`/api/admin/courses/${id}`, { method: 'DELETE' }),
  deleteCourses: (ids) => request('/api/admin/courses/batch-delete', { method: 'POST', body: { ids } }),
  patchCourses: (body) => request('/api/admin/courses/batch-update', { method: 'POST', body }),
  generateCourses: (body) => request('/api/admin/courses/batch-generate', { method: 'POST', body }),
  copyCourses: (ids) => request('/api/admin/courses/batch-copy', { method: 'POST', body: { ids } }),
  categories: () => request('/api/admin/categories'),
  schools: () => request('/api/admin/schools'),
  amapConfig: () => request('/api/admin/schools/amap-config'),
  settingsAmap: () => request('/api/admin/settings/amap'),
  saveSettingsAmap: (body) => request('/api/admin/settings/amap', { method: 'POST', body }),
  settingsWx: () => request('/api/admin/settings/wx'),
  saveSettingsWx: (body) => request('/api/admin/settings/wx', { method: 'POST', body }),
  settingsSms: () => request('/api/admin/settings/sms'),
  smsBalance: (force = false) => request(`/api/admin/settings/sms/balance${force ? '?force=1' : ''}`),
  saveSettingsSms: (body) => request('/api/admin/settings/sms', { method: 'POST', body }),
  settingsAgreement: () => request('/api/admin/settings/agreement'),
  saveSettingsAgreement: (body) => request('/api/admin/settings/agreement', { method: 'POST', body }),
  settingsContract: () => request('/api/admin/settings/contract'),
  saveSettingsContract: (body) => request('/api/admin/settings/contract', { method: 'POST', body }),
  settingsPartyA: () => request('/api/admin/settings/party-a'),
  saveSettingsPartyA: (body) => request('/api/admin/settings/party-a', { method: 'POST', body }),
  systemVersion: (opts = {}) => request(`/api/admin/system/version${opts.fresh ? `?t=${Date.now()}` : ''}`, opts.fresh ? { noDedupe: true, noRetry: true, timeoutMs: 6000 } : {}),
  systemUpdates: (params) => request(withQuery('/api/admin/system/updates', params || {})),
  updateProgress: () => request('/api/admin/system/update-progress', { noDedupe: true, noRetry: true, timeoutMs: 6000 }),
  applyUpdate: (tag) => request('/api/admin/system/apply-update', { method: 'POST', body: { ...(tag ? { tag } : {}), background: true }, timeoutMs: 30_000 }),
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
  async exportTimetable(month, courseIds) {
    const token = getToken();
    const query = new URLSearchParams({ month });
    if (courseIds) query.set('courseIds', courseIds);
    const response = await fetch(`/api/admin/sessions/export?${query.toString()}`, {
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
    const match = /filename\*=UTF-8''([^;]+)/i.exec(response.headers.get('content-disposition') || '');
    const name = match?.[1] ? decodeURIComponent(match[1]) : `课表-${month}.xlsx`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { name };
  },
  bankTxns: () => request('/api/admin/finance/bank-txns'),
  allocateBankTxn: (id, body) => request(`/api/admin/finance/bank-txns/${id}/allocs`, { method: 'POST', body }),
  lockBankAlloc: (id, locked) => request(`/api/admin/finance/bank-txns/allocs/${id}/lock`, { method: 'PUT', body: { locked } }),
  removeBankAlloc: (id) => request(`/api/admin/finance/bank-txns/allocs/${id}`, { method: 'DELETE' }),
  async importBankTxns(file) {
    if (!(await requireFinancePin())) throw new Error('请输入财务密码');
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/admin/finance/bank-txns/import', {
      method: 'POST',
      headers: authHeaders(),
      body,
    });
    keepFinanceToken(response);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`导入失败（HTTP ${response.status}）`);
    }
    if (payload.code !== 0) {
      if (FINANCE_REASONS.includes(payload.reason)) {
        clearFinanceToken();
        if (await requireFinancePin({ unset: payload.reason === 'finance_pin_unset' })) return this.importBankTxns(file);
      }
      throw new Error(payload.message || '导入失败');
    }
    return payload.data;
  },
};
