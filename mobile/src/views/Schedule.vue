<template>
  <div class="wrap">
    <LoginPanel v-if="!loggedIn" slogan="登录后查看课表" @success="onAuthed" />
    <div v-else class="page-tab">
      <div class="nav"><span class="nav-title">课表</span></div>

      <div class="cal-head">
        <button type="button" class="arrow" @click="shift(-1)">‹</button>
        <span class="title">{{ year }}年{{ month }}月</span>
        <button type="button" class="arrow" @click="shift(1)">›</button>
      </div>
      <p v-if="selectedMark" class="mark-tip">{{ selectedMark }}</p>

      <div class="week-row">
        <span v-for="w in weekLabels" :key="w">周{{ w }}</span>
      </div>
      <div class="grid">
        <div v-for="cell in cells" :key="cell.key" class="cell" :class="cellClass(cell)" @click="onDay(cell)">
          <template v-if="!cell.empty">
            <span class="day">{{ cell.day }}</span>
            <span v-if="cell.holiday" class="holiday">{{ cell.holiday }}</span>
            <span v-if="cell.count" class="dot" :class="{ off: cell.off }">{{ cell.count }}</span>
          </template>
        </div>
      </div>

      <div class="sessions">
        <div v-if="!visible.length" class="empty">这一天没有课程</div>
        <article v-for="item in visible" :key="item.id" class="session card" @click="open(item.courseId || item.id)">
          <div class="time">{{ item.startTime }}<span v-if="item.endTime"> - {{ item.endTime }}</span></div>
          <div class="name">{{ item.title }}</div>
          <div class="sub">{{ item.school || '学校待定' }}<template v-if="item.classroom"> · {{ item.classroom }}</template></div>
          <div v-if="item.hours" class="hours">{{ item.hours }}</div>
          <span v-if="item.label" class="badge">{{ item.label }}</span>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getCalendar, getSchedule } from '../api';
import LoginPanel from '../components/LoginPanel.vue';
import { isLoggedIn } from '../store';
import { pad, todayKey } from '../utils/helpers';

const router = useRouter();
const loggedIn = ref(isLoggedIn());

const year = ref(new Date().getFullYear());
const month = ref(new Date().getMonth() + 1);
const selected = ref(todayKey());
const sessions = ref([]);
const marks = ref([]);
const cells = ref([]);
const visible = ref([]);
const selectedMark = ref('');
const weekLabels = ['一', '二', '三', '四', '五', '六', '日'];

onMounted(() => {
  if (loggedIn.value) {
    const now = new Date();
    year.value = now.getFullYear();
    month.value = now.getMonth() + 1;
    selected.value = todayKey();
    load();
  }
});

function onAuthed() {
  loggedIn.value = true;
  load();
}

function hoursOf(start, end) {
  if (!start || !end) return '';
  const toMin = (value) => {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const mins = toMin(end) - toMin(start);
  if (!(mins > 0)) return '';
  const hours = mins / 60;
  return Number.isInteger(hours) ? `${hours}小时` : `${Math.round(hours * 10) / 10}小时`;
}

function expandWeekly(courses, y, m) {
  const days = new Date(y, m, 0).getDate();
  const rows = [];
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(y, m - 1, day);
    const weekday = date.getDay() === 0 ? 7 : date.getDay();
    const key = `${y}-${pad(m)}-${pad(day)}`;
    courses
      .filter((item) => item.weekday === weekday)
      .forEach((item) => {
        rows.push({
          id: `${item.id}-${key}`,
          courseId: item.id,
          date: key,
          startTime: item.startTime,
          endTime: item.endTime,
          title: item.title,
          school: item.school,
          classroom: item.classroom,
          gradeLabel: item.gradeLabel,
          isMine: item.isMine,
          label: '每周',
          status: 'scheduled',
          note: '',
        });
      });
  }
  return rows;
}

async function load() {
  const y = year.value;
  const m = month.value;
  try {
    const calendar = await getCalendar(`${y}-${pad(m)}`);
    let rows = (calendar.sessions || []).filter((item) => item.isMine);
    if (!calendar.generated) {
      const courses = await getSchedule();
      rows = expandWeekly((courses || []).filter((item) => item.isMine), y, m);
    }
    sessions.value = rows;
    marks.value = calendar.marks || [];
    paint();
  } catch {
    sessions.value = [];
    paint();
  }
}

