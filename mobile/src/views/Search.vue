<template>
  <div class="page safe-bottom">
    <div class="search-bar">
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索课程"
        @keyup.enter="onSearch"
      />
      <button type="button" class="cancel" @click="router.back()">取消</button>
    </div>

    <template v-if="!isSearched">
      <div v-if="historyList.length" class="block">
        <div class="head">
          <span>搜索历史</span>
          <button type="button" class="link" @click="clearHistory">清空</button>
        </div>
        <div class="chips">
          <button
            v-for="item in historyList"
            :key="item"
            type="button"
            class="chip"
            @click="searchKeyword(item)"
          >
            {{ item }}
          </button>
        </div>
      </div>
      <div class="block">
        <div class="head"><span>热门搜索</span></div>
        <div class="chips">
          <button
            v-for="item in hotList"
            :key="item"
            type="button"
            class="chip hot"
            @click="searchKeyword(item)"
          >
            {{ item }}
          </button>
        </div>
      </div>
    </template>

    <div v-else-if="loading" class="empty">搜索中…</div>
    <div v-else-if="!courseList.length" class="empty">未找到相关课程</div>
    <div v-else class="results">
      <CourseCard
        v-for="course in courseList"
        :key="course.id"
        :course="course"
        @tap="openCourse"
      />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getCourseList } from '../api';
import CourseCard from '../components/CourseCard.vue';

const HISTORY_KEY = 'search_history';

const router = useRouter();
const keyword = ref('');
const historyList = ref([]);
const hotList = ['Python入门', '前端开发', '数据分析', '职场技能', '设计基础'];
const courseList = ref([]);
const isSearched = ref(false);
const loading = ref(false);

onMounted(loadHistory);

function loadHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    historyList.value = history.slice(0, 10);
  } catch {
    historyList.value = [];
  }
}

function saveHistory(text) {
  let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  history = history.filter((k) => k !== text);
  history.unshift(text);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  historyList.value = history.slice(0, 10);
}

function searchKeyword(text) {
  keyword.value = text;
  onSearch();
}

async function onSearch() {
  const q = String(keyword.value || '').trim();
  if (!q) return;
  loading.value = true;
  isSearched.value = true;
  saveHistory(q);
  try {
    const result = await getCourseList({ keyword: q, page: 1, pageSize: 20 });
    courseList.value = result.list || [];
  } catch {
    courseList.value = [];
  } finally {
    loading.value = false;
  }
}

function clearHistory() {
  if (!window.confirm('确定清空搜索历史？')) return;
  localStorage.removeItem(HISTORY_KEY);
  historyList.value = [];
}

function openCourse(course) {
  router.push(`/course/${course.id}`);
}
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); }
.search-bar { display: flex; gap: calc(16 * var(--r)); align-items: center; margin-bottom: calc(32 * var(--r)); }
.search-bar input {
  flex: 1;
  height: calc(72 * var(--r));
  padding: 0 calc(24 * var(--r));
  border: none;
  border-radius: calc(36 * var(--r));
  background: #fff;
}
.cancel { color: #2563eb; flex-shrink: 0; }
.block { margin-bottom: calc(32 * var(--r)); }
.head { display: flex; justify-content: space-between; margin-bottom: calc(16 * var(--r)); color: #667085; }
.link { color: #2563eb; font-size: calc(26 * var(--r)); }
.chips { display: flex; flex-wrap: wrap; gap: calc(16 * var(--r)); }
.chip {
  padding: calc(12 * var(--r)) calc(24 * var(--r));
  background: #fff;
  border-radius: calc(32 * var(--r));
  color: #344054;
  font-size: calc(26 * var(--r));
}
.chip.hot { background: #eef4ff; color: #2563eb; }
.empty { text-align: center; color: #98a2b3; padding: calc(60 * var(--r)); }
</style>
