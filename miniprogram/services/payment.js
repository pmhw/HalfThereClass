// services/payment.js - 支付相关 API

const { post } = require('../utils/request.js');

// 发起微信支付
const createWxPayment = (orderId) => {
  return post(`/payment/wx/${orderId}`);
};

// 调起微信支付
const requestPayment = (payParams) => {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType || 'RSA',
      paySign: payParams.paySign,
      success: resolve,
      fail: reject,
    });
  });
};

module.exports = {
  createWxPayment,
  requestPayment,
};
