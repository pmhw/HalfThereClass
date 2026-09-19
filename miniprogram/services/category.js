// services/category.js - 分类相关 API

const { get } = require('../utils/request.js');

// 获取分类列表
const getCategoryList = () => {
  return get('/categories');
};

module.exports = {
  getCategoryList,
};
