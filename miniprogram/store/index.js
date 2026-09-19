// store/index.js - 简易状态管理

const state = {
  userInfo: null,
  token: '',
};

const mutations = {
  SET_USER_INFO(state, userInfo) {
    state.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);
  },
  SET_TOKEN(state, token) {
    state.token = token;
    wx.setStorageSync('token', token);
  },
  CLEAR_USER(state) {
    state.userInfo = null;
    state.token = '';
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('token');
  },
};

const store = {
  state,
  mutations,

  commit(mutation, payload) {
    if (mutations[mutation]) {
      mutations[mutation](state, payload);
      // 触发全局更新
      const app = getApp();
      if (app) {
        app.globalData = { ...app.globalData, ...state };
      }
    }
  },

  // 从本地存储初始化
  initFromStorage() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    if (token) state.token = token;
    if (userInfo) state.userInfo = userInfo;
  },
};

store.initFromStorage();

module.exports = store;
