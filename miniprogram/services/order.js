// services/order.js - 订单相关 API

const { get, post } = require('../utils/request.js');

// 创建订单
const createOrder = (courseId) => {
  return post('/orders', { courseId });
};

// 获取订单列表
const getOrderList = (params = {}) => {
  return get('/orders', params);
};

// 获取订单详情
const getOrderDetail = (id) => {
  return get(`/orders/${id}`);
};

module.exports = {
  createOrder,
  getOrderList,
  getOrderDetail,
};
