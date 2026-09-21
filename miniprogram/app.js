// app.js
const store = require('./store/index.js');
const freeze = require('./utils/freeze.js');

const originPage = Page;
Page = function pageWithFreeze(config) {
  ['onLoad', 'onShow'].forEach((name) => {
    const origin = config[name];
    config[name] = function guarded(options) {
      const route = this.route || '';
      if (route === 'pages/frozen/frozen' || route === 'pages/login/login') {
        if (origin) origin.call(this, options);
        return;
      }
      const page = this;
      freeze.check().then((locked) => {
        if (locked || page.route !== route) return;
        if (origin) origin.call(page, options);
      });
    };
  });
  return originPage(config);
};

App({
  onLaunch() {
    this.bindPrivacy();
    // 初始化全局状态
    this.globalData = {
      userInfo: null,
      token: wx.getStorageSync('token') || '',
      ...store.state,
    };

    // 检查登录状态
    this.checkLogin();
  },

  // 隐私接口被调用时只弹一次。同意后把结果交回微信，由微信继续头像/相机/文件。
  bindPrivacy() {
    if (!wx.onNeedPrivacyAuthorization || this._privacyBound) return;
    this._privacyBound = true;
    wx.onNeedPrivacyAuthorization((resolve) => {
      const now = Date.now();
      if (this._privacyAgreedAt && now - this._privacyAgreedAt < 4000) {
        resolve({ event: 'disagree' });
        const privacy = require('./utils/privacy.js');
        privacy.explainUndeclared();
        return;
      }
      if (this._privacyBusy) {
        resolve({ event: 'disagree' });
        return;
      }
      this._privacyBusy = true;
      const finish = (payload) => {
        this._privacyBusy = false;
        if (payload && payload.event === 'agree') this._privacyAgreedAt = Date.now();
        resolve(payload);
      };
      if (typeof this.privacyHandler === 'function') this.privacyHandler(finish);
      else {
        this._privacyBusy = false;
        resolve({ event: 'disagree' });
      }
    });
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
    this.globalData.frozenMessage = '';
    freeze.clear();
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
