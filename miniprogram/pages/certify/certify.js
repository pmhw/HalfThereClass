const userService = require('../../services/user.js');
const config = require('../../config/index.js');
const util = require('../../utils/util.js');
const privacy = require('../../utils/privacy.js');

function isPdf(path) {
  return /\.pdf$/i.test(path || '');
}

function compressUpload(filePath) {
  if (isPdf(filePath) || !wx.compressImage) return Promise.resolve(filePath);
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: 60,
      compressedWidth: 1280,
      success: (res) => resolve((res && res.tempFilePath) || filePath),
      fail: () => resolve(filePath),
    });
  });
}

const ALL_NEED = {
  realName: true,
  idNumber: true,
  email: true,
  idCard: true,
  idCardBack: true,
  diploma: true,
  clearance: true,
  certificate: true,
};

function buildNeedFlags(cert) {
  const rejectFields = Array.isArray(cert.rejectFields) ? cert.rejectFields : [];
  const onlyClearance = cert.status === 'approved'
    && (!!cert.clearanceDue || cert.clearanceStatus === 'rejected');
  const onlyProfile = cert.status === 'approved' && !!cert.profileIncomplete && !onlyClearance;
  const partialEdit = (cert.status === 'rejected' || cert.clearanceStatus === 'rejected')
    && rejectFields.length > 0;
  const need = {
    realName: false,
    idNumber: false,
    email: false,
    idCard: false,
    idCardBack: false,
    diploma: false,
    clearance: false,
    certificate: false,
  };
  if (onlyClearance) {
    need.clearance = true;
  } else if (onlyProfile) {
    need.realName = true;
    need.idNumber = true;
    need.email = true;
  } else if (partialEdit) {
    rejectFields.forEach((key) => {
      if (key in need) need[key] = true;
    });
  } else if (cert.status !== 'approved') {
    Object.assign(need, ALL_NEED);
  }
  const showTextBlock = need.realName || need.idNumber || need.email;
  const showFileBlock = need.idCard || need.idCardBack || need.diploma || need.certificate;
  let idCardSubTip = '';
  if (need.idCard && need.idCardBack) idCardSubTip = '拍摄、相册或文件，正反面都要上传';
  else if (need.idCard) idCardSubTip = '请重新上传人像面';
  else if (need.idCardBack) idCardSubTip = '请重新上传国徽面';
  const rejectLabels = Array.isArray(cert.rejectFieldLabels) ? cert.rejectFieldLabels : [];
  const showRejectTip = !!(
    (cert.rejectReason && cert.status === 'rejected')
    || cert.clearanceStatus === 'rejected'
  );
  let submitLabel = '提交认证';
  if (cert.profileIncomplete) submitLabel = '保存身份信息';
  else if (partialEdit || onlyClearance) submitLabel = '提交修改';
  return {
    need,
    onlyClearance,
    onlyProfile,
    partialEdit,
    showTextBlock,
    showFileBlock,
    idCardSubTip,
    showRejectTip,
    rejectTipTitle: cert.status === 'rejected' ? '上次未通过' : '无犯罪证明未通过',
    rejectLabelsText: rejectLabels.join('、'),
    submitLabel,
  };
}

