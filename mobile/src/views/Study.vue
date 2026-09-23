<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>{{ lesson?.title || '学习' }}</span>
    </header>
    <div v-if="loading" class="empty">加载中…</div>
    <template v-else-if="lesson">
      <p class="course">{{ courseTitle }}</p>
      <div class="player card">
        <div class="screen">{{ isPlaying ? '播放中' : '已暂停' }}</div>
        <div class="time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</div>
        <div class="bar">
          <div class="fill" :style="{ width: progressPct + '%' }" />
        </div>
        <button class="btn btn-primary" type="button" @click="togglePlay">
          {{ isPlaying ? '暂停' : '播放' }}
        </button>
      </div>
      <div class="card desc">
        <h3>课时简介</h3>
        <p>{{ lesson.description || '暂无简介' }}</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getLesson, postLessonProgress } from '../api';
import { showToast } from '../api/request';

const route = useRoute();
const router = useRouter();
const lessonId = Number(route.params.id);

const lesson = ref(null);
const courseTitle = ref('');
const loading = ref(true);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
let timer = null;

const progressPct = computed(() => {
  if (!duration.value) return 0;
  return Math.min(100, (currentTime.value / duration.value) * 100);
});

load();

async function load() {
  loading.value = true;
  try {
    const data = await getLesson(lessonId);
    lesson.value = data;
    duration.value = Number(data.duration) || 0;
    currentTime.value = Number(data.progress) || 0;
    courseTitle.value = data.course?.title || '';
  } catch (err) {
    showToast(err.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function formatTime(seconds) {
  const s = Math.floor(Number(seconds) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function togglePlay() {
  if (isPlaying.value) onPause();
  else onPlay();
}

function onPlay() {
  isPlaying.value = true;
  stopTimer();
  timer = setInterval(() => {
    if (currentTime.value < duration.value) {
      currentTime.value += 1;
      if (currentTime.value % 10 === 0) {
        postLessonProgress(lessonId, { progress: currentTime.value }).catch(() => {});
      }
    } else {
      onPause();
      postLessonProgress(lessonId, { progress: duration.value }).catch(() => {});
    }
  }, 1000);
}

function onPause() {
  isPlaying.value = false;
  stopTimer();
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

onUnmounted(() => {
  stopTimer();
  if (currentTime.value > 0) {
    postLessonProgress(lessonId, { progress: currentTime.value }).catch(() => {});
  }
});
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); }
.nav {
  display: flex;
  align-items: center;
  gap: calc(16 * var(--r));
  margin-bottom: calc(24 * var(--r));
  font-weight: 650;
}
.back { color: #2563eb; font-size: calc(30 * var(--r)); }
.course { color: #667085; margin: 0 0 calc(20 * var(--r)); }
.player { text-align: center; margin-bottom: calc(20 * var(--r)); }
.screen {
  height: calc(280 * var(--r));
  background: #111827;
  color: #fff;
  display: grid;
  place-items: center;
  border-radius: calc(12 * var(--r));
  margin-bottom: calc(16 * var(--r));
}
.time { color: #667085; margin-bottom: calc(12 * var(--r)); }
.bar {
  height: calc(8 * var(--r));
  background: #e7edf5;
  border-radius: calc(4 * var(--r));
  margin-bottom: calc(24 * var(--r));
  overflow: hidden;
}
.fill { height: 100%; background: #2563eb; }
.desc h3 { margin: 0 0 calc(12 * var(--r)); }
.desc p { margin: 0; color: #667085; line-height: 1.6; }
.empty { text-align: center; color: #98a2b3; padding: calc(80 * var(--r)); }
</style>
