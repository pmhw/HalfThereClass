const { get } = require('../../utils/request.js');
const util = require('../../utils/util.js');

function todayKey() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function weekdayOf(date) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  return day === 0 ? 7 : day;
}

function markOf(title) {
  const pairs = [['数学', '数'], ['英语', '英'], ['语文', '语'], ['物理', '物'], ['化学', '化'], ['生物', '生'], ['历史', '史'], ['地理', '地'], ['科学', '科']];
  const text = title || '';
  for (let i = 0; i < pairs.length; i += 1) {
    if (text.includes(pairs[i][0])) return { initial: pairs[i][1], tone: i % 2 === 0 ? 'blue' : 'purple' };
  }
  return { initial: text.slice(0, 1) || '课', tone: 'blue' };
}

function decorate(list, date) {
  const weekday = weekdayOf(date);
  return (list || []).filter((item) => !item.weekday || item.weekday === weekday).map((item) => {
    const mark = markOf(item.title);
    const when = [item.startTime, item.endTime].filter(Boolean).join(' - ');
    const place = [item.school, item.gradeLabel].filter(Boolean).join(' · ');
    return {
      ...item,
      ...mark,
      when: when || '时间待定',
      place: place || '学校待定',
      room: item.classroom || '教室待定',
    };
  });
}

Page({
  data: {
    loggedIn: false,
    certified: false,
    list: [],
    shown: [],
    date: '',
    dateLabel: '今日',
    padTop: 48,
    titleH: 32,
    side: 96,
  },

  onLoad() {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    this.setData({
      padTop: menu.top || sys.statusBarHeight || 24,
      titleH: menu.height || 32,
      side: Math.max(24, (sys.windowWidth || 375) - menu.left + 12),
    });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setSelected(2);
    const loggedIn = util.checkLogin();
    const date = this.data.date || todayKey();
    this.setData({ loggedIn, date, dateLabel: date === todayKey() ? '今日' : date.slice(5).replace('-', '月') + '日' });
    if (!loggedIn) return;
    get('/teacher/courses').then((data) => {
      const list = (data && data.list) || [];
      this.setData({
        certified: !!(data && data.certified),
        list,
        shown: decorate(list, this.data.date || todayKey()),
      });
    }).catch(() => {});
  },

  onAuthed() {
    this.onShow();
  },

  onDate(e) {
    const date = e.detail.value;
    this.setData({
      date,
      dateLabel: date === todayKey() ? '今日' : `${date.slice(5, 7)}月${date.slice(8)}日`,
      shown: decorate(this.data.list, date),
    });
  },

  open(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/course-detail/course-detail?id=${id}` });
  },
});
