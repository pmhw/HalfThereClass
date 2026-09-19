// services/lesson.js - 课时相关 API

const { get, post } = require('../utils/request.js');

// 获取课时详情
const getLessonDetail = (id) => {
  return get(`/lessons/${id}`);
};

// 更新学习进度
const updateProgress = (id, progress) => {
  return post(`/lessons/${id}/progress`, { progress });
};

module.exports = {
  getLessonDetail,
  updateProgress,
};
