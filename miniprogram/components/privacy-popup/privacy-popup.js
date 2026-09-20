Component({
  data: {
    show: false,
    name: '《用户隐私保护指引》',
  },
  lifetimes: {
    attached() {
      const app = getApp();
      app.privacyHandler = (resolve) => {
        this._resolve = resolve;
        if (!wx.getPrivacySetting) {
          this.setData({ show: true });
          return;
        }
        wx.getPrivacySetting({
          success: (res) => {
            this.setData({
              show: true,
              name: (res && res.privacyContractName) || this.data.name,
            });
          },
          fail: () => this.setData({ show: true }),
        });
      };
    },
    detached() {
      const app = getApp();
      if (app.privacyHandler) app.privacyHandler = null;
    },
  },
  methods: {
    noop() {},
    openContract() {
      if (wx.openPrivacyContract) wx.openPrivacyContract();
    },
    onAgree() {
      const resolve = this._resolve;
      this._resolve = null;
      this.setData({ show: false });
      if (resolve) resolve({ buttonId: 'privacy-agree-btn', event: 'agree' });
    },
    onRefuse() {
      const resolve = this._resolve;
      this._resolve = null;
      this.setData({ show: false });
      if (resolve) resolve({ event: 'disagree' });
    },
  },
});
