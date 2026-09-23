<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>课程签到</span>
    </header>
    <div v-if="!info" class="empty">加载中…</div>
    <template v-else>
      <h2 class="title">{{ info.title }}</h2>
      <p class="meta">{{ info.school }} · {{ info.classroom || '教室待定' }}</p>
      <p class="meta">{{ info.date }} {{ info.startTime }} - {{ info.endTime }}</p>
      <button
        type="button"
        class="circle"
        :class="{ done: info.checkedIn }"
        :disabled="info.checkedIn"
        @click="onCheckIn"
      >
        <span v-if="info.checkedIn">已签到</span>
        <span v-else>签到</span>
      </button>
      <p class="hint">{{ info.checkedIn ? '今日已完成签到' : '请在上课前完成签到' }}</p>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { checkIn, getCheckIn } from '../api';
import { showToast } from '../api/request';
import { requireLogin } from '../utils/helpers';

const route = useRoute();
const router = useRouter();
const courseId = Number(route.query.id);
const info = ref(null);

if (requireLogin(router)) load();

async function load() {
  try {
    info.value = await getCheckIn(courseId);
  } catch (err) {
    showToast(err.message || '加载失败');
  }
}

async function onCheckIn() {
  if (info.value?.checkedIn) return;
  try {
    await checkIn(courseId);
    showToast('签到成功');
    await load();
  } catch (err) {
    showToast(err.message || '签到失败');
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: calc(24 * var(--r));
  background: var(--bg-color);
  text-align: center;
}
.nav { display: flex; align-items: center; gap: calc(16 * var(--r)); margin-bottom: calc(40 * var(--r)); font-weight: 650; text-align: left; }
.back { color: #2563eb; }
.title { margin: 0 0 calc(12 * var(--r)); font-size: calc(36 * var(--r)); }
.meta { color: #667085; margin: calc(8 * var(--r)) 0; }
.circle {
  width: calc(280 * var(--r));
  height: calc(280 * var(--r));
  margin: calc(60 * var(--r)) auto calc(24 * var(--r));
  border-radius: 50%;
  background: linear-gradient(180deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: calc(40 * var(--r));
  font-weight: 700;
  box-shadow: 0 calc(16 * var(--r)) calc(40 * var(--r)) rgba(37, 99, 235, 0.35);
}
.circle.done { background: #d0d5dd; box-shadow: none; }
.hint { color: #98a2b3; }
.empty { padding: calc(80 * var(--r)); color: #98a2b3; }
</style>