Page({
  data: {
    origin: config.origin,
    realName: '',
    idNumber: '',
    email: '',
    files: { idCard: '', idCardBack: '', diploma: '', clearance: '', certificate: '' },
    sources: { idCard: '', idCardBack: '', diploma: '', clearance: '', certificate: '' },
    previews: { idCard: '', idCardBack: '', diploma: '', clearance: '', certificate: '' },
    cert: { status: 'none' },
    step: 1,
    uploading: '',
    saving: false,
    padTop: 48,
    titleH: 32,
    side: 96,
    need: { ...ALL_NEED },
    onlyClearance: false,
    onlyProfile: false,
    partialEdit: false,
    showTextBlock: true,
    showFileBlock: true,
    idCardSubTip: '拍摄、相册或文件，正反面都要上传',
    showRejectTip: false,
    rejectTipTitle: '上次未通过',
    rejectLabelsText: '',
    submitLabel: '提交认证',
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

  back() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/my/my' });
  },

  onShow() {
    if (!util.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.refresh();
  },

  async refresh() {
    await this.load();
    const shot = this._shot;
    if (!shot) return;
    this._shot = null;
    this.upload(shot.key, shot.path);
  },

  onIdShot(data) {
    if (data && data.key && data.path) this._shot = data;
  },

  async load() {
    try {
      const cert = await userService.getCert();
      const step = cert.status === 'approved'
        && !cert.clearanceDue
        && !cert.clearancePending
        && !cert.profileIncomplete
        && cert.clearanceStatus !== 'rejected'
        ? 3
        : (cert.status === 'pending' || cert.clearancePending ? 2 : 1);
      const keep = this.data.files || {};
      const rejected = new Set(
        (cert.status === 'rejected' || cert.clearanceStatus === 'rejected')
          ? (Array.isArray(cert.rejectFields) ? cert.rejectFields : [])
          : [],
      );
      const keepFile = (key, remote) => {
        if (rejected.has(key) || (key === 'clearance' && cert.clearanceStatus === 'rejected')) {
          return keep[key] && keep[key] !== remote ? keep[key] : '';
        }
        return keep[key] || remote || '';
      };
      const files = {
        idCard: keepFile('idCard', cert.idCard),
        idCardBack: keepFile('idCardBack', cert.idCardBack),
        diploma: keepFile('diploma', cert.diploma),
        clearance: keepFile('clearance', cert.clearance),
        certificate: keepFile('certificate', cert.certificate),
      };
      const flags = buildNeedFlags(cert);
      const previews = { ...this.data.previews };
      ['idCard', 'idCardBack', 'diploma', 'clearance', 'certificate'].forEach((key) => {
        if (!files[key]) previews[key] = '';
      });
      this.setData({
        cert,
        step,
        realName: cert.realName || this.data.realName,
        idNumber: cert.idNumber || this.data.idNumber,
        email: cert.email || this.data.email,
        files,
        previews,
        sources: {
          idCard: util.assetUrl(files.idCard),
          idCardBack: util.assetUrl(files.idCardBack),
          diploma: util.assetUrl(files.diploma),
          clearance: util.assetUrl(files.clearance),
          certificate: util.assetUrl(files.certificate),
        },
        ...flags,
      });
    } catch (err) {
      console.error(err);
    }
  },

  goContract() {
    wx.navigateTo({ url: '/pages/contract/contract' });
  },

  onName(e) { this.setData({ realName: e.detail.value }); },
  onIdNumber(e) { this.setData({ idNumber: e.detail.value }); },
  onEmail(e) { this.setData({ email: e.detail.value }); },

  choose(e) {
    const key = e.currentTarget.dataset.key;
    const isId = key === 'idCard' || key === 'idCardBack';
    wx.showActionSheet({
      itemList: isId
        ? ['打开摄像头拍摄', '从相册选择', '选择文件']
        : ['拍照', '从相册选择', '选择文件'],
      success: (res) => {
        if (res.tapIndex === 0) this.useCamera(key, isId);
        else if (res.tapIndex === 1) this.pickImage(key, ['album']);
        else this.pickFile(key);
      },
    });
  },

  useCamera(key, isId) {
    const open = () => {
      if (isId) this.openIdCamera(key);
      else this.pickImage(key, ['camera']);
    };
    wx.authorize({
      scope: 'scope.camera',
      success: open,
      fail: (err) => {
        if (privacy.cancelled(err)) return;
        if (privacy.undeclared(err)) {
          privacy.explainUndeclared();
          return;
        }
        if (privacy.denied(err)) this.askOpenSetting(key, isId);
      },
    });
  },

  askOpenSetting(authKey, authIsId) {
    wx.showModal({
      title: '摄像头已被拒绝',
      content: '这是你之前拒绝了系统的摄像头允许框。请到设置里打开后再拍摄。',
      confirmText: '去设置',
      success: (res) => {
        if (!res.confirm) return;
        wx.openSetting({
          success: (setting) => {
            if (setting.authSetting && setting.authSetting['scope.camera']) {
              if (authIsId) this.openIdCamera(authKey);
              else this.pickImage(authKey, ['camera']);
            }
          },
        });
      },
    });
  },

  openIdCamera(key) {
    const side = key === 'idCardBack' ? 'emblem' : 'portrait';
    wx.navigateTo({
      url: `/pages/id-shot/id-shot?side=${side}&key=${key}`,
      fail: () => wx.showToast({ title: '无法打开拍摄页', icon: 'none' }),
    });
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
        if (privacy.cancelled(err)) return;
        if (privacy.undeclared(err)) {
          privacy.explainUndeclared();
          return;
        }
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
        if (privacy.cancelled(err)) return;
        if (privacy.undeclared(err)) {
          privacy.explainUndeclared();
          return;
        }
        wx.showToast({ title: '无法打开文件', icon: 'none' });
      },
    });
  },

  async upload(key, filePath) {
    const path = await compressUpload(filePath);
    this.setData({
      uploading: key,
      previews: { ...this.data.previews, [key]: /\.pdf$/i.test(path) ? '' : path },
    });
    try {
      const data = await userService.uploadCertFile(path);
      this.setData({
        files: { ...this.data.files, [key]: data.url },
        sources: { ...this.data.sources, [key]: util.assetUrl(data.url) },
        uploading: '',
      });
    } catch (err) {
      this.setData({ uploading: '', previews: { ...this.data.previews, [key]: '' } });
      wx.showToast({ title: err.message || '上传失败', icon: 'none' });
    }
  },

  async submit() {
    if (this.data.saving) return;
    const {
      realName, idNumber, email, files, need, partialEdit, onlyProfile,
    } = this.data;
    if (need.realName && !String(realName || '').trim()) {
      wx.showToast({ title: '请填写姓名', icon: 'none' });
      return;
    }
    if (need.idNumber && !/^[0-9]{17}[0-9Xx]$/.test(String(idNumber || '').trim())) {
      wx.showToast({ title: '请填写正确身份证号', icon: 'none' });
      return;
    }
    if (need.idCard && !files.idCard) {
      wx.showToast({ title: '请重新上传身份证人像面', icon: 'none' });
      return;
    }
    if (need.idCardBack && !files.idCardBack) {
      wx.showToast({ title: '请重新上传身份证国徽面', icon: 'none' });
      return;
    }
    if (need.diploma && !files.diploma) {
      wx.showToast({ title: '请重新上传学历证明', icon: 'none' });
      return;
    }
    if (need.clearance && !files.clearance) {
      wx.showToast({ title: '请重新上传无犯罪证明', icon: 'none' });
      return;
    }
    if (need.certificate && partialEdit && !files.certificate) {
      wx.showToast({ title: '请重新上传教师资格证', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await userService.submitCert({
        realName: String(realName || '').trim(),
        idNumber: String(idNumber || '').trim(),
        email: String(email || '').trim(),
        idCard: files.idCard,
        idCardBack: files.idCardBack,
        diploma: files.diploma,
        clearance: files.clearance,
        certificate: files.certificate,
      });
      wx.showToast({ title: onlyProfile ? '已保存' : '已提交，等待审核', icon: 'none' });
      await this.load();
    } catch (err) {
      console.error(err);
    } finally {
      this.setData({ saving: false });
    }
  },
});
