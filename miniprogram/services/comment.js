// services/comment.js - 评论相关 API

const { get, post } = require('../utils/request.js');

// 获取课程评论列表
const getCommentList = (courseId, params = {}) => {
  return get(`/comments/course/${courseId}`, params);
};

// 发表评论
const createComment = (data) => {
  return post('/comments', data);
};

module.exports = {
  getCommentList,
  createComment,
};