function paint() {
  const y = year.value;
  const m = month.value;
  const markMap = {};
  (marks.value || []).forEach((item) => {
    markMap[item.date] = item;
  });
  const first = new Date(y, m - 1, 1);
  const lead = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const count = new Date(y, m, 0).getDate();
  const nextCells = [];
  for (let i = 0; i < lead; i += 1) nextCells.push({ key: `e${i}`, empty: true });
  for (let day = 1; day <= count; day += 1) {
    const date = `${y}-${pad(m)}-${pad(day)}`;
    const items = sessions.value.filter((item) => item.date === date);
    const active = items.filter((item) => item.status === 'scheduled' || item.status === 'observe');
    const mark = markMap[date] || {};
    nextCells.push({
      key: date,
      date,
      day,
      count: items.length,
      off: items.length > 0 && active.length === 0,
      on: date === selected.value,
      holiday: mark.name || '',
      rest: !!mark.rest,
      work: !!mark.work,
      empty: false,
    });
  }
  cells.value = nextCells;
  const picked = markMap[selected.value];
  selectedMark.value = picked
    ? `${picked.name || '节假日'}${picked.work ? ' · 班' : picked.rest ? ' · 休' : ''}`
    : '';
  visible.value = sessions.value
    .filter((item) => item.date === selected.value)
    .map((item) => ({
      ...item,
      hours: hoursOf(item.startTime, item.endTime),
    }));
}

function cellClass(cell) {
  if (cell.empty) return 'empty-cell';
  return {
    on: cell.on,
    rest: cell.rest,
    work: cell.work,
  };
}

function shift(delta) {
  let m = month.value + delta;
  let y = year.value;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  if (m > 12) {
    m = 1;
    y += 1;
  }
  year.value = y;
  month.value = m;
  selected.value = `${y}-${pad(m)}-01`;
  load();
}

function onDay(cell) {
  if (cell.empty || !cell.date) return;
  selected.value = cell.date;
  paint();
}

function open(id) {
  if (!id) return;
  router.push(`/course/${id}`);
}
</script>

<style scoped>
.wrap { min-height: 100vh; background: var(--bg-color); }
.nav { padding: calc(24 * var(--r)) calc(28 * var(--r)) 0; }
.nav-title { font-size: calc(40 * var(--r)); font-weight: 700; }
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(20 * var(--r)) calc(28 * var(--r));
}
.arrow { font-size: calc(40 * var(--r)); color: #2563eb; width: calc(64 * var(--r)); }
.title { font-weight: 650; }
.mark-tip { padding: 0 calc(28 * var(--r)); color: #667085; font-size: calc(24 * var(--r)); margin: 0 0 calc(12 * var(--r)); }
.week-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  color: #98a2b3;
  font-size: calc(24 * var(--r));
  padding: 0 calc(16 * var(--r));
  margin-bottom: calc(8 * var(--r));
}
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: calc(4 * var(--r));
  padding: 0 calc(16 * var(--r)) calc(24 * var(--r));
}
.cell {
  aspect-ratio: 1;
  border-radius: calc(12 * var(--r));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: calc(26 * var(--r));
  position: relative;
  background: #fff;
}
.cell.empty-cell { background: transparent; }
.cell.on { background: #2563eb; color: #fff; }
.cell.rest:not(.on) { color: #ee0a24; }
.holiday { font-size: calc(18 * var(--r)); color: inherit; opacity: 0.85; }
.dot {
  position: absolute;
  bottom: calc(6 * var(--r));
  font-size: calc(18 * var(--r));
  color: #2563eb;
}
.cell.on .dot { color: #fff; }
.dot.off { color: #98a2b3; }
.sessions { padding: 0 calc(28 * var(--r)); }
.session { margin-bottom: calc(16 * var(--r)); cursor: pointer; position: relative; }
.time { color: #2563eb; font-weight: 650; }
.name { margin-top: calc(8 * var(--r)); font-weight: 650; }
.sub { margin-top: calc(4 * var(--r)); color: #98a2b3; font-size: calc(24 * var(--r)); }
.hours { margin-top: calc(8 * var(--r)); color: #667085; font-size: calc(24 * var(--r)); }
.badge {
  position: absolute;
  top: calc(20 * var(--r));
  right: calc(20 * var(--r));
  font-size: calc(22 * var(--r));
  color: #667085;
}
.empty { text-align: center; color: #98a2b3; padding: calc(40 * var(--r)); }
</style>
