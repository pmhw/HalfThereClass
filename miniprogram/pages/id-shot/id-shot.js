const RATIO = 856 / 540;

Page({
  data: {
    side: 'portrait',
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
    const info = wx.getWindowInfo();
    const menu = wx.getMenuButtonBoundingClientRect();
    const winW = info.windowWidth;
    const winH = info.windowHeight;
    const frameW = winW - 48;
    const frameH = Math.round(frameW / RATIO);
    const left = Math.round((winW - frameW) / 2);
    const top = Math.round((winH - frameH) / 2 - 24);
    this.channel = this.getOpenerEventChannel();
    this.setData({
      side: query.side === 'emblem' ? 'emblem' : 'portrait',
      padTop: menu.top || info.statusBarHeight || 24,
      navH: menu.height || 32,
      winW,
      winH,
      dock: 36 + (info.screenHeight - info.safeArea.bottom || 0),
      shutterLeft: Math.round((winW - 74) / 2),
      frame: { left, top, w: frameW, h: frameH },
    });
    this.askCamera();
  },

  askCamera() {
    const open = () => this.setData({ phase: 'cam' });
    const auth = () => {
      wx.authorize({
        scope: 'scope.camera',
        success: open,
        fail: () => this.onCamError(),
      });
    };
    if (wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({ success: auth, fail: () => this.onCamError() });
      return;
    }
    auth();
  },

  back() { wx.navigateBack(); },

  onCamError() {
    wx.showModal({
      title: '无法打开相机',
      content: '请允许使用摄像头后，再对齐拍摄身份证',
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
          if (this.channel && this.channel.emit) this.channel.emit('done', { path: file.path });
          wx.navigateBack();
          return;
        }
        this.setData({ phase: 'preview', preview: file.path });
      },
      fail: (err) => {
        if (err && /cancel/i.test(err.errMsg || '')) return;
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
    if (this.channel && this.channel.emit) this.channel.emit('done', { path: this.data.preview });
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
