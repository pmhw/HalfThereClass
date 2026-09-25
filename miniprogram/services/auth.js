const { get, post } = require('../utils/request.js');
const config = require('../config/index.js');

const wxLogin = (code) => post('/auth/wx-login', { code });

const getAgreement = () => get('/auth/agreement');

const getSmsStatus = () => get('/auth/sms/status');

const sendSmsCode = (phone) => post('/auth/sms/send', { phone });

const bindPhone = (phone, code) => post('/auth/bind-phone', { phone, code });

const assetUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${config.origin}${path}`;
};

const courseShareUrl = (courseId) => `${config.origin}/m/course/${courseId}`;

const uploadAvatar = (filePath) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    wx.uploadFile({
      url: `${config.baseUrl}/user/avatar`,
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (res) => {
        let body = {};
        try {
          body = JSON.parse(res.data || '{}');
        } catch (err) {
          reject(new Error('头像上传失败'));
          return;
        }
        if (body.code === 0) resolve(body.data);
        else reject(new Error(body.message || '头像上传失败'));
      },
      fail: () => reject(new Error('头像上传失败')),
    });
  });
};

module.exports = {
  wxLogin,
  getAgreement,
  getSmsStatus,
  sendSmsCode,
  bindPhone,
  uploadAvatar,
  assetUrl,
  courseShareUrl,
};
