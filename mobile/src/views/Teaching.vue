<template>
  <div class="wrap">
    <LoginPanel v-if="!loggedIn" slogan="登录后查看授课和课时费" @success="onAuthed" />
    <div v-else class="page-tab">
      <div class="nav"><span class="nav-title">授课</span></div>
      <div class="subrow">
        <span class="sub">今日授课安排</span>
        <label class="chip">
          <input v-model="date" type="date" class="date-input" @change="onDateChange" />
          <span>{{ dateLabel }}</span>
          <span class="chev">⌄</span>
        </label>
      </div>

      <div v-if="!certified" class="empty">认证通过后才能查看自己的课程和课时费</div>
      <template v-else>
        <div v-if="lockedCount" class="lock-banner">
          有 {{ lockedCount }} 门预分配课程未解锁，请签订本学期合同后查看时间安排
          <button type="button" class="link" @click="router.push('/contract')">去签合同</button>
        </div>
        <div v-if="!shown.length" class="empty">这一天还没有授课安排</div>
        <div v-else class="lessons">
          <article v-for="item in shown" :key="item.id" class="lesson card" @click="open(item)">
            <div class="top">
              <div class="mark" :class="item.tone">{{ item.initial }}</div>
              <div class="info">
                <div class="title">{{ item.title }}</div>
                <div class="meta">{{ item.place }}</div>
                <div class="place">📍 {{ item.room }}</div>
              </div>
              <span class="tag" :class="item.locked ? 'lock' : item.showFee ? 'mine' : 'wait'">
                {{ item.locked ? '未解锁' : item.showFee ? '我的课' : '已排课' }}
              </span>
            </div>
            <div class="line" />
            <div class="bottom">
              <div class="cell">
                <div class="label">上课时间</div>
                <div v-if="item.locked" class="value off">{{ item.lockTip || '课程未解锁，请签合同后解锁' }}</div>
                <div v-else class="value">{{ item.when }}</div>
              </div>
              <div class="vline" />
              <div class="cell">
                <div class="label">课时费</div>
                <div v-if="item.showFee" class="value fee">¥{{ item.teacherFee }} / 节</div>
                <div v-else class="value off">课时费未开放</div>
              </div>
            </div>
          </article>
        </div>
      </template>

      <p class="foot">认真授课，点亮更多孩子的未来</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getTeacherCourses } from '../api';
import LoginPanel from '../components/LoginPanel.vue';
import { isLoggedIn } from '../store';
import { todayKey } from '../utils/helpers';

const router = useRouter();
const loggedIn = ref(isLoggedIn());
const certified = ref(false);
const contractValid = ref(true);
const list = ref([]);
const date = ref(todayKey());

const dateLabel = computed(() =>
  date.value === todayKey() ? '今日' : `${date.value.slice(5, 7)}月${date.value.slice(8)}日`,
);

const lockedCount = computed(() => (list.value || []).filter((item) => item.locked).length);
const shown = computed(() => decorate(list.value, date.value));

onMounted(() => {
  if (loggedIn.value) load();
});

function onAuthed() {
  loggedIn.value = true;
  load();
}

function weekdayOf(d) {
  const value = new Date(`${d}T12:00:00`);
  const day = value.getDay();
  return day === 0 ? 7 : day;
}

function markOf(title) {
  const pairs = [
    ['数学', '数'],
    ['英语', '英'],
    ['语文', '语'],
    ['物理', '物'],
    ['化学', '化'],
    ['生物', '生'],
    ['历史', '史'],
    ['地理', '地'],
    ['科学', '科'],
  ];
  const text = title || '';
  for (let i = 0; i < pairs.length; i += 1) {
    if (text.includes(pairs[i][0])) {
      return { initial: pairs[i][1], tone: i % 2 === 0 ? 'blue' : 'purple' };
    }
  }
  return { initial: text.slice(0, 1) || '课', tone: 'blue' };
}

