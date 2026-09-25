<template>
  <div v-if="course" class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>课程详情</span>
      <button type="button" class="share" @click="copyLink">复制链接</button>
    </header>

    <div class="banner">{{ initial }}</div>
    <div class="main card">
      <div class="title">{{ course.title }}</div>
      <div class="rate">★ {{ course.rating || '暂无评分' }}</div>
      <div class="line">适合 {{ course.gradeLabel || '不限' }}</div>
      <div v-if="course.startTime" class="line">{{ week }} {{ course.startTime }}-{{ course.endTime }}</div>
      <div class="line">{{ course.school || '学校待定' }} {{ course.classroom || '' }}</div>
      <div class="line">教师：{{ course.teacherName || '待安排' }}</div>
      <div v-if="course.showPrice" class="price">{{ course.priceLabel }} ¥{{ course.coursePrice }}</div>
    </div>

    <div class="card block">
      <div class="h">课程介绍</div>
      <p class="p">{{ course.description || '暂无介绍' }}</p>
    </div>

    <div class="bar">
      <template v-if="waiting">
        <button class="btn btn-block" type="button" disabled>距开抢 {{ countdown }}</button>
        <button class="btn btn-primary btn-block remind" type="button" @click="addCalendar">下载日历提醒 (.ics)</button>
      </template>
      <button v-else-if="course.canGrab" class="btn btn-primary btn-block" type="button" @click="onGrab">
        立即抢课
      </button>
      <div v-else-if="course.isMine" class="bar-row">
        <button class="btn btn-block" type="button" @click="goAdjust">登记调课</button>
        <button class="btn btn-block" type="button" disabled>过时默认已上</button>
      </div>
      <button v-else-if="course.teacherId" class="btn btn-block" type="button" disabled>已安排老师</button>
      <button
        v-else-if="course.certified && !course.contractSigned"
        class="btn btn-primary btn-block"
        type="button"
        @click="goContract"
      >
        签订合同后抢课
      </button>
      <button v-else class="btn btn-primary btn-block" type="button" @click="onGrab">认证后抢课</button>
    </div>
  </div>
</template>

<script setup>
import { onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getCourseDetail, grabCourse } from '../api';
import { showToast } from '../api/request';
import { countdownText, requireLogin, weekdayText } from '../utils/helpers';

const route = useRoute();
const router = useRouter();
const courseId = Number(route.params.id);

const course = ref(null);
const week = ref('');
const initial = ref('');
const waiting = ref(false);
const countdown = ref('');
let timer = null;
let serverOffset = 0;

load();

onUnmounted(stopClock);

async function load() {
  try {
    const data = await getCourseDetail(courseId);
    course.value = data;
    week.value = weekdayText(data.weekday);
    initial.value = (data.title || '课').slice(0, 1);
    serverOffset = (data.serverNow || Date.now()) - Date.now();
    startClock(data);
  } catch (err) {
    showToast(err.message || '加载失败');
  }
}

function startClock(c) {
  stopClock();
  const tick = () => {
    const left = (c.grabAt || 0) - (Date.now() + serverOffset);
    const isWaiting = !!(c.openGrab && c.grabAt && left > 0);
    waiting.value = isWaiting;
    countdown.value = isWaiting ? countdownText(left) : '';
    if (!isWaiting && c.openGrab && c.contractSigned && course.value) {
      course.value = { ...course.value, canGrab: true };
    }
    if (!isWaiting) stopClock();
  };
  tick();
  if (c.openGrab && c.grabAt && c.grabAt > Date.now() + serverOffset) {
    timer = setInterval(tick, 1000);
  }
}

function stopClock() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function formatIcsDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function addCalendar() {
  const c = course.value;
  if (!c?.grabAt) return;
  const start = formatIcsDate(c.grabAt);
  const end = formatIcsDate(c.grabAt + 3600000);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Novis//CourseGrab//CN',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${c.title} 开抢`,
    'DESCRIPTION:课程开抢提醒',
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `grab-${c.id}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('已下载日历文件');
}

async function onGrab() {
  if (!requireLogin(router)) return;
  const c = course.value;
  if (!c.certified) {
    router.push('/certify');
    return;
  }
  if (!c.contractSigned) {
    router.push('/contract');
    return;
  }
  if (!c.canGrab) return;
  try {
    await grabCourse(courseId);
    showToast('抢课成功');
    await load();
  } catch (err) {
    showToast(err.message || '抢课失败');
  }
}

function goContract() {
  if (!requireLogin(router)) return;
  router.push('/contract');
}

function goAdjust() {
  router.push(`/adjust?courseId=${courseId}`);
}

function courseLink() {
  return `${window.location.origin}/m/course/${courseId}`;
}

async function copyLink() {
  const text = courseLink();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', 'true');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    showToast('链接已复制，发给伙伴可直接打开抢课');
  } catch {
    showToast(text);
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: calc(160 * var(--r)); background: var(--bg-color); }
.nav {
  display: flex;
  align-items: center;
  gap: calc(16 * var(--r));
  padding: calc(24 * var(--r));
  font-weight: 650;
}
.nav span { flex: 1; text-align: center; }
.back { color: #2563eb; }
.share {
  color: #2563eb;
  font-size: calc(26 * var(--r));
  font-weight: 600;
  white-space: nowrap;
}
.banner {
  height: calc(200 * var(--r));
  margin: 0 calc(24 * var(--r));
  border-radius: calc(16 * var(--r));
  background: linear-gradient(135deg, #93c5fd, #2563eb);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: calc(72 * var(--r));
  font-weight: 750;
}
.main { margin: calc(24 * var(--r)); }
.title { font-size: calc(36 * var(--r)); font-weight: 700; }
.rate { margin-top: calc(8 * var(--r)); color: #f59e0b; }
.line { margin-top: calc(8 * var(--r)); color: #667085; font-size: calc(26 * var(--r)); }
.price { margin-top: calc(16 * var(--r)); color: #ee0a24; font-weight: 700; font-size: calc(32 * var(--r)); }
.block { margin: 0 calc(24 * var(--r)) calc(24 * var(--r)); }
.h { font-weight: 650; margin-bottom: calc(12 * var(--r)); }
.p { margin: 0; color: #667085; line-height: 1.65; }
.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: calc(20 * var(--r)) calc(24 * var(--r)) calc(20 * var(--r) + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 calc(-4 * var(--r)) calc(20 * var(--r)) rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: calc(12 * var(--r));
}
.bar-row { display: flex; gap: calc(12 * var(--r)); }
.bar-row .btn { flex: 1; }
.remind { margin-top: 0; }
</style>
