const teacherService = require('../../services/teacher.js');
const util = require('../../utils/util.js');

const CATEGORIES = [
  { value: 'transport', label: '交通出行' },
  { value: 'material', label: '教材教具' },
  { value: 'meal', label: '餐饮补贴' },
  { value: 'office', label: '办公耗材' },
  { value: 'other', label: '其他' },
];

Page({
  data: {
    title: '',
    categoryIndex: 0,
    categoryLabels: CATEGORIES.map((item) => item.label),
    amount: '',
    expenseDate: '',
    description: '',
    attachments: [],
    list: [],
    saving: false,
  },

  onShow() {
    if (!util.requireLogin()) return;
    this.load();
  },

  async load() {
    try {
      const list = (await teacherService.getReimbursements()) || [];
      this.setData({
        list: list.map((item) => ({
          ...item,
          amountText: Number(item.amount || 0).toFixed(2),
        })),
      });
    } catch (err) {
      this.setData({ list: [] });
    }
  },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onAmount(e) { this.setData({ amount: e.detail.value }); },
  onDesc(e) { this.setData({ description: e.detail.value }); },
  onCategory(e) { this.setData({ categoryIndex: Number(e.detail.value) || 0 }); },
  onDate(e) { this.setData({ expenseDate: e.detail.value }); },

  pickShot() {
    wx.chooseMedia({
      count: Math.max(1, 9 - this.data.attachments.length),
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = res.tempFiles || [];
        for (const file of files) {
          try {
            const data = await teacherService.uploadReimbursementReceipt(file.tempFilePath);
            if (data && data.url) {
              this.setData({ attachments: this.data.attachments.concat([util.assetUrl(data.url)]) });
            }
          } catch (err) {
            wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' });
          }
        }
      },
    });
  },

  removeShot(e) {
    const index = Number(e.currentTarget.dataset.index);
    const next = this.data.attachments.slice();
    next.splice(index, 1);
    this.setData({ attachments: next });
  },

  async submit() {
    const title = String(this.data.title || '').trim();
    const amount = Number(this.data.amount);
    if (!title) return wx.showToast({ title: '请填写报销事由', icon: 'none' });
    if (!amount || amount <= 0) return wx.showToast({ title: '请填写金额', icon: 'none' });
    if (!this.data.expenseDate) return wx.showToast({ title: '请选择日期', icon: 'none' });
    if (!this.data.attachments.length) return wx.showToast({ title: '请上传票据', icon: 'none' });
    this.setData({ saving: true });
    try {
      await teacherService.createReimbursement({
        title,
        category: CATEGORIES[this.data.categoryIndex].value,
        amount,
        expenseDate: this.data.expenseDate,
        description: String(this.data.description || '').trim(),
        attachments: this.data.attachments.map((url) => String(url).replace(/^https?:\/\/[^/]+/, '').replace(/\?access_token=.*$/, '')),
      });
      wx.showToast({ title: '已提交，等待审核', icon: 'none' });
      this.setData({ title: '', amount: '', description: '', attachments: [] });
      await this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  cancel(e) {
    const id = Number(e.currentTarget.dataset.id);
    wx.showModal({
      title: '撤销报销单',
      content: '撤销该待审核报销单？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await teacherService.cancelReimbursement(id);
          wx.showToast({ title: '已撤销', icon: 'none' });
          this.load();
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '撤销失败', icon: 'none' });
        }
      },
    });
  },
});
