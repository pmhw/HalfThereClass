const courseService = require('../../services/course.js');
const util = require('../../utils/util.js');

function greet() {
  const hour = new Date().getHours();
  if (hour < 11) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function remainText(startTime) {
  if (!startTime) return '';
  const [hour, minute] = startTime.split(':').map(Number);
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  const diff = target - new Date();
  if (diff <= 0) return '已到上课时间';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0 && m > 0) return `距离上课 ${h}小时${m}分钟`;
  if (h > 0) return `距离上课 ${h}小时`;
  return `距离上课 ${m}分钟`;
}

function decorate(list) {
  const weeks = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const tones = ['blue', 'purple', 'cyan'];
  return (list || []).filter((item) => item.openGrab || !item.teacherId).map((item, index) => {
    const span = [item.startTime, item.endTime].filter(Boolean).join(' - ');
    const when = [weeks[item.weekday] || '', span].filter(Boolean).join(' ');
    return {
      ...item,
      initial: (item.title || '课').slice(0, 1),
      tone: tones[index % tones.length],
      when,
    };
  });
}

Page({
  data: {
    greet: '',
    name: '老师',
    today: null,
    remain: '',
    recommend: [],
    loading: true,
    skel: [1, 2, 3],
    padTop: 48,
    titleH: 32,
    navH: 88,
  },

  onLoad() {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    const padTop = menu.top || sys.statusBarHeight || 24;
    const titleH = menu.height || 32;
    this.setData({ padTop, titleH, navH: padTop + titleH + 10 });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setSelected(0);
    const user = wx.getStorageSync('userInfo') || {};
    this.setData({ greet: greet(), name: user.nickname || '老师' });
    this.load();
  },

  async load() {
    try {
      const today = await courseService.getToday().catch(() => null);
      const recommend = await courseService.getRecommendCourses(12).catch(() => []);
      this.setData({
        today,
        remain: today && today.next ? remainText(today.next.startTime) : '',
        recommend: decorate(recommend),
        loading: false,
      });
    } catch (err) {
      console.error(err);
      this.setData({ loading: false });
    }
  },

  goNext() {
    const next = this.data.today && this.data.today.next;
    if (!next) return;
    wx.navigateTo({ url: `/pages/course-detail/course-detail?id=${next.id}` });
  },

  goCheckin() {
    const next = this.data.today && this.data.today.next;
    if (!next) {
      wx.showToast({ title: '今天没有待签到课程', icon: 'none' });
      return;
    }
    if (!util.requireLogin()) return;
    wx.navigateTo({ url: `/pages/checkin/checkin?id=${next.id}` });
  },

  goCourse() { wx.navigateTo({ url: '/pages/course-list/course-list' }); },
  openCourse(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/course-detail/course-detail?id=${id}` });
  },
  onBell() {
    wx.showToast({ title: '暂无新消息', icon: 'none' });
  },
  goTeach() { wx.switchTab({ url: '/pages/teaching/teaching' }); },
  goSchedule() { wx.switchTab({ url: '/pages/schedule/schedule' }); },
  goMy() { wx.switchTab({ url: '/pages/my/my' }); },
  goCert() {
    if (!util.requireLogin()) return;
    wx.navigateTo({ url: '/pages/certify/certify' });
  },
});
