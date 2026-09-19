// pages/order/order.js
const orderService = require('../../services/order.js');
const util = require('../../utils/util.js');

Page({
  data: {
    tabs: [
      { key: '', label: '全部' },
      { key: 'pending', label: '待支付' },
      { key: 'paid', label: '已支付' },
    ],
    currentTab: '',
    orderList: [],
    loading: false,
  },

  onShow() {
    if (!util.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.loadOrders(true);
  },

  async loadOrders(refresh = false) {
    if (this.data.loading) return;

    this.setData({ loading: true });
    try {
      const result = await orderService.getOrderList({
        page: 1,
        pageSize: 20,
        status: this.data.currentTab || undefined,
      });
      this.setData({ orderList: result.list || [] });
    } catch (err) {
      console.error('加载订单失败', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ currentTab: key });
    this.loadOrders(true);
  },

  goCourseDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/course-detail/course-detail?id=${id}` });
  },
});
