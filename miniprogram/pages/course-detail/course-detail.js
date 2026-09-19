const courseService = require('../../services/course.js');
const util = require('../../utils/util.js');

Page({
  data: { course: null, week: '' },

  onLoad(options) {
    this.courseId = Number(options.id);
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const course = await courseService.getCourseDetail(this.courseId);
      this.setData({
        course,
        week: util.weekdayText(course.weekday),
        initial: (course.title || '课').slice(0, 1),
      });
    } catch (err) {
      console.error(err);
    }
  },

  async onGrab() {
    if (!util.requireLogin()) return;
    const course = this.data.course;
    if (!course.certified) {
      wx.navigateTo({ url: '/pages/certify/certify' });
      return;
    }
    if (!course.contractSigned) {
      wx.navigateTo({ url: '/pages/contract/contract' });
      return;
    }
    if (!course.canGrab) return;
    try {
      await courseService.grabCourse(this.courseId);
      wx.showToast({ title: '抢课成功', icon: 'success' });
      this.load();
    } catch (err) {
      console.error(err);
    }
  },

  goContract() {
    if (!util.requireLogin()) return;
    wx.navigateTo({ url: '/pages/contract/contract' });
  },

  goCheckin() {
    wx.navigateTo({ url: `/pages/checkin/checkin?id=${this.courseId}` });
  },

  goAdjust() {
    wx.navigateTo({ url: `/pages/adjust/adjust?courseId=${this.courseId}` });
  },
});
