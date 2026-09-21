const freeze = require('../../utils/freeze.js');
const userService = require('../../services/user.js');

Page({
  data: {
    message: '账号已冻结，暂时无法使用',
  },

  onShow() {
    const app = getApp();
    const message = (app && app.globalData && app.globalData.frozenMessage) || this.data.message;
    this.setData({ message });
    this.refresh();
  },

  async refresh() {
    if (!wx.getStorageSync('token')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    try {
      const user = await userService.getUserProfile();
      if (!user || Number(user.status) !== 0) {
        freeze.clear();
        wx.switchTab({ url: '/pages/index/index' });
      }
    } catch (err) {
      const message = err && err.message ? err.message : '';
      if (freeze.isFrozenMessage(message)) this.setData({ message });
    }
  },

  logout() {
    const app = getApp();
    freeze.clear();
    if (app && app.logout) app.logout();
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
