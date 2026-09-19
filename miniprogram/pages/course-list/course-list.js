const courseService = require('../../services/course.js');
const categoryService = require('../../services/category.js');

Page({
  data: {
    categories: [{ id: 0, name: '全部' }],
    currentCategory: 0,
    keyword: '',
    courseList: [],
    page: 1,
    noMore: false,
    loading: false,
  },

  onLoad() {
    this.loadCategories();
    this.loadCourses(true);
  },

  async loadCategories() {
    try {
      const categories = await categoryService.getCategoryList();
      this.setData({ categories: [{ id: 0, name: '全部' }, ...categories] });
    } catch (err) {
      console.error(err);
    }
  },

  async loadCourses(refresh = false) {
    if (this.data.loading) return;
    if (!refresh && this.data.noMore) return;
    this.setData({ loading: true });
    const page = refresh ? 1 : this.data.page;
    const params = { page, pageSize: 10, sortBy: 'new' };
    if (this.data.currentCategory) params.categoryId = this.data.currentCategory;
    if (this.data.keyword) params.keyword = this.data.keyword;
    try {
      const result = await courseService.getCourseList(params);
      const courseList = refresh ? result.list : this.data.courseList.concat(result.list);
      this.setData({
        courseList,
        page: result.pagination.page + 1,
        noMore: result.pagination.page >= result.pagination.totalPages,
      });
    } catch (err) {
      console.error(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onCategoryTap(e) {
    this.setData({ currentCategory: Number(e.currentTarget.dataset.id) || 0 }, () => this.loadCourses(true));
  },

  onInput(e) { this.setData({ keyword: e.detail.value }); },
  onSearch() { this.loadCourses(true); },
  onReachBottom() { this.loadCourses(false); },
});
