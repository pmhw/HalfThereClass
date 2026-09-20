const userService = require('../../services/user.js');
const config = require('../../config/index.js');
const util = require('../../utils/util.js');

function isPdf(path) {
  return /\.pdf$/i.test(path || '');
}

Page({
  data: {
    origin: config.origin,
    realName: '',
    files: { idCard: '', idCardBack: '', diploma: '', clearance: '', certificate: '' },
    cert: { status: 'none' },
    step: 1,
    uploading: '',
    saving: false,
  },

  onShow() {
    if (!util.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.load();
  },

  async load() {
    try {
      const cert = await userService.getCert();
      const step = cert.status === 'approved' && !cert.clearanceDue && !cert.clearancePending
        ? 3
        : (cert.status === 'pending' || cert.clearancePending ? 2 : 1);
      this.setData({
        cert,
        step,
        realName: cert.realName || this.data.realName,
        files: {
          idCard: cert.idCard || '',
          idCardBack: cert.idCardBack || '',
          diploma: cert.diploma || '',
          clearance: cert.clearanceStatus === 'rejected' ? '' : (cert.clearance || ''),
          certificate: cert.certificate || '',
        },
      });
    } catch (err) {
      console.error(err);
    }
  },

  goContract() {
    wx.navigateTo({ url: '/pages/contract/contract' });
  },

  onName(e) { this.setData({ realName: e.detail.value }); },

  choose(e) {
    const key = e.currentTarget.dataset.key;
    const isId = key === 'idCard' || key === 'idCardBack';
    wx.showActionSheet({
      itemList: isId
        ? ['打开摄像头拍摄', '从相册选择', '选择文件']
        : ['拍照', '从相册选择', '选择文件'],
      success: (res) => {
        if (res.tapIndex === 0) {
          if (isId) this.openIdCamera(key);
          else this.pickImage(key, ['camera']);
          return;
        }
        if (res.tapIndex === 1) {
          this.pickImage(key, ['album']);
          return;
        }
        this.pickFile(key);
      },
    });
  },

  openIdCamera(key) {
    const side = key === 'idCardBack' ? 'emblem' : 'portrait';
    const go = () => {
      wx.navigateTo({
        url: `/pages/id-shot/id-shot?side=${side}`,
        events: { done: (data) => data && data.path && this.upload(key, data.path) },
        fail: () => wx.showToast({ title: '无法打开拍摄页', icon: 'none' }),
      });
    };
    const auth = () => {
      wx.authorize({
        scope: 'scope.camera',
        success: go,
        fail: () => {
          wx.showModal({
            title: '需要打开摄像头',
            content: '拍摄身份证需要使用摄像头。请在设置里允许后重试。',
            confirmText: '去设置',
            success: (res) => {
              if (!res.confirm) return;
              wx.openSetting({
                success: (setting) => {
                  if (setting.authSetting['scope.camera']) go();
                },
              });
            },
          });
        },
      });
    };
    if (wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({ success: auth, fail: auth });
      return;
    }
    auth();
  },

  pickImage(key, sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType,
      sizeType: ['compressed'],
      success: (picked) => {
        const file = picked.tempFiles && picked.tempFiles[0];
        if (file && file.tempFilePath) this.upload(key, file.tempFilePath);
      },
      fail: (err) => {
        if (err && /cancel/i.test(err.errMsg || '')) return;
        wx.showToast({
          title: sourceType.indexOf('camera') >= 0 ? '无法打开摄像头' : '无法打开相册',
          icon: 'none',
        });
      },
    });
  },

  pickFile(key) {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'jpg', 'jpeg', 'png'],
      success: (picked) => {
        const file = picked.tempFiles && picked.tempFiles[0];
        if (file && file.path) this.upload(key, file.path);
      },
      fail: (err) => {
        if (err && /cancel/i.test(err.errMsg || '')) return;
        wx.showToast({ title: '无法打开文件', icon: 'none' });
      },
    });
  },

  async upload(key, filePath) {
    this.setData({ uploading: key });
    try {
      const data = await userService.uploadCertFile(filePath);
      this.setData({ files: { ...this.data.files, [key]: data.url }, uploading: '' });
    } catch (err) {
      this.setData({ uploading: '' });
      wx.showToast({ title: err.message || '上传失败', icon: 'none' });
    }
  },

  async submit() {
    if (this.data.saving) return;
    const { realName, files, cert } = this.data;
    const onlyClearance = cert.status === 'approved' && cert.clearanceDue;
    if (!onlyClearance && !realName.trim()) {
      wx.showToast({ title: '请填写姓名', icon: 'none' });
      return;
    }
    if (!onlyClearance && (!files.idCard || !files.idCardBack)) {
      wx.showToast({ title: '请上传身份证正反面', icon: 'none' });
      return;
    }
    if (!onlyClearance && !files.diploma) {
      wx.showToast({ title: '请上传学历证明', icon: 'none' });
      return;
    }
    if (!files.clearance) {
      wx.showToast({ title: '请上传无犯罪证明', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await userService.submitCert({
        realName: realName.trim(),
        idCard: files.idCard,
        idCardBack: files.idCardBack,
        diploma: files.diploma,
        clearance: files.clearance,
        certificate: files.certificate,
      });
      wx.showToast({ title: onlyClearance ? '已提交，等待审核' : '已提交，等待审核', icon: 'none' });
      await this.load();
    } catch (err) {
      console.error(err);
    } finally {
      this.setData({ saving: false });
    }
  },
});
