const userService = require('../../services/user.js');
const authService = require('../../services/auth.js');
const store = require('../../store/index.js');

Page({
  data: {
    nickname: '',
    avatar: '',
    avatarLocal: false,
    loading: false,
  },

  onLoad() {
    this.loadUserInfo();
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      nickname: userInfo.nickname || '',
      avatar: authService.assetUrl(userInfo.avatar),
      avatarLocal: false,
    });
  },

  onNicknameInput(e) {
    const nickname = ((e.detail && e.detail.value) || '').trim();
    this.setData({ nickname });
  },

  onChooseAvatar(e) {
    const avatar = e.detail && e.detail.avatarUrl;
    if (!avatar) {
      wx.showToast({ title: '请在弹窗里点「用微信头像」', icon: 'none' });
      return;
    }
    this.setData({ avatar, avatarLocal: true });
  },

  async onSave(e) {
    const formNick = e && e.detail && e.detail.value ? e.detail.value.nickname : '';
    const nickname = String(formNick || this.data.nickname || '').trim();
    if (!nickname || nickname === '微信用户') {
      wx.showToast({ title: '请点昵称框，再点键盘上方的微信昵称', icon: 'none' });
      return;
    }
    if (!this.data.avatar) {
      wx.showToast({ title: '请先选择微信头像', icon: 'none' });
      return;
    }

    this.setData({ loading: true, nickname });
    try {
      let avatar = this.data.avatar;
      if (this.data.avatarLocal) {
        const uploaded = await authService.uploadAvatar(avatar);
        avatar = authService.assetUrl(uploaded.avatar);
      }
      const result = await userService.updateUserProfile({
        nickname,
        avatar: String(avatar).replace(/^https?:\/\/[^/]+/, ''),
      });
      store.commit('SET_USER_INFO', {
        ...(wx.getStorageSync('userInfo') || {}),
        ...result,
        nickname,
        avatar,
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
