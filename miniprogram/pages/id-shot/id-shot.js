const RATIO = 85.6 / 53.98;
const privacy = require('../../utils/privacy.js');

const STATUS = {
  empty: { text: '请将身份证放入框内', tone: 'wait' },
  ok: { text: '身份证位置合适', tone: 'ok' },
  tilt: { text: '请保持身份证水平', tone: 'warn' },
  close: { text: '请稍微远离一点', tone: 'warn' },
  dark: { text: '光线不足，请移至明亮处', tone: 'warn' },
  glare: { text: '检测到反光，请调整角度', tone: 'warn' },
  block: { text: '请确保身份证完整无遮挡', tone: 'warn' },
};

Page({
  data: {
    side: 'portrait',
    key: 'idCard',
    phase: 'wait',
    preview: '',
    padTop: 24,
    navH: 32,
    statusText: STATUS.empty.text,
    statusTone: STATUS.empty.tone,
  },

  onLoad(query) {
    const info = wx.getWindowInfo();
    const menu = wx.getMenuButtonBoundingClientRect();
    this.channel = this.getOpenerEventChannel();
    this.setData({
      side: query.side === 'emblem' ? 'emblem' : 'portrait',
      key: query.key === 'idCardBack' ? 'idCardBack' : 'idCard',
      padTop: menu.top || info.statusBarHeight || 24,
      navH: menu.height || 32,
    });
    this.askCamera();
  },

  onUnload() {
    this.stopLight();
  },

  applyStatus(name) {
    const item = STATUS[name] || STATUS.empty;
    if (this.data.statusText === item.text) return;
    this.setData({ statusText: item.text, statusTone: item.tone });
  },

  askCamera() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting && res.authSetting['scope.camera']) this.setData({ phase: 'cam' });
        else {
          this.setData({ phase: 'need' });
          this.applyStatus('empty');
        }
      },
      fail: () => {
        this.setData({ phase: 'need' });
        this.applyStatus('empty');
      },
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

  onCamReady() {
    this.applyStatus('ok');
    this.watchLight();
  },

  watchLight() {
    this.stopLight();
    const ctx = wx.createCameraContext();
    if (!ctx.onCameraFrame) return;
    let last = 0;
    const listener = ctx.onCameraFrame((frame) => {
      const now = Date.now();
      if (now - last < 600 || this.data.phase !== 'cam') return;
      const bytes = frame && frame.data ? new Uint8Array(frame.data) : null;
      if (!bytes || !frame.width || !frame.height || bytes.length < frame.width * frame.height * 4) return;
      last = now;
      let sum = 0;
      let count = 0;
      const step = 64;
      for (let i = 0; i + 2 < bytes.length; i += step) {
        sum += bytes[i] * 0.3 + bytes[i + 1] * 0.59 + bytes[i + 2] * 0.11;
        count += 1;
      }
      const avg = count ? sum / count : 255;
      this.applyStatus(avg < 42 ? 'dark' : 'ok');
    });
    listener.start();
    this.lightListener = listener;
  },

  stopLight() {
    if (this.lightListener) {
      this.lightListener.stop();
      this.lightListener = null;
    }
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

  onShutter() {
    if (this.data.phase === 'need' || this.data.phase === 'wait') {
      this.grantCamera();
      return;
    }
    this.shoot();
  },

  shoot() {
    if (this.busy || this.data.phase !== 'cam') return;
    this.busy = true;
    this.stopLight();
    wx.createCameraContext().takePhoto({
      quality: 'high',
      success: (res) => {
        this.crop(res.tempImagePath).then((path) => {
          this.setData({ phase: 'preview', preview: path });
          this.applyStatus('ok');
        }).catch(() => {
          this.setData({ phase: 'preview', preview: res.tempImagePath });
          this.applyStatus('ok');
        }).finally(() => { this.busy = false; });
      },
      fail: () => {
        this.busy = false;
        this.watchLight();
        wx.showToast({ title: '拍摄失败，请重试', icon: 'none' });
      },
    });
  },

  retake() {
    this.setData({ phase: 'cam', preview: '' });
    this.applyStatus('empty');
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
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src,
        success: (info) => {
          wx.createSelectorQuery().in(this).select('.cam').boundingClientRect().select('#crop').fields({ node: true }).exec((res) => {
            const view = res && res[0];
            const canvas = res && res[1] && res[1].node;
            if (!view || !canvas || !view.width || !view.height) {
              reject(new Error('crop'));
              return;
            }
            const scale = Math.max(view.width / info.width, view.height / info.height);
            const ox = (info.width * scale - view.width) / 2;
            const oy = (info.height * scale - view.height) / 2;
            let sx = Math.round(ox / scale);
            let sy = Math.round(oy / scale);
            let sw = Math.round(view.width / scale);
            let sh = Math.round(view.height / scale);
            sx = Math.max(0, Math.min(sx, info.width - 1));
            sy = Math.max(0, Math.min(sy, info.height - 1));
            sw = Math.max(1, Math.min(sw, info.width - sx));
            sh = Math.max(1, Math.min(sh, info.height - sy));
            const outW = 856;
            const outH = Math.round(outW / RATIO);
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
