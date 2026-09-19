const userService = require('../../services/user.js');
const config = require('../../config/index.js');
const util = require('../../utils/util.js');
const { renderMarkdown } = require('../../utils/markdown.js');

Page({
  data: {
    origin: config.origin,
    paper: { title: '教师服务合同', status: 'none', signed: false },
    html: '',
    agreed: false,
    drew: false,
    saving: false,
    loaded: false,
  },

  onShow() {
    if (!util.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.load();
  },

  onReady() {
    this.ctx = wx.createCanvasContext('sign', this);
    this.paint();
  },

  async load() {
    try {
      const paper = await userService.getContract();
      this.setData({
        paper,
        html: renderMarkdown(paper.content),
        loaded: true,
      });
    } catch (err) {
      console.error(err);
    }
  },

  paint() {
    if (!this.ctx) return;
    this.ctx.setStrokeStyle('#111827');
    this.ctx.setLineWidth(3);
    this.ctx.setLineCap('round');
    this.ctx.setLineJoin('round');
  },

  touchStart(e) {
    const point = e.touches[0];
    this.last = { x: point.x, y: point.y };
    this.moved = false;
  },

  touchMove(e) {
    const point = e.touches[0];
    if (!this.last) this.last = { x: point.x, y: point.y };
    this.paint();
    this.ctx.beginPath();
    this.ctx.moveTo(this.last.x, this.last.y);
    this.ctx.lineTo(point.x, point.y);
    this.ctx.stroke();
    this.ctx.draw(true);
    this.last = { x: point.x, y: point.y };
    this.moved = true;
    if (!this.data.drew) this.setData({ drew: true });
  },

  touchEnd() {
    if (!this.moved && this.last) {
      this.paint();
      this.ctx.beginPath();
      this.ctx.arc(this.last.x, this.last.y, 1.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.draw(true);
      this.setData({ drew: true });
    }
    this.last = null;
  },

  clearPad() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.pad').boundingClientRect((rect) => {
      const width = (rect && rect.width) || 300;
      const height = (rect && rect.height) || 140;
      this.ctx.clearRect(0, 0, width, height);
      this.ctx.draw();
      this.setData({ drew: false });
    }).exec();
  },

  toggle() { this.setData({ agreed: !this.data.agreed }); },

  goCert() { wx.navigateTo({ url: '/pages/certify/certify' }); },

  submit() {
    if (this.data.saving) return;
    if (this.data.paper.status !== 'approved') {
      wx.showToast({ title: '认证通过后才能签订', icon: 'none' });
      return;
    }
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并勾选合同', icon: 'none' });
      return;
    }
    if (!this.data.drew) {
      wx.showToast({ title: '请手写签名', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.canvasToTempFilePath({
      canvasId: 'sign',
      fileType: 'png',
      success: async (res) => {
        try {
          await userService.signContract(res.tempFilePath);
          wx.showToast({ title: '合同已签订', icon: 'success' });
          await this.load();
        } catch (err) {
          wx.showToast({ title: err.message || '签订失败', icon: 'none' });
        } finally {
          this.setData({ saving: false });
        }
      },
      fail: () => {
        this.setData({ saving: false });
        wx.showToast({ title: '签名导出失败', icon: 'none' });
      },
    }, this);
  },
});
