const TOKEN_KEY = 'admin_token';
const PROFILE_KEY = 'admin_profile';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
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

export async function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (payload.code !== 0) {
    if (payload.code === 401) {
      clearToken();
      if (!location.pathname.endsWith('/login')) location.href = '/login';
    }
    const message = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    throw new Error(message || '请求失败');
  }
  return payload.data;
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
  captcha: () => request('/api/admin/captcha'),
  checkCaptcha: (body) => request('/api/admin/captcha/check', { method: 'POST', body }),
  admins: (params) => request(withQuery('/api/admin/admins', params)),
  adminPermissions: () => request('/api/admin/admins/permissions'),
  createAdmin: (body) => request('/api/admin/admins', { method: 'POST', body }),
  updateAdmin: (id, body) => request(`/api/admin/admins/${id}`, { method: 'PUT', body }),
  deleteAdmin: (id) => request(`/api/admin/admins/${id}`, { method: 'DELETE' }),
  people: (params) => request(withQuery('/api/admin/people', params)),
  faculty: () => request('/api/admin/faculty'),
  facultyDetail: (id) => request(`/api/admin/faculty/${id}`),
  setFacultyOrg: (id, organizationId) => request(`/api/admin/faculty/${id}/org`, { method: 'PUT', body: { organizationId } }),
  setFacultyParent: (id, parentId) => request(`/api/admin/faculty/${id}/parent`, { method: 'PUT', body: { parentId } }),
  freezeFaculty: (id, frozen) => request(`/api/admin/faculty/${id}/freeze`, { method: 'PUT', body: { frozen } }),
  saveGrant: (id, body) => request(`/api/admin/faculty/${id}/grants`, { method: 'POST', body }),
  certs: () => request('/api/admin/certs'),
  reviewCert: (userId, body) => request(`/api/admin/certs/${userId}/review`, { method: 'POST', body }),
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
  saveSettingsAmap: (body) => request('/api/admin/settings/amap', { method: 'PUT', body }),
  settingsAgreement: () => request('/api/admin/settings/agreement'),
  saveSettingsAgreement: (body) => request('/api/admin/settings/agreement', { method: 'PUT', body }),
  settingsContract: () => request('/api/admin/settings/contract'),
  saveSettingsContract: (body) => request('/api/admin/settings/contract', { method: 'PUT', body }),
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
  createCourseSession: (id, body) => request(`/api/admin/courses/${id}/sessions`, { method: 'POST', body }),
  updateCourseSession: (courseId, id, body) => request(`/api/admin/courses/${courseId}/sessions/${id}`, { method: 'PUT', body }),
  deleteCourseSession: (courseId, id) => request(`/api/admin/courses/${courseId}/sessions/${id}`, { method: 'DELETE' }),
  holidays: (semesterId) => request(withQuery('/api/admin/holidays', { semesterId })),
  createHoliday: (body) => request('/api/admin/holidays', { method: 'POST', body }),
  deleteHoliday: (id) => request(`/api/admin/holidays/${id}`, { method: 'DELETE' }),
  sessions: (params) => request(withQuery('/api/admin/sessions', params)),
};
