// services/user.js - 用户相关 API

const { get, put, post } = require('../utils/request.js');
const config = require('../config/index.js');

// 获取用户信息
const getUserProfile = () => {
  return get('/user/profile');
};

// 更新用户信息
const updateUserProfile = (data) => {
  return put('/user/profile', data);
};

// 获取用户学习统计
const getUserStats = () => {
  return get('/user/stats');
};

const uploadCertFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    wx.uploadFile({
      url: `${config.baseUrl}/user/cert-file`,
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (res) => {
        let body = {};
        try { body = JSON.parse(res.data || '{}'); } catch (err) {
          reject(new Error('上传失败'));
          return;
        }
        if (body.code === 0) resolve(body.data);
        else reject(new Error(body.message || '上传失败'));
      },
      fail: () => reject(new Error('上传失败')),
    });
  });
};

const getCert = () => get('/user/cert');
const submitCert = (data) => post('/user/cert', data);
const getContract = () => get('/user/contract');
const signContract = (filePath) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    wx.uploadFile({
      url: `${config.baseUrl}/user/contract`,
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (res) => {
        let body = {};
        try { body = JSON.parse(res.data || '{}'); } catch (err) {
          reject(new Error('签订失败'));
          return;
        }
        if (body.code === 0) resolve(body.data);
        else reject(new Error(body.message || '签订失败'));
      },
      fail: () => reject(new Error('签订失败')),
    });
  });
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  getUserStats,
  getCert,
  submitCert,
  uploadCertFile,
  getContract,
  signContract,
};
