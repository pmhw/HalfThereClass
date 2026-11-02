const userService = require('../../services/user.js');
const config = require('../../config/index.js');
const util = require('../../utils/util.js');
const { renderMarkdown } = require('../../utils/markdown.js');

const GENDER_OPTIONS = ['请选择', '男', '女'];

function emptyForm() {
  return {
    name: '',
    gender: '',
    ethnicity: '',
    birthday: '',
    idNumber: '',
    address: '',
    contactAddress: '',
    email: '',
    bankName: '',
    bankAccountName: '',
    bankAccount: '',
  };
}

Page({
  data: {
    origin: config.origin,
    signUrl: '',
    paper: { title: '教师服务合同', status: 'none', signed: false, history: [], partyA: {} },
    html: '',
    identity: { hasPhotos: false, ocrStatus: 'none', fields: {}, idCard: '', idCardBack: '', ocrError: '' },
    form: emptyForm(),
    genderOptions: GENDER_OPTIONS,
    genderIndex: 0,
    step: 1,
    resume: null,
    showResume: false,
    ocrRunning: false,
    viewPhotos: false,
    previewOk: false,
    agreed: false,
    drew: false,
    saving: false,
    loaded: false,
    wrongTeacher: false,
    missName: false,
    missId: false,
    missAddress: false,
  },

  onShow() {
    if (!util.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const pages = getCurrentPages();
    const cur = pages[pages.length - 1];
    const expectId = Number((cur && cur.options && cur.options.for) || 0);
    const me = wx.getStorageSync('userInfo') || {};
    if (expectId && me.id && Number(me.id) !== expectId) {
      this.setData({
        loaded: true,
        wrongTeacher: true,
        paper: { title: '教师服务合同', status: 'none', signed: false, history: [], partyA: {} },
      });
      return;
    }
    this.setData({ wrongTeacher: false });
    this.load();
  },

  bindCanvas() {
    this.ctx = wx.createCanvasContext('sign', this);
    this.paint();
  },

  paint() {
    if (!this.ctx) return;
    this.ctx.setStrokeStyle('#111827');
    this.ctx.setLineWidth(3);
    this.ctx.setLineCap('round');
    this.ctx.setLineJoin('round');
  },

  cacheKey(semesterId) {
    return `contract-draft:v1:${semesterId || 0}`;
  },

  writeLocal() {
    try {
      wx.setStorageSync(this.cacheKey(this.data.paper.semesterId), {
        step: this.data.step,
        form: this.data.form,
        previewOk: this.data.previewOk,
      });
    } catch (err) { /* ignore */ }
  },

  readLocal(semesterId) {
    try {
      return wx.getStorageSync(this.cacheKey(semesterId)) || null;
    } catch (err) {
      return null;
    }
  },

  applyIdentity(fields) {
    const form = { ...this.data.form };
    form.name = fields.name || form.name || '';
    form.gender = fields.gender || form.gender || '';
    form.ethnicity = fields.ethnicity || form.ethnicity || '';
    form.birthday = fields.birthday || form.birthday || '';
    form.idNumber = fields.idNumber || form.idNumber || '';
    form.address = fields.address || form.address || '';
    this.setData({
      form,
      genderIndex: Math.max(0, GENDER_OPTIONS.indexOf(form.gender || '请选择')),
    });
    this.refreshMiss();
  },

  refreshMiss() {
    const partial = this.data.identity.ocrStatus === 'partial';
    const form = this.data.form;
    this.setData({
      missName: partial && !String(form.name || '').trim(),
      missId: partial && !String(form.idNumber || '').trim(),
      missAddress: partial && !String(form.address || '').trim(),
    });
  },

  async load() {
    try {
      const paper = await userService.getContract();
      const identity = paper.identity || this.data.identity;
      const draft = paper.draft || {};
      const serverForm = (draft && draft.formData) || {};
      const form = emptyForm();
      const fields = (identity && identity.fields) || {};
      form.name = (serverForm.identity && serverForm.identity.name) || fields.name || '';
      form.gender = (serverForm.identity && serverForm.identity.gender) || fields.gender || '';
      form.ethnicity = (serverForm.identity && serverForm.identity.ethnicity) || fields.ethnicity || '';
      form.birthday = (serverForm.identity && serverForm.identity.birthday) || fields.birthday || '';
      form.idNumber = (serverForm.identity && serverForm.identity.idNumber) || fields.idNumber || '';
      form.address = (serverForm.identity && serverForm.identity.address) || fields.address || '';
      form.contactAddress = serverForm.contactAddress || '';
      form.email = serverForm.email || '';
      form.bankName = serverForm.bankName || paper.bankName || '';
      form.bankAccountName = serverForm.bankAccountName || paper.bankAccountName || form.name || '';
      form.bankAccount = serverForm.bankAccount || paper.bankAccount || '';
      const local = this.readLocal(paper.semesterId);
      if (local && local.form) Object.assign(form, local.form);
      const step = Math.min(3, Math.max(1, Number((draft && draft.step) || (local && local.step) || 1)));
      this.setData({
        paper: { ...paper, history: paper.history || [], partyA: paper.partyA || {} },
        identity: {
          ...identity,
          idCard: util.assetUrl(identity.idCard || ''),
          idCardBack: util.assetUrl(identity.idCardBack || ''),
        },
        form,
        genderIndex: Math.max(0, GENDER_OPTIONS.indexOf(form.gender || '请选择')),
        signUrl: util.assetUrl(paper.sign || ''),
        html: renderMarkdown(paper.content),
        resume: paper.resume || null,
        showResume: !!(paper.contractDue && paper.resume && ['step1', 'step2', 'step3'].includes(paper.resume.kind)),
        step,
        previewOk: !!(serverForm.previewConfirmed || (local && local.previewOk)),
        loaded: true,
        drew: false,
      });
      this.refreshMiss();
      if (paper.contractDue && identity.hasPhotos && ['none', 'failed', 'processing'].includes(identity.ocrStatus || 'none')) {
        await this.retryOcr(false);
      }
      if (this.data.step === 3) this.bindCanvas();
    } catch (err) {
      console.error(err);
      this.setData({ loaded: true });
    }
  },

  continueResume() {
    const step = Number((this.data.resume && this.data.resume.step) || this.data.step || 1);
    this.setData({ showResume: false, step });
    if (step === 3) this.bindCanvas();
  },

  onField(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
    this.refreshMiss();
    this.writeLocal();
  },

  onGender(e) {
    const index = Number(e.detail.value) || 0;
    const gender = index === 0 ? '' : GENDER_OPTIONS[index];
    this.setData({ genderIndex: index, 'form.gender': gender });
    this.writeLocal();
  },

  onBirthday(e) {
    this.setData({ 'form.birthday': e.detail.value });
    this.writeLocal();
  },

  togglePhotos() {
    this.setData({ viewPhotos: !this.data.viewPhotos });
  },

  togglePreview() {
    this.setData({ previewOk: !this.data.previewOk });
    this.writeLocal();
  },

  backToFill() {
    this.setData({ step: 1 });
    this.writeLocal();
  },

  async retryOcr(force) {
    this.setData({ ocrRunning: true });
    try {
      const data = await userService.runContractOcr(force !== false);
      this.setData({
        identity: {
          ...data,
          idCard: util.assetUrl(data.idCard || ''),
          idCardBack: util.assetUrl(data.idCardBack || ''),
        },
      });
      this.applyIdentity(data.fields || {});
      if (data.ocrStatus === 'success') wx.showToast({ title: '身份证信息已自动识别，请核对', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '识别失败', icon: 'none' });
    } finally {
      this.setData({ ocrRunning: false });
    }
  },

  async requestManual() {
    try {
      const data = await userService.requestContractManualReview('教师申请人工处理');
      this.setData({ identity: { ...data, idCard: util.assetUrl(data.idCard || ''), idCardBack: util.assetUrl(data.idCardBack || '') } });
      wx.showToast({ title: '已提交人工处理', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    }
  },

  formPayload() {
    const form = this.data.form;
    return {
      identity: {
        name: form.name,
        gender: form.gender,
        ethnicity: form.ethnicity,
        birthday: form.birthday,
        idNumber: form.idNumber,
        address: form.address,
      },
      contactAddress: form.contactAddress,
      email: form.email,
      bankName: String(form.bankName || '').trim(),
      bankAccountName: String(form.bankAccountName || '').trim(),
      bankAccount: String(form.bankAccount || '').trim().replace(/[\s\-]/g, ''),
      previewConfirmed: this.data.previewOk,
    };
  },

  canAdvance() {
    const form = this.data.form;
    const bankOk = !!(String(form.bankName || '').trim() && String(form.bankAccountName || '').trim() && String(form.bankAccount || '').trim());
    return !!(this.data.identity.hasPhotos
      && String(form.name || '').trim()
      && /^[0-9]{17}[0-9Xx]$/.test(form.idNumber || '')
      && String(form.address || '').trim()
      && bankOk);
  },

  async saveDraft(silent) {
    this.setData({ saving: true });
    try {
      const res = await userService.saveContractDraft({
        step: this.data.step,
        flowStatus: this.data.step === 1 ? 'filling' : this.data.step === 2 ? 'preview' : 'waiting_signature',
        formData: this.formPayload(),
      });
      if (res && res.identity) {
        this.setData({
          identity: {
            ...res.identity,
            idCard: util.assetUrl(res.identity.idCard || ''),
            idCardBack: util.assetUrl(res.identity.idCardBack || ''),
          },
        });
      }
      this.writeLocal();
      if (res && res.blockedByManualReview) {
        wx.showToast({ title: '核心身份信息已变更，已转人工确认', icon: 'none' });
        return false;
      }
      if (!silent) wx.showToast({ title: '草稿已保存', icon: 'none' });
      return true;
    } catch (err) {
      if (!silent) wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      return false;
    } finally {
      this.setData({ saving: false });
    }
  },

  saveDraftTap() {
    this.saveDraft(false);
  },

  async goPreview() {
    if (!this.canAdvance()) {
      const form = this.data.form;
      if (!String(form.bankName || '').trim() || !String(form.bankAccountName || '').trim() || !String(form.bankAccount || '').trim()) {
        wx.showToast({ title: '请填写收款开户行、收款名与银行账号', icon: 'none' });
        return;
      }
      wx.showToast({ title: '请完整填写姓名、身份证号、住址', icon: 'none' });
      return;
    }
    const ok = await this.saveDraft(true);
    if (!ok) return;
    this.setData({ saving: true });
    try {
      await userService.advanceContractPreview();
      const data = await userService.getContract();
      this.setData({
        step: 2,
        paper: { ...this.data.paper, ...data, history: data.history || [], partyA: data.partyA || {} },
        html: renderMarkdown(data.content),
      });
      this.writeLocal();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '无法进入预览', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async goSign() {
    if (!this.data.previewOk) return;
    const ok = await this.saveDraft(true);
    if (!ok) return;
    this.setData({ saving: true });
    try {
      await userService.confirmContractPreview();
      this.setData({ step: 3, drew: false });
      this.writeLocal();
      setTimeout(() => this.bindCanvas(), 50);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '无法进入签字', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
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
    if (!this.moved && this.last && this.ctx) {
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
      if (!this.ctx) this.bindCanvas();
      this.ctx.clearRect(0, 0, width, height);
      this.ctx.draw();
      this.setData({ drew: false });
    }).exec();
  },

  goCert() { wx.navigateTo({ url: '/pages/certify/certify' }); },

  async exportPdf(e) {
    const id = e?.currentTarget?.dataset?.id;
    const token = wx.getStorageSync('token') || '';
    const query = id ? `?id=${id}` : '';
    wx.showLoading({ title: '导出中', mask: true });
    wx.downloadFile({
      url: `${config.baseUrl}/user/contract/export-file${query}`,
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: async (res) => {
        wx.hideLoading();
        if (res.statusCode >= 400 || !res.tempFilePath) {
          this.exportPdfFallback(id);
          return;
        }
        let openPath = res.tempFilePath;
        try {
          const fs = wx.getFileSystemManager();
          const dest = `${wx.env.USER_DATA_PATH}/教师服务合同-${id || 'export'}.html`;
          fs.copyFileSync(res.tempFilePath, dest);
          openPath = dest;
        } catch (err) { /* 使用原路径 */ }
        wx.openDocument({
          filePath: openPath,
          fileType: 'html',
          showMenu: true,
          success: () => {
            wx.showToast({ title: '打开后可转发，用浏览器打印为 PDF', icon: 'none', duration: 2800 });
          },
          fail: () => this.exportPdfFallback(id),
        });
      },
      fail: () => {
        wx.hideLoading();
        this.exportPdfFallback(id);
      },
    });
  },

  async exportPdfFallback(id) {
    try {
      const data = await userService.exportContract(id);
      const fs = wx.getFileSystemManager();
      const path = `${wx.env.USER_DATA_PATH}/教师服务合同-${data.id || 'latest'}.html`;
      fs.writeFileSync(path, data.html || '', 'utf8');
      wx.openDocument({
        filePath: path,
        fileType: 'html',
        showMenu: true,
        success: () => {
          wx.showToast({ title: '打开后可转发，用浏览器打印为 PDF', icon: 'none', duration: 2800 });
        },
        fail: () => {
          wx.setClipboardData({
            data: `${config.origin}/m/contract`,
            success: () => wx.showToast({
              title: '本机无法预览，已复制手机网页链接，浏览器打开后可导出 PDF',
              icon: 'none',
              duration: 3000,
            }),
          });
        },
      });
    } catch (err) {
      wx.showToast({ title: err.message || '导出失败', icon: 'none' });
    }
  },

  async submit() {
    if (this.data.saving) return;
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
          const result = await userService.signContract(res.tempFilePath);
          try { wx.removeStorageSync(this.cacheKey(this.data.paper.semesterId)); } catch (err) { /* ignore */ }
          wx.showToast({ title: result?.message || '已提交审核', icon: 'none' });
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
