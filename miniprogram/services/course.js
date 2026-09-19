// services/course.js - 课程相关 API

const { get, post } = require('../utils/request.js');

// 获取课程列表
const getCourseList = (params = {}) => {
  return get('/courses', params);
};

// 获取课程详情
const getCourseDetail = (id) => {
  return get(`/courses/${id}`);
};

// 获取推荐课程
const getRecommendCourses = (limit = 6) => {
  return get('/courses/recommend', { limit });
};

// 获取热门课程
const getHotCourses = (limit = 10) => {
  return get('/courses/hot', { limit });
};

// 获取我的课程
const getMyCourses = (params = {}) => {
  return get('/courses/mine', params);
};

const grabCourse = (id) => post(`/courses/${id}/grab`);
const getToday = () => get('/courses/today');
const getSchedule = () => get('/courses/schedule');
const getCalendar = (month) => get('/schedule/calendar', { month });
const getTeaching = () => get('/schedule/teaching');
const adjustSchedule = (data) => post('/schedule/adjust', data);
const getCheckIn = (id) => get(`/courses/${id}/checkin`);
const checkIn = (id) => post(`/courses/${id}/checkin`);

module.exports = {
  getCourseList,
  getCourseDetail,
  getRecommendCourses,
  getHotCourses,
  getMyCourses,
  grabCourse,
  getToday,
  getSchedule,
  getCalendar,
  getTeaching,
  adjustSchedule,
  getCheckIn,
  checkIn,
};
