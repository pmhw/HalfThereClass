const userService = require('../../services/user.js');
const authService = require('../../services/auth.js');
const store = require('../../store/index.js');
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
    showBind: false,
    bindPhone: '',
    bindCode: '',
    sending: false,
    binding: false,
    cooldown: 0,
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

  onUnload() {
    this.clearCooldownTimer();
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
      const [cert, summary, profile] = await Promise.all([
        userService.getCert(),
        get('/teacher/summary').catch(() => ({ total: 0, month: 0, rating: null })),
        get('/user/profile').catch(() => null),
      ]);
      if (profile) {
        const next = {
          ...(wx.getStorageSync('userInfo') || {}),
          ...profile,
          avatar: authService.assetUrl(profile.avatar || (wx.getStorageSync('userInfo') || {}).avatar),
        };
        store.commit('SET_USER_INFO', next);
        this.setData({ userInfo: next, avatarText: (next.nickname || '师').slice(0, 1) });
      }
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

  openBindPhone() {
    if (!util.requireLogin()) return;
    const phone = (this.data.userInfo && this.data.userInfo.phone) || '';
    if (phone) {
      wx.showToast({ title: `已绑定 ${phone}`, icon: 'none' });
      return;
    }
    this.setData({
      showBind: true,
      bindPhone: '',
      bindCode: '',
    });
  },

  closeBindPhone() {
    this.setData({ showBind: false });
  },

  noop() {},

  onBindPhoneInput(e) {
    this.setData({ bindPhone: String(e.detail.value || '').replace(/\D/g, '').slice(0, 11) });
  },

  onBindCodeInput(e) {
    this.setData({ bindCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) });
  },

  clearDataTimer() {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  },

  startCooldown(seconds = 60) {
    this.clearDataTimer();
    this.setData({ cooldown: seconds });
    this.cooldownTimer = setInterval(() => {
      const next = Math.max(0, (this.data.cooldown || 0) - 1);
      this.setData({ cooldown: next });
      if (next <= 0) this.clearDataTimer();
    }, 1000);
  },

  async sendBindCode() {
    const phone = this.data.bindPhone;
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' });
      return;
    }
    this.setData({ sending: true });
    try {
      const res = await authService.sendSmsCode(phone);
      this.startCooldown((res && res.cooldown) || 60);
      wx.showToast({ title: '验证码已发送', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' });
    } finally {
      this.setData({ sending: false });
    }
  },

  async submitBindPhone() {
    const { bindPhone: phone, bindCode: code } = this.data;
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' });
      return;
    }
    if (!code || code.length < 4) {
      wx.showToast({ title: '请输入验证码', icon: 'none' });
      return;
    }
    this.setData({ binding: true });
    try {
      const res = await authService.bindPhone(phone, code);
      const user = res.user || {};
      const next = {
        ...(wx.getStorageSync('userInfo') || {}),
        ...user,
        avatar: authService.assetUrl(user.avatar),
      };
      if (res.token) store.commit('SET_TOKEN', res.token);
      store.commit('SET_USER_INFO', next);
      this.setData({
        userInfo: next,
        showBind: false,
        bindCode: '',
        avatarText: (next.nickname || '师').slice(0, 1),
      });
      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '绑定失败', icon: 'none' });
    } finally {
      this.setData({ binding: false });
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
    this.setData({ isLogin: false, userInfo: null, cert: null, showBind: false });
  },
});
