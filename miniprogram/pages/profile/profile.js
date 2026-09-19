// pages/profile/profile.js
const userService = require('../../services/user.js');
const store = require('../../store/index.js');
const uploadService = require('../../services/upload.js');

Page({
  data: {
    nickname: '',
    avatar: '',
    phone: '',
    loading: false,
  },

  onLoad() {
    this.loadUserInfo();
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      nickname: userInfo.nickname || '',
      avatar: userInfo.avatar || '',
    });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  // 更换头像
  onChangeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        try {
          wx.showLoading({ title: '上传中...' });
          const filePath = res.tempFiles[0].tempFilePath;
          const uploadResult = await uploadService.uploadImage(filePath, 'avatar');
          this.setData({ avatar: uploadResult.url });
          wx.hideLoading();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      },
    });
  },

  // 保存
  async onSave() {
    const { nickname, avatar } = this.data;
    if (!nickname.trim()) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await userService.updateUserProfile({ nickname, avatar });
      store.commit('SET_USER_INFO', result);
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
