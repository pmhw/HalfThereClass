const courseService = require('../../services/course.js');
const util = require('../../utils/util.js');

function pad(n) {
  return `${n}`.padStart(2, '0');
}

function hoursOf(start, end) {
  if (!start || !end) return '';
  const toMin = (value) => {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + (minute || 0);
  };
  const mins = toMin(end) - toMin(start);
  if (!(mins > 0)) return '';
  const hours = mins / 60;
  return Number.isInteger(hours) ? `${hours}小时` : `${Math.round(hours * 10) / 10}小时`;
}

Page({
  data: {
    year: 2026,
    month: 9,
    title: '',
    cells: [],
    selected: '',
    visible: [],
    sessions: [],
    marks: [],
    selectedMark: '',
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
    loggedIn: false,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setSelected(1);
    const loggedIn = util.checkLogin();
    this.setData({ loggedIn });
    wx.setNavigationBarTitle({ title: loggedIn ? '课表' : '登录' });
    if (!loggedIn) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    this.setData({
      year,
      month,
      selected: `${year}-${pad(month)}-${pad(now.getDate())}`,
    });
    this.load();
  },

  onAuthed() {
    this.onShow();
  },

  async load() {
    const { year, month } = this.data;
    try {
      const calendar = await courseService.getCalendar(`${year}-${pad(month)}`);
      let sessions = (calendar.sessions || []).filter((item) => item.isMine);
      if (!calendar.generated) {
        const courses = await courseService.getSchedule();
        sessions = this.expandWeekly((courses || []).filter((item) => item.isMine), year, month);
      }
      this.setData({ title: `${year}年${month}月`, sessions, marks: calendar.marks || [] }, () => this.paint());
    } catch (err) {
      console.error(err);
    }
  },

  expandWeekly(courses, year, month) {
    const days = new Date(year, month, 0).getDate();
    const rows = [];
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(year, month - 1, day);
      const weekday = date.getDay() === 0 ? 7 : date.getDay();
      const key = `${year}-${pad(month)}-${pad(day)}`;
      courses.filter((item) => item.weekday === weekday).forEach((item) => {
        rows.push({
          id: `${item.id}-${key}`,
          courseId: item.id,
          date: key,
          startTime: item.startTime,
          endTime: item.endTime,
          title: item.title,
          school: item.school,
          classroom: item.classroom,
          gradeLabel: item.gradeLabel,
          isMine: item.isMine,
          label: '每周',
          status: 'scheduled',
          note: '',
        });
      });
    }
    return rows;
  },

  paint() {
    const { year, month, sessions, selected, marks } = this.data;
    const markMap = {};
    (marks || []).forEach((item) => { markMap[item.date] = item; });
    const first = new Date(year, month - 1, 1);
    const lead = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const count = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i += 1) cells.push({ key: `e${i}`, empty: true });
    for (let day = 1; day <= count; day += 1) {
      const date = `${year}-${pad(month)}-${pad(day)}`;
      const items = sessions.filter((item) => item.date === date);
      const active = items.filter((item) => item.status === 'scheduled' || item.status === 'observe');
      const mark = markMap[date] || {};
      cells.push({
        key: date,
        date,
        day,
        count: items.length,
        off: items.length > 0 && active.length === 0,
        on: date === selected,
        holiday: mark.name || '',
        rest: !!mark.rest,
        work: !!mark.work,
      });
    }
    const picked = markMap[selected];
    const selectedMark = picked
      ? `${picked.name || '节假日'}${picked.work ? ' · 班' : picked.rest ? ' · 休' : ''}`
      : '';
    this.setData({
      cells,
      selectedMark,
      visible: sessions.filter((item) => item.date === selected).map((item) => ({
        ...item,
        hours: hoursOf(item.startTime, item.endTime),
      })),
    });
  },

  shift(delta) {
    let { year, month } = this.data;
    month += delta;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    if (month > 12) {
      month = 1;
      year += 1;
    }
    this.setData({ year, month, selected: `${year}-${pad(month)}-01` }, () => this.load());
  },

  prev() { this.shift(-1); },
  next() { this.shift(1); },

  onDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.setData({ selected: date }, () => this.paint());
  },

  open(e) {
    wx.navigateTo({ url: `/pages/course-detail/course-detail?id=${e.currentTarget.dataset.id}` });
  },
});
