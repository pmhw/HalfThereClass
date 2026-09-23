<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>登记调课</span>
    </header>
    <form class="form card" @submit.prevent="submit">
      <label class="field">
        <span>课程</span>
        <select v-model.number="courseIndex">
          <option v-for="(c, i) in courses" :key="c.id" :value="i">{{ c.title }}</option>
        </select>
      </label>
      <label class="field">
        <span>类型</span>
        <select v-model.number="typeIndex">
          <option v-for="(t, i) in types" :key="t.value" :value="i">{{ t.label }}</option>
        </select>
      </label>
      <label class="field">
        <span>日期</span>
        <input v-model="date" type="date" required />
      </label>
      <label v-if="types[typeIndex].value === 'reschedule'" class="field">
        <span>调到日期</span>
        <input v-model="toDate" type="date" />
      </label>
      <label class="field">
        <span>开始时间</span>
        <input v-model="startTime" type="time" />
      </label>
      <label class="field">
        <span>结束时间</span>
        <input v-model="endTime" type="time" />
      </label>
      <label class="field">
        <span>备注</span>
        <textarea v-model="note" rows="3" placeholder="选填" />
      </label>
      <button class="btn btn-primary btn-block" type="submit">提交</button>
    </form>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adjustSchedule, getTeachingSchedule } from '../api';
import { showToast } from '../api/request';
import { requireLogin } from '../utils/helpers';

const route = useRoute();
const router = useRouter();
const presetId = Number(route.query.courseId || 0);

const courses = ref([]);
const courseIndex = ref(0);
const types = [
  { value: 'reschedule', label: '调课' },
  { value: 'add', label: '加课' },
  { value: 'cancel', label: '停课' },
  { value: 'observe', label: '听课' },
];
const typeIndex = ref(0);
const date = ref('');
const toDate = ref('');
const startTime = ref('');
const endTime = ref('');
const note = ref('');

if (requireLogin(router)) load();

watch(courseIndex, (idx) => {
  const c = courses.value[idx];
  if (c) {
    startTime.value = c.startTime || '';
    endTime.value = c.endTime || '';
  }
});

async function load() {
  try {
    const data = await getTeachingSchedule();
    const rows = Array.isArray(data) ? data : data?.list || [];
    courses.value = rows;
    let idx = 0;
    if (presetId) {
      const found = rows.findIndex((item) => item.id === presetId);
      if (found >= 0) idx = found;
    }
    courseIndex.value = idx;
    const current = rows[idx];
    if (current) {
      startTime.value = current.startTime || '';
      endTime.value = current.endTime || '';
    }
  } catch (err) {
    showToast(err.message || '加载课程失败');
  }
}

async function submit() {
  const course = courses.value[courseIndex.value];
  const type = types[typeIndex.value].value;
  if (!course || !date.value) {
    showToast('请选择课程和日期');
    return;
  }
  if (type === 'reschedule' && !toDate.value) {
    showToast('请选择调到哪一天');
    return;
  }
  try {
    await adjustSchedule({
      courseId: course.id,
      type,
      date: date.value,
      toDate: toDate.value,
      startTime: startTime.value,
      endTime: endTime.value,
      note: note.value,
    });
    showToast('课表已更新');
    setTimeout(() => router.back(), 600);
  } catch (err) {
    showToast(err.message || '提交失败');
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); }
.nav { display: flex; align-items: center; gap: calc(16 * var(--r)); margin-bottom: calc(24 * var(--r)); font-weight: 650; }
.back { color: #2563eb; }
.form { display: flex; flex-direction: column; gap: calc(20 * var(--r)); }
.field { display: flex; flex-direction: column; gap: calc(8 * var(--r)); }
.field span { color: #667085; font-size: calc(26 * var(--r)); }
.field select,
.field input,
.field textarea {
  width: 100%;
  padding: calc(16 * var(--r));
  border: 1px solid #e7edf5;
  border-radius: calc(12 * var(--r));
  background: #fff;
}
</style>
