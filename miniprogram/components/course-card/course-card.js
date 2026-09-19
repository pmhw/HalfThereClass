Component({
  properties: {
    course: { type: Object, value: {} },
  },
  data: { week: '', initial: '课' },
  observers: {
    course(course) {
      const names = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      const title = (course && course.title) || '课';
      this.setData({
        week: names[course && course.weekday] || '',
        initial: title.slice(0, 1),
      });
    },
  },
  methods: {
    onTap() {
      const { id } = this.properties.course;
      if (!id) return;
      wx.navigateTo({ url: `/pages/course-detail/course-detail?id=${id}` });
    },
  },
});
