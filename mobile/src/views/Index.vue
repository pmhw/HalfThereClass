<template>
  <div class="page page-tab">
    <div class="topbar">
      <div class="topbar-inner">诺维思</div>
    </div>
    <div class="top-spacer" />

    <div class="hello">
      <div class="hello-main">
        <div class="hello-title">{{ greetText }}，{{ name }}</div>
        <div class="hello-sub">今天的课、授课安排和可抢课程</div>
      </div>
      <div class="hello-side">
        <div class="slogan">好的教育<span class="u">从每一堂课开始</span></div>
        <button type="button" class="bell" aria-label="消息" @click="onBell">
          <span class="bell-body" /><span class="bell-clapper" />
        </button>
      </div>
    </div>

    <div v-if="loading" class="hero skel">
      <div class="sk-line wide" />
      <div class="sk-line" />
      <div class="sk-line short" />
    </div>
    <div v-else-if="today?.next" class="hero">
      <div class="hero-top">
        <div class="hero-main">
          <div class="hero-label">今日课程 · {{ today.total }} 节</div>
          <div class="hero-row">
            <div class="hero-time">{{ today.next.startTime }}</div>
            <div class="hero-info">
              <div class="hero-title">{{ today.next.title }}</div>
              <div v-if="today.next.gradeLabel || today.next.school" class="hero-meta">
                {{ today.next.gradeLabel }}<template v-if="today.next.school"> · {{ today.next.school }}</template>
              </div>
              <div v-if="today.next.classroom" class="hero-meta">{{ today.next.classroom }}</div>
            </div>
          </div>
        </div>
        <div class="book" aria-hidden="true">
          <div class="book3">
            <div class="cover-l" /><div class="pages"><div class="pline" /><div class="pline" /><div class="pline short" /></div><div class="cover-r" />
          </div>
        </div>
      </div>
      <div class="hero-foot">
        <div class="remain-line"><span class="clock-ico" />{{ remain }}</div>
        <button v-if="today.next.isMine" type="button" class="go" @click="goNext">
          {{ today.checkedIn || today.sessionDone ? '已上课' : '查看课程' }} ›
        </button>
        <button v-else type="button" class="go" @click="goNext">查看课程 ›</button>
      </div>
    </div>
    <div v-else class="hero empty-hero">
      <div class="hero-top">
        <div class="hero-main">
          <div class="hero-label">今日课程</div>
          <div class="hero-title">今天没有安排</div>
          <div class="hero-meta">未安排老师的课，可以去课程大厅抢课</div>
        </div>
      </div>
    </div>

    <section v-if="today?.courses?.length" class="section">
      <div class="section-head">
        <div class="section-title">今日安排</div>
        <button type="button" class="link-muted" @click="router.push('/schedule')">查看全部 ›</button>
      </div>
      <div class="timeline">
        <div class="rail" />
        <div v-for="item in today.courses" :key="item.id" class="time-item">
          <div class="dot" :class="{ mine: item.isMine }" />
          <div class="time">{{ item.startTime }}</div>
          <div class="body">
            <div class="name">{{ item.title }}</div>
            <div class="sub">
              {{ item.school || '学校待定' }}<template v-if="item.classroom"> · {{ item.classroom }}</template>
            </div>
          </div>
          <span v-if="item.isMine" class="tag mine">我的课</span>
          <span v-else-if="item.teacherId" class="tag wait">已排课</span>
          <span v-else class="tag open">可抢课</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">快捷功能</div>
      <div class="quick">
        <button type="button" class="quick-item" @click="router.push('/schedule')">
          <div class="qicon cal" /><span>课表</span>
        </button>
        <button type="button" class="quick-item" @click="router.push('/teaching')">
          <div class="qicon teach" /><span>授课</span>
        </button>
        <button type="button" class="quick-item" @click="router.push('/adjust')">
          <div class="qicon check" /><span>调课</span>
        </button>
        <button type="button" class="quick-item" @click="goCert">
          <div class="qicon badge" /><span>认证</span>
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title">可抢课程</div>
        <button type="button" class="more" @click="router.push('/courses')">课程大厅 ›</button>
      </div>
      <div v-if="loading" class="grab-list">
        <div v-for="n in 3" :key="n" class="grab skel-card"><div class="sk-mark" /><div class="sk-body" /></div>
      </div>
      <div v-else-if="recommend.length" class="grab-list">
        <button
          v-for="item in recommend"
          :key="item.id"
          type="button"
          class="grab"
          @click="openCourse(item.id)"
        >
          <div class="mark" :class="item.tone">{{ item.initial }}</div>
          <div class="grab-body">
            <div class="grab-title">{{ item.title }}</div>
            <div class="grab-meta">
              {{ item.gradeLabel || '不限' }}<template v-if="item.school"> · {{ item.school }}</template>
            </div>
            <div v-if="item.when" class="grab-time">{{ item.when }}</div>
            <div class="grab-tag">可抢课</div>
          </div>
        </button>
      </div>
      <p v-else class="empty-line">暂时没有未安排老师的课</p>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getRecommendCourses, getToday } from '../api';
