// pages/comment/comment.js
const commentService = require('../../services/comment.js');
const util = require('../../utils/util.js');

Page({
  data: {
    courseId: 0,
    rating: 5,
    content: '',
    images: [],
    isAnonymous: false,
    submitting: false,
  },

  onLoad(options) {
    this.setData({ courseId: Number(options.courseId) });
    if (!util.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
    }
  },

  onRatingTap(e) {
    const rating = e.currentTarget.dataset.rating;
    this.setData({ rating });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onAnonymousChange(e) {
    this.setData({ isAnonymous: e.detail.value });
  },

  // 添加图片
  onAddImage() {
    const remain = 9 - this.data.images.length;
    if (remain <= 0) return;

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = res.tempFiles.map((f) => f.tempFilePath);
        this.setData({
          images: [...this.data.images, ...files].slice(0, 9),
        });
      },
    });
  },

  // 删除图片
  onDeleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    images.splice(index, 1);
    this.setData({ images });
  },

  // 提交评价
  async onSubmit() {
    const { courseId, rating, content, images, isAnonymous } = this.data;

    if (rating === 0) {
      wx.showToast({ title: '请选择评分', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      await commentService.createComment({
        courseId,
        rating,
        content,
        images: [], // 实际项目中需要先上传图片再提交 URL
        isAnonymous,
      });

      wx.showToast({ title: '评价成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
