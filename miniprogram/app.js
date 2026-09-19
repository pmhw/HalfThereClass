// app.js
const store = require('./store/index.js');

App({
  onLaunch() {
    // 初始化全局状态
    this.globalData = {
      userInfo: null,
      token: wx.getStorageSync('token') || '',
      ...store.state,
    };

    // 检查登录状态
    this.checkLogin();
  },

  // 检查登录状态
  checkLogin() {
    const token = wx.getStorageSync('token');
    if (token) {
      this.globalData.token = token;
      // 可以在这里验证 token 有效性
    }
  },

  // 登录必须走登录页，先勾选协议再授权头像和昵称
  login() {
    wx.navigateTo({ url: '/pages/login/login' });
    return Promise.reject(new Error('请先登录'));
  },

  // 退出登录
  logout() {
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
    this.globalData.token = '';
    this.globalData.userInfo = null;
  },

  // 获取用户信息（保证已登录）
  ensureLogin() {
    return new Promise((resolve) => {
      if (this.globalData.token) {
        resolve(this.globalData.userInfo);
      } else {
        wx.navigateTo({ url: '/pages/login/login' });
      }
    });
  },

  globalData: {
    userInfo: null,
    token: '',
  },
});
