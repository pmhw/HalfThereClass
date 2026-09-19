// components/progress-bar/progress-bar.js
Component({
  properties: {
    percent: {
      type: Number,
      value: 0,
    },
    color: {
      type: String,
      value: '#ff6b35',
    },
    bgColor: {
      type: String,
      value: '#eeeeee',
    },
    height: {
      type: Number,
      value: 8, // rpx
    },
    showText: {
      type: Boolean,
      value: false,
    },
  },
});
