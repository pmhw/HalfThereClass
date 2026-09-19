// pages/search/search.js
const courseService = require('../../services/course.js');
const util = require('../../utils/util.js');

const HISTORY_KEY = 'search_history';

Page({
  data: {
    keyword: '',
    historyList: [],
    hotList: ['Python入门', '前端开发', '数据分析', '职场技能', '设计基础'],
    courseList: [],
    isSearched: false,
    loading: false,
  },

  onLoad() {
    this.loadHistory();
  },

  loadHistory() {
    const history = wx.getStorageSync(HISTORY_KEY) || [];
    this.setData({ historyList: history.slice(0, 10) });
  },

  saveHistory(keyword) {
    let history = wx.getStorageSync(HISTORY_KEY) || [];
    history = history.filter((k) => k !== keyword);
    history.unshift(keyword);
    history = history.slice(0, 10);
    wx.setStorageSync(HISTORY_KEY, history);
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  async onSearch(e) {
    const keyword = e.detail.value || this.data.keyword;
    if (!keyword.trim()) return;

    this.setData({ keyword, loading: true, isSearched: true });
    this.saveHistory(keyword);

    try {
      const result = await courseService.getCourseList({
        keyword,
        page: 1,
        pageSize: 20,
      });
      this.setData({ courseList: result.list || [] });
    } catch (err) {
      console.error('搜索失败', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onHistoryTap(e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({ keyword });
    this.onSearch({ detail: { value: keyword } });
  },

  onHotTap(e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({ keyword });
    this.onSearch({ detail: { value: keyword } });
  },

  clearHistory() {
    wx.showModal({
      title: '提示',
      content: '确定清空搜索历史？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync(HISTORY_KEY);
          this.setData({ historyList: [] });
        }
      },
    });
  },

  onCancel() {
    wx.navigateBack();
  },
});
