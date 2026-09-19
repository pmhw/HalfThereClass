const courseService = require('../../services/course.js');
const util = require('../../utils/util.js');

Page({
  data: { info: null },

  onLoad(options) {
    this.courseId = Number(options.id);
  },

  onShow() {
    if (!util.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.load();
  },

  async load() {
    try {
      const info = await courseService.getCheckIn(this.courseId);
      this.setData({ info });
    } catch (err) {
      console.error(err);
    }
  },

  async onCheckIn() {
    if (this.data.info.checkedIn) return;
    try {
      await courseService.checkIn(this.courseId);
      wx.showToast({ title: '签到成功', icon: 'success' });
      this.load();
    } catch (err) {
      console.error(err);
    }
  },
});
