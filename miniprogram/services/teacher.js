const { get, post, delete: del } = require('../utils/request.js');
const config = require('../config/index.js');

const getReimbursements = () => get('/teacher/reimbursements');
const createReimbursement = (data) => post('/teacher/reimbursements', data);
const cancelReimbursement = (id) => del(`/teacher/reimbursements/${id}`);

const uploadReimbursementReceipt = (filePath) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    wx.uploadFile({
      url: `${config.baseUrl}/teacher/reimbursements/receipt`,
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (res) => {
        let body = {};
        try { body = JSON.parse(res.data || '{}'); } catch (err) {
          reject(new Error(res.statusCode === 413 ? '文件过大' : '上传失败'));
          return;
        }
        const message = Array.isArray(body.message) ? body.message.join('，') : (body.message || '上传失败');
        if (res.statusCode >= 400 || body.code !== 0 || !body.data || !body.data.url) {
          reject(new Error(message));
          return;
        }
        resolve(body.data);
      },
      fail: () => reject(new Error('上传失败')),
    });
  });
};

module.exports = {
  getReimbursements,
  createReimbursement,
  cancelReimbursement,
  uploadReimbursementReceipt,
};
