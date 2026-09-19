const userService = require('../../services/user.js');
const { get } = require('../../utils/request.js');
const config = require('../../config/index.js');
const util = require('../../utils/util.js');

Page({
  data: {
    isLogin: false,
    userInfo: null,
    cert: null,
    avatarText: '师',
    summary: { total: 0, month: 0, ratingText: '—' },
    padTop: 48,
    titleH: 32,
    side: 96,
  },

  onLoad() {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    this.setData({
      padTop: menu.top || sys.statusBarHeight || 24,
      titleH: menu.height || 32,
      side: Math.max(24, (sys.windowWidth || 375) - menu.left + 12),
    });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setSelected(3);
    const isLogin = util.checkLogin();
    const userInfo = wx.getStorageSync('userInfo') || null;
    if (userInfo && userInfo.avatar && !/^https?:/.test(userInfo.avatar)) {
      userInfo.avatar = `${config.origin}${userInfo.avatar}`;
    }
    const name = (userInfo && userInfo.nickname) || '师';
    this.setData({ isLogin, userInfo, avatarText: name.slice(0, 1) });
    if (isLogin) this.load();
  },

  async load() {
    try {
      const [cert, summary] = await Promise.all([
        userService.getCert(),
        get('/teacher/summary').catch(() => ({ total: 0, month: 0, rating: null })),
      ]);
      this.setData({
        cert,
        summary: {
          total: summary.total || 0,
          month: summary.month || 0,
          ratingText: summary.rating == null ? '—' : String(summary.rating),
        },
      });
    } catch (err) {
      console.error(err);
    }
  },

  goCert() {
    if (!util.requireLogin()) return;
    wx.navigateTo({ url: '/pages/certify/certify' });
  },
  goContract() {
    if (!util.requireLogin()) return;
    wx.navigateTo({ url: '/pages/contract/contract' });
  },
  goSchedule() { wx.switchTab({ url: '/pages/schedule/schedule' }); },
  goTeaching() { wx.switchTab({ url: '/pages/teaching/teaching' }); },
  goIncome() {
    if (!util.requireLogin()) return;
    wx.navigateTo({ url: '/pages/income/income' });
  },
  goAdjust() {
    if (!util.requireLogin()) return;
    wx.navigateTo({ url: '/pages/adjust/adjust' });
  },
  goCourses() { wx.navigateTo({ url: '/pages/course-list/course-list' }); },

  logout() {
    const app = getApp();
    app.logout();
    this.setData({ isLogin: false, userInfo: null, cert: null });
  },
});
