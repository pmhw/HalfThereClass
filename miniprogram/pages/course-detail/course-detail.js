const courseService = require('../../services/course.js');
const util = require('../../utils/util.js');

function countdownText(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days ? `${days}天 ${clock}` : clock;
}

Page({
  data: { course: null, week: '', waiting: false, countdown: '' },

  onLoad(options) {
    this.courseId = Number(options.id);
  },

  onShow() {
    this.load();
  },

  onHide() {
    this.stopClock();
  },

  onUnload() {
    this.stopClock();
  },

  async load() {
    try {
      const course = await courseService.getCourseDetail(this.courseId);
      this.setData({
        course,
        week: util.weekdayText(course.weekday),
        initial: (course.title || '课').slice(0, 1),
      });
      this.startClock(course);
    } catch (err) {
      console.error(err);
    }
  },

  startClock(course) {
    this.stopClock();
    const offset = (course.serverNow || Date.now()) - Date.now();
    const tick = () => {
      const left = (course.grabAt || 0) - (Date.now() + offset);
      const waiting = !!(course.openGrab && course.grabAt && left > 0);
      const patch = { waiting, countdown: waiting ? countdownText(left) : '' };
      if (!waiting && course.openGrab && course.contractSigned) patch['course.canGrab'] = true;
      this.setData(patch);
      if (!waiting) this.stopClock();
    };
    tick();
    if (course.openGrab && course.grabAt && course.grabAt > Date.now() + offset) {
      this.timer = setInterval(tick, 1000);
    }
  },

  stopClock() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  addCalendar() {
    const course = this.data.course;
    if (!course || !course.grabAt) return;
    const start = Math.floor(Number(course.grabAt) / 1000);
    wx.addPhoneCalendar({
      title: `${course.title} 开抢`,
      startTime: start,
      endTime: start + 3600,
      description: '课程开抢提醒',
      alarm: true,
      alarmOffset: 600,
      success: () => wx.showToast({ title: '已加入日历', icon: 'none' }),
      fail: (err) => {
        const message = err && err.errMsg ? err.errMsg : '';
        if (/cancel/i.test(message)) return;
        wx.showToast({ title: '无法写入日历', icon: 'none' });
      },
    });
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
