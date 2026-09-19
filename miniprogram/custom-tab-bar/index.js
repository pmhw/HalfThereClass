Component({
  data: {
    selected: 0,
    pillLeft: 'calc(0% + 6rpx)',
    pillWidth: 'calc(25% - 12rpx)',
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: '/images/tab-home.png', iconActive: '/images/tab-home-active.png' },
      { pagePath: '/pages/schedule/schedule', text: '课表', icon: '/images/tab-cal.png', iconActive: '/images/tab-cal-active.png' },
      { pagePath: '/pages/teaching/teaching', text: '授课', icon: '/images/tab-teach.png', iconActive: '/images/tab-teach-active.png' },
      { pagePath: '/pages/my/my', text: '我的', icon: '/images/tab-my.png', iconActive: '/images/tab-my-active.png' },
    ],
  },
  methods: {
    setSelected(index) {
      const count = this.data.list.length || 1;
      const current = Math.min(Math.max(0, index), count - 1);
      this.setData({
        selected: current,
        pillLeft: `calc(${(current * 100) / count}% + 6rpx)`,
        pillWidth: `calc(${100 / count}% - 12rpx)`,
      });
    },
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item || index === this.data.selected) return;
      this.setSelected(index);
      wx.switchTab({ url: item.pagePath });
    },
  },
});