import { showToast } from '../api/request';
import { getUser } from '../store';
import { greet, remainText, requireLogin, weekdayText } from '../utils/helpers';

const router = useRouter();

const greetText = ref(greet());
const name = ref('老师');
const today = ref(null);
const remain = ref('');
const recommend = ref([]);
const loading = ref(true);

onMounted(() => {
  const user = getUser() || {};
  name.value = user.nickname || '老师';
  load();
});

function decorate(list) {
  const tones = ['blue', 'purple', 'cyan'];
  return (list || [])
    .filter((item) => item.openGrab || !item.teacherId)
    .map((item, index) => {
      const span = [item.startTime, item.endTime].filter(Boolean).join(' - ');
      const when = [weekdayText(item.weekday), span].filter(Boolean).join(' ');
      return {
        ...item,
        initial: (item.title || '课').slice(0, 1),
        tone: tones[index % tones.length],
        when,
      };
    });
}

async function load() {
  loading.value = true;
  try {
    const [todayData, rec] = await Promise.all([
      getToday().catch(() => null),
      getRecommendCourses(12).catch(() => []),
    ]);
    today.value = todayData;
    remain.value = todayData?.next ? remainText(todayData.next.startTime) : '';
    recommend.value = decorate(rec);
  } catch {
    /* ignore */
  } finally {
    loading.value = false;
  }
}

function goNext() {
  const next = today.value?.next;
  if (!next) return;
  router.push(`/course/${next.id}`);
}

function goCert() {
  if (!requireLogin(router)) return;
  router.push('/certify');
}

function openCourse(id) {
  router.push(`/course/${id}`);
}

function onBell() {
  showToast('暂无新消息');
}
</script>

