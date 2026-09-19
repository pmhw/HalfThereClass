// components/lesson-item/lesson-item.js
Component({
  properties: {
    lesson: {
      type: Object,
      value: {},
    },
    // 状态：locked, free, unlocked, completed
    status: {
      type: String,
      value: 'unlocked',
    },
  },

  methods: {
    onTap() {
      this.triggerEvent('tap', { lesson: this.properties.lesson });
    },
  },
});