function decorate(courses, d) {
  const weekday = weekdayOf(d);
  return (courses || [])
    .filter((item) => item.locked || !item.weekday || item.weekday === weekday)
    .map((item) => {
      const mark = markOf(item.title);
      const when = [item.startTime, item.endTime].filter(Boolean).join(' - ');
      const place = [item.school, item.gradeLabel].filter(Boolean).join(' · ');
      return {
        ...item,
        ...mark,
        when: when || '时间待定',
        place: place || '学校待定',
        room: item.classroom || '教室待定',
      };
    });
}

async function load() {
  try {
    const data = await getTeacherCourses();
    certified.value = !!data?.certified;
    contractValid.value = data?.contractValid !== false;
    list.value = data?.list || [];
  } catch {
    list.value = [];
  }
}

function onDateChange() {
  /* shown is computed */
}

function open(item) {
  if (item?.locked) {
    router.push('/contract');
    return;
  }
  router.push(`/course/${item.id}`);
}
</script>

<style scoped>
.wrap { min-height: 100vh; background: var(--bg-color); }
.nav { padding: calc(24 * var(--r)) calc(28 * var(--r)) 0; }
.nav-title { font-size: calc(40 * var(--r)); font-weight: 700; }
.subrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(16 * var(--r)) calc(28 * var(--r)) calc(24 * var(--r));
}
.sub { color: #667085; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: calc(8 * var(--r));
  padding: calc(10 * var(--r)) calc(20 * var(--r));
  background: #fff;
  border-radius: calc(32 * var(--r));
  box-shadow: 0 calc(2 * var(--r)) calc(8 * var(--r)) rgba(0, 0, 0, 0.04);
  position: relative;
}
.date-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  cursor: pointer;
}
.chev { color: #98a2b3; }
.lessons { padding: 0 calc(28 * var(--r)); }
.lesson { margin-bottom: calc(20 * var(--r)); cursor: pointer; }
.top { display: flex; gap: calc(16 * var(--r)); align-items: flex-start; }
.mark {
  width: calc(72 * var(--r));
  height: calc(72 * var(--r));
  border-radius: calc(16 * var(--r));
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
}
.mark.blue { background: linear-gradient(135deg, #60a5fa, #2563eb); }
.mark.purple { background: linear-gradient(135deg, #a78bfa, #7c3aed); }
.info { flex: 1; min-width: 0; }
.title { font-weight: 650; font-size: calc(30 * var(--r)); }
.meta { margin-top: calc(6 * var(--r)); color: #98a2b3; font-size: calc(24 * var(--r)); }
.place { margin-top: calc(4 * var(--r)); color: #667085; font-size: calc(24 * var(--r)); }
.tag {
  flex-shrink: 0;
  padding: calc(6 * var(--r)) calc(14 * var(--r));
  border-radius: calc(8 * var(--r));
  font-size: calc(22 * var(--r));
}
.tag.mine { background: #e8f0ff; color: #2563eb; }
.tag.wait { background: #f3f5f8; color: #98a2b3; }
.tag.lock { background: #fff7ed; color: #9a3412; }
.lock-banner {
  margin: 0 calc(28 * var(--r)) calc(20 * var(--r));
  padding: calc(16 * var(--r));
  background: #fff7ed;
  color: #9a3412;
  border-radius: calc(12 * var(--r));
  font-size: calc(24 * var(--r));
  line-height: 1.5;
}
.lock-banner .link {
  display: inline;
  margin-left: 8px;
  color: #2563eb;
  border: 0;
  background: transparent;
}
.line { height: 1px; background: #f0f0f0; margin: calc(20 * var(--r)) 0; }
.bottom { display: flex; align-items: stretch; }
.cell { flex: 1; }
.vline { width: 1px; background: #f0f0f0; margin: 0 calc(16 * var(--r)); }
.label { color: #98a2b3; font-size: calc(22 * var(--r)); }
.value { margin-top: calc(4 * var(--r)); font-weight: 600; }
.fee { color: #2563eb; }
.off { color: #98a2b3; font-weight: 500; }
.empty { text-align: center; color: #98a2b3; padding: calc(80 * var(--r)) calc(28 * var(--r)); }
.foot { text-align: center; color: #c5cad3; padding: calc(40 * var(--r)); font-size: calc(24 * var(--r)); }
</style>