<style scoped>
.page {
  position: relative;
  padding: calc(8 * var(--r)) calc(28 * var(--r)) 0;
  background: linear-gradient(180deg, #e7eefc 0%, #f4f7fb calc(220 * var(--r)), #f7f8fa 100%);
}
.topbar {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  z-index: 30;
  padding-top: env(safe-area-inset-top);
  background: rgba(238, 243, 251, 0.42);
  border-bottom: 1px solid rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
}
.topbar-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(88 * var(--r));
  color: #111827;
  font-size: calc(34 * var(--r));
  font-weight: 650;
}
.top-spacer { height: calc(88 * var(--r) + env(safe-area-inset-top)); }
.hello { display: flex; align-items: flex-start; justify-content: space-between; gap: calc(16 * var(--r)); margin-top: calc(8 * var(--r)); }
.hello-title { font-size: calc(44 * var(--r)); font-weight: 700; color: #111827; line-height: 1.25; }
.hello-sub { margin-top: calc(10 * var(--r)); color: #98a2b3; font-size: calc(26 * var(--r)); }
.hello-side { display: flex; align-items: center; gap: calc(16 * var(--r)); flex-shrink: 0; }
.slogan { width: calc(168 * var(--r)); color: #c5cad3; font-size: calc(22 * var(--r)); line-height: 1.45; text-align: right; }
.slogan .u { border-bottom: calc(8 * var(--r)) solid rgba(47, 108, 246, 0.22); }
.bell { width: calc(56 * var(--r)); height: calc(56 * var(--r)); position: relative; }
.bell-body {
  display: block;
  width: calc(28 * var(--r));
  height: calc(24 * var(--r));
  margin: calc(8 * var(--r)) auto 0;
  border: calc(3 * var(--r)) solid #111827;
  border-bottom: 0;
  border-radius: calc(14 * var(--r)) calc(14 * var(--r)) calc(4 * var(--r)) calc(4 * var(--r));
}
.bell-clapper {
  display: block;
  width: calc(18 * var(--r));
  height: calc(3 * var(--r));
  margin: calc(2 * var(--r)) auto 0;
  background: #111827;
  border-radius: calc(4 * var(--r));
}
.hero {
  margin-top: calc(8 * var(--r));
  padding: calc(32 * var(--r)) calc(28 * var(--r)) calc(28 * var(--r));
  background: linear-gradient(180deg, #fff 0%, #f8fbff 100%);
  border-radius: calc(36 * var(--r));
  box-shadow: 0 calc(16 * var(--r)) calc(36 * var(--r)) rgba(37, 99, 235, 0.08);
}
.hero.skel { min-height: calc(200 * var(--r)); }
.sk-line { height: calc(24 * var(--r)); background: #eef2f6; border-radius: calc(8 * var(--r)); margin-bottom: calc(16 * var(--r)); }
.sk-line.wide { width: 40%; }
.sk-line.short { width: 60%; }
.hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: calc(12 * var(--r)); }
.hero-main { flex: 1; min-width: 0; }
.hero-label { color: #2f6cf6; font-size: calc(26 * var(--r)); font-weight: 600; }
.hero-row { display: flex; align-items: center; gap: calc(20 * var(--r)); margin-top: calc(18 * var(--r)); }
.hero-time { font-size: calc(64 * var(--r)); font-weight: 750; color: #111827; line-height: 1; }
.hero-title { font-size: calc(32 * var(--r)); font-weight: 700; color: #111827; }
.hero-meta { margin-top: calc(6 * var(--r)); color: #98a2b3; font-size: calc(24 * var(--r)); }
.book { width: calc(120 * var(--r)); height: calc(96 * var(--r)); flex-shrink: 0; position: relative; }
.book3 { position: relative; width: 100%; height: 100%; }
.cover-l, .cover-r {
  position: absolute;
  top: 0;
  width: 50%;
  height: 100%;
  background: linear-gradient(165deg, #9ec0ff, #2563eb 58%, #1d4ed8);
  border-radius: calc(8 * var(--r));
}
.cover-l { left: 0; }
.cover-r { right: 0; opacity: 0.9; }
.pages {
  position: absolute;
  left: 30%;
  top: 8%;
  width: 40%;
  height: 84%;
  background: #fff;
  border-radius: calc(4 * var(--r));
  padding: calc(8 * var(--r));
}
.pline { height: calc(4 * var(--r)); margin-bottom: calc(6 * var(--r)); background: #dbe7ff; border-radius: calc(4 * var(--r)); }
.pline.short { width: 60%; }
.hero-foot { margin-top: calc(28 * var(--r)); display: flex; align-items: center; justify-content: space-between; }
.remain-line { display: flex; align-items: center; gap: calc(10 * var(--r)); color: #2f6cf6; font-size: calc(26 * var(--r)); font-weight: 600; }
.clock-ico {
  width: calc(28 * var(--r));
  height: calc(28 * var(--r));
  border: calc(3 * var(--r)) solid #2f6cf6;
  border-radius: 50%;
  box-sizing: border-box;
}
.go {
  height: calc(64 * var(--r));
  line-height: calc(64 * var(--r));
  padding: 0 calc(28 * var(--r));
  border-radius: 999px;
  background: #2f6cf6;
  color: #fff;
  font-size: calc(26 * var(--r));
  font-weight: 600;
}
.empty-hero .hero-title { margin-top: calc(16 * var(--r)); font-size: calc(36 * var(--r)); }
.section { margin-top: calc(36 * var(--r)); }
.section-head { display: flex; align-items: center; justify-content: space-between; }
.section-title { font-size: calc(34 * var(--r)); font-weight: 700; color: #111827; margin-bottom: calc(16 * var(--r)); }
.link-muted, .more { color: #667085; font-size: calc(26 * var(--r)); margin-bottom: calc(16 * var(--r)); }
.timeline {
  position: relative;
  background: #fff;
  border-radius: calc(36 * var(--r));
  padding: calc(8 * var(--r)) calc(24 * var(--r)) calc(8 * var(--r)) calc(28 * var(--r));
  box-shadow: 0 calc(10 * var(--r)) calc(30 * var(--r)) rgba(17, 24, 39, 0.04);
}
.rail { position: absolute; left: calc(40 * var(--r)); top: calc(44 * var(--r)); bottom: calc(44 * var(--r)); width: calc(2 * var(--r)); background: #e7edf5; }
.time-item { display: flex; align-items: center; gap: calc(16 * var(--r)); padding: calc(26 * var(--r)) 0; position: relative; }
.dot { width: calc(16 * var(--r)); height: calc(16 * var(--r)); border-radius: 50%; background: #d0d5dd; z-index: 1; flex-shrink: 0; }
.dot.mine { background: #2f6cf6; }
.time { width: calc(84 * var(--r)); color: #111827; font-weight: 700; font-size: calc(28 * var(--r)); }
.body { flex: 1; min-width: 0; }
.name { font-size: calc(30 * var(--r)); font-weight: 650; }
.sub { margin-top: calc(4 * var(--r)); font-size: calc(22 * var(--r)); color: #98a2b3; }
.tag { flex-shrink: 0; height: calc(40 * var(--r)); line-height: calc(40 * var(--r)); padding: 0 calc(14 * var(--r)); border-radius: 999px; font-size: calc(22 * var(--r)); }
.tag.mine { color: #2f6cf6; background: #e8f0ff; }
.tag.wait { color: #98a2b3; background: #f3f5f8; }
.tag.open { color: #16a34a; background: #e9f9ef; }
.quick {
  display: flex;
  background: #fff;
  border-radius: calc(36 * var(--r));
  padding: calc(28 * var(--r)) calc(8 * var(--r)) calc(22 * var(--r));
  box-shadow: 0 calc(10 * var(--r)) calc(30 * var(--r)) rgba(17, 24, 39, 0.04);
}
.quick-item { flex: 1; text-align: center; font-size: calc(24 * var(--r)); color: #344054; }
.qicon {
  width: calc(88 * var(--r));
  height: calc(88 * var(--r));
  margin: 0 auto calc(12 * var(--r));
  border-radius: calc(28 * var(--r));
  background: linear-gradient(180deg, #f8fbff, #e7efff);
  box-shadow: 0 calc(10 * var(--r)) 0 #d6e4ff;
}
.cal { position: relative; }
.cal::before, .cal::after {
  content: '';
  position: absolute;
  top: calc(16 * var(--r));
  width: calc(4 * var(--r));
  height: calc(14 * var(--r));
  background: #2f6cf6;
  border-radius: calc(4 * var(--r));
}
.cal::before { left: calc(28 * var(--r)); }
.cal::after { right: calc(28 * var(--r)); }
.teach { background: radial-gradient(circle at 50% 35%, #2f6cf6 0, #2f6cf6 calc(12 * var(--r)), transparent calc(13 * var(--r))), linear-gradient(180deg, #f8fbff, #e7efff); }
.check { position: relative; }
.check::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #2f6cf6;
  font-weight: 700;
}
.badge { position: relative; }
.badge::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: calc(36 * var(--r));
  height: calc(28 * var(--r));
  border: calc(3 * var(--r)) solid #2f6cf6;
  border-radius: calc(8 * var(--r));
}
.grab-list { display: flex; flex-direction: column; gap: calc(16 * var(--r)); }
.grab {
  display: flex;
  width: 100%;
  padding: calc(24 * var(--r));
  background: #fff;
  border-radius: calc(32 * var(--r));
  box-shadow: 0 calc(14 * var(--r)) 0 rgba(226, 232, 240, 0.9);
  text-align: left;
}
.skel-card { min-height: calc(120 * var(--r)); }
.sk-mark { width: calc(72 * var(--r)); height: calc(72 * var(--r)); background: #eef2f6; border-radius: calc(16 * var(--r)); }
.mark {
  width: calc(72 * var(--r));
  height: calc(72 * var(--r));
  border-radius: calc(20 * var(--r));
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
}
.mark.blue { background: linear-gradient(135deg, #60a5fa, #2563eb); }
.mark.purple { background: linear-gradient(135deg, #a78bfa, #7c3aed); }
.mark.cyan { background: linear-gradient(135deg, #22d3ee, #0891b2); }
.grab-body { flex: 1; margin-left: calc(20 * var(--r)); min-width: 0; }
.grab-title { font-size: calc(30 * var(--r)); font-weight: 650; color: #111827; }
.grab-meta { margin-top: calc(6 * var(--r)); color: #98a2b3; font-size: calc(24 * var(--r)); }
.grab-time { margin-top: calc(6 * var(--r)); color: #667085; font-size: calc(24 * var(--r)); }
.grab-tag { margin-top: calc(10 * var(--r)); display: inline-block; padding: 0 calc(12 * var(--r)); height: calc(36 * var(--r)); line-height: calc(36 * var(--r)); border-radius: calc(8 * var(--r)); background: #e9f9ef; color: #16a34a; font-size: calc(22 * var(--r)); }
.empty-line { color: #98a2b3; text-align: center; padding: calc(24 * var(--r)); }
</style>
