const { get } = require('../../utils/request.js');

Page({
  data: { list: [], total: '', count: 0 },
  onShow() {
    get('/teacher/incomes').then((list) => {
      const rows = list || [];
      const shown = rows.filter((item) => item.showFee);
      const sum = shown.reduce((acc, item) => acc + Number(item.teacherFee || 0), 0);
      this.setData({
        list: rows,
        count: rows.length,
        total: shown.length ? sum.toFixed(2) : '',
      });
    }).catch(() => {});
  },
});
