// pages/study/study.js
const lessonService = require('../../services/lesson.js');
const util = require('../../utils/util.js');

Page({
  data: {
    lessonId: 0,
    courseId: 0,
    lesson: null,
    courseTitle: '',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    progressTimer: null,
  },

  onLoad(options) {
    this.setData({
      lessonId: Number(options.lessonId),
      courseId: Number(options.courseId),
    });
    this.loadLessonDetail();
  },

  async loadLessonDetail() {
    try {
      const lesson = await lessonService.getLessonDetail(this.data.lessonId);
      this.setData({
        lesson,
        duration: lesson.duration,
        currentTime: lesson.progress || 0,
        courseTitle: lesson.course.title,
      });
      wx.setNavigationBarTitle({ title: lesson.title });
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
    }
  },

  // 模拟播放（真实项目用 video 组件）
  onPlay() {
    this.setData({ isPlaying: true });
    this.startProgressTimer();
  },

  onPause() {
    this.setData({ isPlaying: false });
    this.stopProgressTimer();
  },

  startProgressTimer() {
    this.stopProgressTimer();
    const timer = setInterval(() => {
      let { currentTime, duration, lessonId } = this.data;
      if (currentTime < duration) {
        currentTime += 1;
        this.setData({ currentTime });
        // 每 10 秒上报一次进度
        if (currentTime % 10 === 0) {
          lessonService.updateProgress(lessonId, currentTime).catch(() => {});
        }
      } else {
        this.onPause();
        lessonService.updateProgress(lessonId, duration).catch(() => {});
      }
    }, 1000);
    this.setData({ progressTimer: timer });
  },

  stopProgressTimer() {
    if (this.data.progressTimer) {
      clearInterval(this.data.progressTimer);
      this.setData({ progressTimer: null });
    }
  },

  onUnload() {
    this.stopProgressTimer();
    // 离开页面时上报最终进度
    if (this.data.currentTime > 0) {
      lessonService
        .updateProgress(this.data.lessonId, this.data.currentTime)
        .catch(() => {});
    }
  },

  formatTime(seconds) {
    return util.formatDuration(seconds);
  },
});
