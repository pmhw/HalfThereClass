const RATIO = 856 / 540;
const privacy = require('../../utils/privacy.js');

function layoutOf(info) {
  const winW = info.windowWidth;
  const winH = info.windowHeight;
  const menu = wx.getMenuButtonBoundingClientRect();
  const landscape = winW >= winH;
  const maxW = winW - (landscape ? 160 : 36);
  const maxH = winH - (landscape ? 120 : 210);
  let frameW = maxW;
  let frameH = Math.round(frameW / RATIO);
  if (frameH > maxH) {
    frameH = Math.max(120, maxH);
    frameW = Math.round(frameH * RATIO);
  }
  const left = Math.round((winW - frameW) / 2);
  const top = Math.round((winH - frameH) / 2 - (landscape ? 6 : 16));
  const inset = info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0;
  return {
    padTop: menu.top || info.statusBarHeight || 24,
    navH: menu.height || 32,
    winW,
    winH,
    dock: (landscape ? 20 : 36) + inset,
    shutterLeft: Math.round((winW - 74) / 2),
    frame: { left, top, w: frameW, h: frameH },
  };
}

Page({
  data: {
    side: 'portrait',
    key: 'idCard',
    phase: 'wait',
    preview: '',
    flash: 'off',
    padTop: 24,
    navH: 32,
    winW: 375,
    winH: 667,
    dock: 48,
    shutterLeft: 150,
    frame: { left: 24, top: 180, w: 327, h: 206 },
  },

  onLoad(query) {
    this.channel = this.getOpenerEventChannel();
    this.setData({
      side: query.side === 'emblem' ? 'emblem' : 'portrait',
      key: query.key === 'idCardBack' ? 'idCardBack' : 'idCard',
      ...layoutOf(wx.getWindowInfo()),
    });
    this.askCamera();
  },

  onResize() {
    this.setData(layoutOf(wx.getWindowInfo()));
  },

  askCamera() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting && res.authSetting['scope.camera']) this.setData({ phase: 'cam' });
        else this.setData({ phase: 'need' });
      },
      fail: () => this.setData({ phase: 'need' }),
    });
  },

  grantCamera() {
    wx.authorize({
      scope: 'scope.camera',
      success: () => this.setData({ phase: 'cam' }),
      fail: (err) => {
        if (privacy.undeclared(err)) {
          privacy.explainUndeclared();
          return;
        }
        if (privacy.denied(err)) this.askSetting();
      },
    });
  },

  onCamError(e) {
    const err = (e && e.detail) || {};
    if (privacy.undeclared(err)) privacy.explainUndeclared();
  },

  back() { wx.navigateBack(); },

  askSetting() {
    wx.showModal({
      title: '摄像头已被拒绝',
      content: '这是你之前拒绝了系统的摄像头允许框。请到设置里打开后再拍摄。',
      confirmText: '去设置',
      success: (res) => {
        if (res.confirm) wx.openSetting();
      },
    });
  },

  toggleFlash() {
    this.setData({ flash: this.data.flash === 'torch' ? 'off' : 'torch' });
  },

  pickFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'jpg', 'jpeg', 'png'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        if (/\.pdf$/i.test(file.name || file.path || '')) {
          this.finish(file.path);
          return;
        }
        this.setData({ phase: 'preview', preview: file.path });
      },
      fail: (err) => {
        if (privacy.cancelled(err)) return;
        if (privacy.undeclared(err)) {
          privacy.explainUndeclared();
          return;
        }
        wx.showToast({ title: '无法打开文件', icon: 'none' });
      },
    });
  },

  pickAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file) this.setData({ phase: 'preview', preview: file.tempFilePath });
      },
      fail: (err) => {
        if (privacy.cancelled(err)) return;
        if (privacy.undeclared(err)) privacy.explainUndeclared();
      },
    });
  },

  shoot() {
    if (this.busy) return;
    this.busy = true;
    wx.createCameraContext().takePhoto({
      quality: 'high',
      success: (res) => {
        this.crop(res.tempImagePath).then((path) => {
          this.setData({ phase: 'preview', preview: path });
        }).catch(() => {
          this.setData({ phase: 'preview', preview: res.tempImagePath });
        }).finally(() => { this.busy = false; });
      },
      fail: () => {
        this.busy = false;
        wx.showToast({ title: '拍摄失败，请重试', icon: 'none' });
      },
    });
  },

  retake() {
    this.setData({ phase: 'cam', preview: '' });
  },

  usePhoto() {
    if (!this.data.preview) return;
    this.finish(this.data.preview);
  },

  finish(path) {
    const pages = getCurrentPages();
    const prev = pages[pages.length - 2];
    const payload = { key: this.data.key, path };
    if (prev && typeof prev.onIdShot === 'function') prev.onIdShot(payload);
    else if (this.channel && this.channel.emit) this.channel.emit('done', payload);
    wx.navigateBack();
  },

  crop(src) {
    const frame = this.data.frame;
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src,
        success: (info) => {
          wx.createSelectorQuery().in(this).select('.cam').boundingClientRect().select('#crop').fields({ node: true }).exec((res) => {
            const view = res && res[0];
            const canvas = res && res[1] && res[1].node;
            if (!view || !canvas) {
              reject(new Error('crop'));
              return;
            }
            const scale = Math.max(view.width / info.width, view.height / info.height);
            const ox = (info.width * scale - view.width) / 2;
            const oy = (info.height * scale - view.height) / 2;
            let sx = Math.round((frame.left - view.left + ox) / scale);
            let sy = Math.round((frame.top - view.top + oy) / scale);
            let sw = Math.round(frame.w / scale);
            let sh = Math.round(frame.h / scale);
            sx = Math.max(0, Math.min(sx, info.width - 1));
            sy = Math.max(0, Math.min(sy, info.height - 1));
            sw = Math.max(1, Math.min(sw, info.width - sx));
            sh = Math.max(1, Math.min(sh, info.height - sy));
            const outW = 856;
            const outH = 540;
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext('2d');
            const img = canvas.createImage();
            img.onload = () => {
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
              wx.canvasToTempFilePath({
                canvas,
                destWidth: outW,
                destHeight: outH,
                fileType: 'jpg',
                quality: 0.92,
                success: (file) => resolve(file.tempFilePath),
                fail: reject,
              });
            };
            img.onerror = reject;
            img.src = src;
          });
        },
        fail: reject,
      });
    });
  },
});
