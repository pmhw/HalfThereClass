<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>课程大厅</span>
      <router-link to="/search" class="search">搜索</router-link>
    </header>

    <div class="cats">
      <button
        v-for="cat in categories"
        :key="cat.id"
        type="button"
        class="cat"
        :class="{ on: currentCategory === cat.id }"
        @click="pickCategory(cat.id)"
      >
        {{ cat.name }}
      </button>
    </div>

    <div class="search-row">
      <input v-model="keyword" type="search" placeholder="搜索课程" @keyup.enter="loadCourses(true)" />
      <button type="button" class="btn btn-primary" @click="loadCourses(true)">搜索</button>
    </div>

    <div v-if="loading && !courseList.length" class="empty">加载中…</div>
    <div v-else-if="!courseList.length" class="empty">暂无课程</div>
    <div v-else class="list">
      <CourseCard
        v-for="course in courseList"
        :key="course.id"
        :course="course"
        @tap="openCourse"
      />
      <button v-if="!noMore" type="button" class="more" :disabled="loading" @click="loadCourses(false)">
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getCategories, getCourseList } from '../api';
import CourseCard from '../components/CourseCard.vue';

const router = useRouter();

const categories = ref([{ id: 0, name: '全部' }]);
const currentCategory = ref(0);
const keyword = ref('');
const courseList = ref([]);
const page = ref(1);
const noMore = ref(false);
const loading = ref(false);

onMounted(() => {
  loadCategories();
  loadCourses(true);
});

async function loadCategories() {
  try {
    const list = await getCategories();
    categories.value = [{ id: 0, name: '全部' }, ...(list || [])];
  } catch {
    /* ignore */
  }
}

async function loadCourses(refresh) {
  if (loading.value) return;
  if (!refresh && noMore.value) return;
  loading.value = true;
  const nextPage = refresh ? 1 : page.value;
  const params = { page: nextPage, pageSize: 10, sortBy: 'new' };
  if (currentCategory.value) params.categoryId = currentCategory.value;
  if (keyword.value.trim()) params.keyword = keyword.value.trim();
  try {
    const result = await getCourseList(params);
    const list = result.list || [];
    courseList.value = refresh ? list : courseList.value.concat(list);
    page.value = (result.pagination?.page || nextPage) + 1;
    noMore.value = (result.pagination?.page || 1) >= (result.pagination?.totalPages || 1);
  } catch {
    if (refresh) courseList.value = [];
  } finally {
    loading.value = false;
  }
}

function pickCategory(id) {
  currentCategory.value = id;
  loadCourses(true);
}

function openCourse(course) {
  router.push(`/course/${course.id}`);
}
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); }
.nav {
  display: flex;
  align-items: center;
  gap: calc(16 * var(--r));
  margin-bottom: calc(20 * var(--r));
  font-weight: 650;
}
.back { color: #2563eb; }
.search { margin-left: auto; color: #2563eb; font-size: calc(28 * var(--r)); font-weight: 500; }
.cats {
  display: flex;
  gap: calc(12 * var(--r));
  overflow-x: auto;
  margin-bottom: calc(20 * var(--r));
  padding-bottom: calc(8 * var(--r));
}
.cat {
  flex-shrink: 0;
  padding: calc(12 * var(--r)) calc(24 * var(--r));
  border-radius: calc(32 * var(--r));
  background: #fff;
  color: #667085;
  font-size: calc(26 * var(--r));
}
.cat.on { background: #2563eb; color: #fff; }
.search-row { display: flex; gap: calc(12 * var(--r)); margin-bottom: calc(20 * var(--r)); }
.search-row input {
  flex: 1;
  height: calc(72 * var(--r));
  padding: 0 calc(20 * var(--r));
  border: none;
  border-radius: calc(12 * var(--r));
  background: #fff;
}
.more {
  width: 100%;
  padding: calc(20 * var(--r));
  color: #2563eb;
  text-align: center;
}
.empty { text-align: center; color: #98a2b3; padding: calc(60 * var(--r)); }
</style>
