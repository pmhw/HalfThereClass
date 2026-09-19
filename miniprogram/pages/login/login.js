Page({
  done() {
    setTimeout(() => {
      wx.navigateBack({
        delta: 1,
        fail: () => wx.switchTab({ url: '/pages/index/index' }),
      });
    }, 600);
  },
});
