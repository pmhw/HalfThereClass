// services/upload.js - 上传相关 API

const { get } = require('../utils/request.js');

// 获取上传凭证
const getUploadToken = (prefix) => {
  return get('/upload/token', { prefix });
};

// 上传图片到七牛云
const uploadImage = (filePath, prefix = 'images') => {
  return new Promise((resolve, reject) => {
    getUploadToken(prefix).then((res) => {
      const { token, domain } = res;
      const key = `${prefix}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      wx.uploadFile({
        url: 'https://upload.qiniup.com',
        filePath,
        name: 'file',
        formData: {
          token,
          key,
        },
        success: (uploadRes) => {
          const data = JSON.parse(uploadRes.data);
          resolve({
            url: `${domain}/${data.key}`,
            key: data.key,
          });
        },
        fail: reject,
      });
    }).catch(reject);
  });
};

module.exports = {
  getUploadToken,
  uploadImage,
};
