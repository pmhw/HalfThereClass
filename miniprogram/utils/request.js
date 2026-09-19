// utils/request.js - 网络请求封装

const config = require('../config/index.js');

function cleanData(data) {
  if (!data || typeof data !== 'object') return {};
  const result = {};
  Object.keys(data).forEach((key) => {
    const value = data[key];
    if (value === undefined || value === null || value === '') return;
    result[key] = value;
  });
  return result;
}

const request = (options) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');

    wx.request({
      url: config.baseUrl + options.url,
      method: options.method || 'GET',
      data: cleanData(options.data),
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        ...options.header,
      },
      success: (res) => {
        const { code, message, data } = res.data;

        if (code === 0) {
          resolve(data);
        } else if (code === 401) {
          // 未授权，清除登录状态
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.showToast({
            title: '请先登录',
            icon: 'none',
          });
          reject(new Error('未授权'));
        } else {
          wx.showToast({
            title: message || '请求失败',
            icon: 'none',
          });
          reject(new Error(message));
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '网络异常，请检查网络',
          icon: 'none',
        });
        reject(err);
      },
    });
  });
};

module.exports = {
  get: (url, data) => request({ url, method: 'GET', data }),
  post: (url, data) => request({ url, method: 'POST', data }),
  put: (url, data) => request({ url, method: 'PUT', data }),
  delete: (url, data) => request({ url, method: 'DELETE', data }),
};
