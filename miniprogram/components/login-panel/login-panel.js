const authService = require('../../services/auth.js');
const userService = require('../../services/user.js');
const store = require('../../store/index.js');

function showUser(user) {
  return {
    ...user,
    avatar: authService.assetUrl(user && user.avatar),
  };
}

Component({
  properties: {
    slogan: { type: String, value: '教师端登录' },
  },
  data: {
    step: 'login',
    loading: false,
    agreed: false,
    avatar: '',
    avatarLocal: false,
    nickname: '',
    nickFocus: false,
    needNick: false,
    needAvatar: false,
    agreementTitle: '用户协议',
    agreementContent: '',
    privacyName: '《用户隐私保护指引》',
    showAgreement: false,
  },
  lifetimes: {
    attached() {
      this.loadAgreement();
      this.loadPrivacy();
    },
  },
  pageLifetimes: {
    show() {
      this.loadAgreement();
      this.loadPrivacy();
    },
  },
  methods: {
    loadAgreement() {
      authService.getAgreement().then((data) => {
        this.setData({
          agreementTitle: (data && data.title) || '用户协议',
          agreementContent: (data && data.content) || '',
        });
      }).catch(() => {});
    },
    loadPrivacy() {
      if (!wx.getPrivacySetting) return;
      wx.getPrivacySetting({
        success: (res) => {
          this.setData({
            privacyName: res.privacyContractName || '《用户隐私保护指引》',
          });
        },
      });
    },
    toggleAgree() {
      this.setData({ agreed: !this.data.agreed });
    },
    needAgree() {
      wx.showToast({ title: '请先阅读并勾选用户协议', icon: 'none' });
    },
    openAgreement() {
      if (!this.data.agreementContent) {
        wx.showToast({ title: '协议加载中', icon: 'none' });
        this.loadAgreement();
        return;
      }
      this.setData({ showAgreement: true });
    },
    closeAgreement() {
      this.setData({ showAgreement: false });
    },
    noop() {},
    openPrivacy() {
      if (!wx.openPrivacyContract) {
        wx.showToast({ title: '请在微信里查看隐私保护指引', icon: 'none' });
        return;
      }
      wx.openPrivacyContract({
        fail: () => wx.showToast({ title: '暂时无法打开隐私保护指引', icon: 'none' }),
      });
    },
    onChooseAvatar(e) {
      const avatar = e.detail && e.detail.avatarUrl;
      if (!avatar) {
        wx.showToast({ title: '请在弹窗里点「用微信头像」', icon: 'none' });
        return;
      }
      this.setData({ avatar, avatarLocal: true, needAvatar: false });
    },
    onNickFocus() {
      this.setData({ needNick: false });
    },
    onNick(e) {
      const nickname = ((e.detail && e.detail.value) || '').trim();
      this._nick = nickname;
      this.setData({ nickname, needNick: false });
    },
    onNickReview(e) {
      const detail = e.detail || {};
      if (detail.pass === false && !detail.timeout) {
        this._nick = '';
        this.setData({ nickname: '', needNick: true });
      }
    },
    focusNick() {
      this.setData({ nickFocus: false, needNick: true }, () => {
        this.setData({ nickFocus: true });
      });
    },
    finish(user) {
      const next = showUser(user);
      store.commit('SET_USER_INFO', next);
      wx.showToast({ title: '登录成功', icon: 'success' });
      this.triggerEvent('success', { user: next });
    },
    async onWxAuth() {
      if (this._logging) return;
      if (!this.data.agreed) {
        this.needAgree();
        return;
      }
      this.doLogin();
    },
    async doLogin() {
      if (this._logging) return;
      this._logging = true;
      this.setData({ loading: true });
      try {
        const loginRes = await new Promise((resolve, reject) => {
          wx.login({ success: resolve, fail: reject });
        });
        if (!loginRes.code) throw new Error('微信登录失败');
        const result = await authService.wxLogin(loginRes.code);
        store.commit('SET_TOKEN', result.token);
        const user = result.user || {};
        store.commit('SET_USER_INFO', user);
        if (Number(user.status) === 0) {
          require('../../utils/freeze.js').lock('账号已冻结');
          return;
        }
        if (user.nickname && user.avatar) {
          this.finish(user);
          return;
        }
        this.setData({
          step: 'profile',
          nickname: user.nickname || '',
          avatar: authService.assetUrl(user.avatar),
          avatarLocal: false,
        });
      } catch (err) {
        const app = getApp();
        if (app && app.logout) app.logout();
        wx.showToast({ title: (err && err.message) || '登录失败', icon: 'none' });
      } finally {
        this._logging = false;
        this.setData({ loading: false });
      }
    },
    async onProfile(e) {
      if (this.data.loading) return;
      if (!this.data.avatar) {
        this.setData({ needAvatar: true });
        wx.showToast({ title: '请先点头像并选择用微信头像', icon: 'none' });
        return;
      }
      const formNick = e && e.detail && e.detail.value ? e.detail.value.nickname : '';
      const nickname = String(formNick || this._nick || this.data.nickname || '').trim();
      if (!nickname || nickname === '微信用户') {
        this.focusNick();
        wx.showToast({ title: '请点昵称框，再点键盘上方的微信昵称', icon: 'none' });
        return;
      }
      this._nick = nickname;
      this.setData({ loading: true, nickname });
      try {
        let avatar = this.data.avatar;
        if (this.data.avatarLocal) {
          const uploaded = await authService.uploadAvatar(this.data.avatar);
          avatar = authService.assetUrl(uploaded.avatar);
        }
        const profile = await userService.updateUserProfile({ nickname, avatar: avatar.replace(/^https?:\/\/[^/]+/, '') });
        this.finish({
          ...(wx.getStorageSync('userInfo') || {}),
          ...profile,
          nickname,
          avatar,
        });
      } catch (err) {
        wx.showToast({ title: (err && err.message) || '资料保存失败', icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    },
  },
});
