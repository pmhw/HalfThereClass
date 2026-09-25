import { get, post, put, upload } from './request';

export const getAgreement = () => get('/auth/agreement');
export const getSmsStatus = () => get('/auth/sms/status');
export const sendSmsCode = (phone) => post('/auth/sms/send', { phone });
export const smsLogin = (data) =>
  post('/auth/sms/login', {
    phone: data.phone,
    code: data.code,
    nickname: data.nickname,
    avatar: data.avatar,
  });

export const getProfile = () => get('/user/profile');
export const updateProfile = (data) => put('/user/profile', data);
export const uploadAvatar = (file) => upload('/user/avatar', file);
export const getCert = () => get('/user/cert');
export const submitCert = (data) => post('/user/cert', data);
export const uploadCertFile = (file) => upload('/user/cert-file', file);
export const getContract = () => get('/user/contract');
export const signContract = (file) => upload('/user/contract', file);
export const exportContract = (id) => get('/user/contract/export', id ? { id } : {});
export const listMyContracts = () => get('/user/contracts');


export const getCourseList = (params) => get('/courses', params);
export const getCourseDetail = (id) => get(`/courses/${id}`);
export const getRecommendCourses = (limit = 12) => get('/courses/recommend', { limit });
export const grabCourse = (id) => post(`/courses/${id}/grab`);
export const getToday = () => get('/courses/today');
export const getSchedule = () => get('/courses/schedule');
export const getCalendar = (month) => get('/schedule/calendar', { month });
export const getTeachingSchedule = () => get('/schedule/teaching');
export const adjustSchedule = (data) => post('/schedule/adjust', data);
export const getCheckIn = (id) => get(`/courses/${id}/checkin`);
export const checkIn = (id) => post(`/courses/${id}/checkin`);
export const getCategories = () => get('/categories');

export const getTeacherCourses = () => get('/teacher/courses');
export const getTeacherSummary = () => get('/teacher/summary');
export const getTeacherIncomes = () => get('/teacher/incomes');

export const getOrders = (params) => get('/orders', params);
export const postComment = (data) => post('/comments', data);
export const getLesson = (id) => get(`/lessons/${id}`);
export const postLessonProgress = (id, data) => post(`/lessons/${id}/progress`, data);
