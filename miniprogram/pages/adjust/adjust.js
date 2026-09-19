const courseService = require('../../services/course.js');
const util = require('../../utils/util.js');

Page({
  data: {
    courses: [],
    courseIndex: 0,
    types: [
      { value: 'reschedule', label: '调课' },
      { value: 'add', label: '加课' },
      { value: 'cancel', label: '停课' },
      { value: 'observe', label: '听课' },
    ],
    typeIndex: 0,
    date: '',
    toDate: '',
    startTime: '',
    endTime: '',
    note: '',
  },

  onLoad(options) {
    this.presetId = Number(options.courseId || 0);
  },

  onShow() {
    if (!util.requireLogin()) return;
    this.load();
  },

  async load() {
    try {
      const courses = await courseService.getTeaching();
      let courseIndex = 0;
      if (this.presetId) {
        const found = courses.findIndex((item) => item.id === this.presetId);
        if (found >= 0) courseIndex = found;
      }
      const current = courses[courseIndex];
      this.setData({
        courses,
        courseIndex,
        startTime: current ? current.startTime || '' : '',
        endTime: current ? current.endTime || '' : '',
      });
    } catch (err) {
      console.error(err);
    }
  },

  onCourse(e) {
    const courseIndex = Number(e.detail.value);
    const current = this.data.courses[courseIndex];
    this.setData({
      courseIndex,
      startTime: current.startTime || '',
      endTime: current.endTime || '',
    });
  },
  onType(e) { this.setData({ typeIndex: Number(e.detail.value) }); },
  onDate(e) { this.setData({ date: e.detail.value }); },
  onToDate(e) { this.setData({ toDate: e.detail.value }); },
  onStart(e) { this.setData({ startTime: e.detail.value }); },
  onEnd(e) { this.setData({ endTime: e.detail.value }); },
  onNote(e) { this.setData({ note: e.detail.value }); },

  async submit() {
    const course = this.data.courses[this.data.courseIndex];
    const type = this.data.types[this.data.typeIndex].value;
    if (!course || !this.data.date) {
      wx.showToast({ title: '请选择课程和日期', icon: 'none' });
      return;
    }
    if (type === 'reschedule' && !this.data.toDate) {
      wx.showToast({ title: '请选择调到哪一天', icon: 'none' });
      return;
    }
    try {
      await courseService.adjustSchedule({
        courseId: course.id,
        type,
        date: this.data.date,
        toDate: this.data.toDate,
        startTime: this.data.startTime,
        endTime: this.data.endTime,
        note: this.data.note,
      });
      wx.showToast({ title: '课表已更新', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (err) {
      console.error(err);
    }
  },
});
