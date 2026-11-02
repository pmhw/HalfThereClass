<template>
  <div
    ref="root"
    class="poster-board"
    :class="[posterStyle.size, posterStyle.density]"
    :style="boardStyle"
  >
    <header class="poster-hero">
      <div>
        <p v-if="posterStyle.subtitle" class="poster-sub">{{ posterStyle.subtitle }}</p>
        <h3>{{ title }}</h3>
      </div>
      <div class="poster-meta">
        <strong>{{ label }}</strong>
        <span>{{ sessions.length }} 节课</span>
      </div>
    </header>

    <div v-if="showLegend || courseLegend.length > 1" class="poster-legend">
      <em v-if="showTeacher" class="leg teacher"><i />老师时间 · 中国</em>
      <em v-if="showStudentTz" class="leg student"><i />学生时间 · {{ studentZoneShort }}</em>
      <span v-for="c in courseLegend" :key="c.key" class="leg course">
        <i :style="{ background: c.bg, borderColor: c.border }" />{{ c.title }}
      </span>
      <span class="leg-note">跨日：学生挂学生日、老师挂中国日（各一格）</span>
    </div>

    <div class="poster-week">
      <span v-for="name in weekNames" :key="name">{{ name }}</span>
    </div>
    <div class="poster-grid">
      <div
        v-for="day in days"
        :key="day.date"
        class="poster-day"
        :class="{ out: !day.inMonth, weekend: posterStyle.showWeekend && day.weekend, empty: day.inMonth && !day.items.length }"
      >
        <strong>{{ day.inMonth || !posterStyle.hideEmptyOut ? day.day : '' }}</strong>
        <div
          v-for="item in day.items"
          :key="item.placeKey || item.id"
          class="poster-item"
          :class="[item.status, item.slot === 'teacher' ? 'slot-teacher' : '', item.slot === 'student' ? 'slot-student' : '', { 'is-cross': item.slot === 'student' || item.slot === 'teacher' }]"
          :style="itemColorStyle(item)"
        >
          <div v-if="posterStyle.showTime !== false" class="time-stack">
            <b v-if="teacherLine(item)" class="t-teacher">
              <em>老师</em>{{ teacherLine(item) }}
            </b>
            <b v-if="studentLine(item)" class="t-student">
              <em>学生</em>{{ studentLine(item) }}
            </b>
          </div>
          <span>{{ itemTitle(item) }}</span>
          <small v-if="crossHint(item)" class="cross-hint">{{ crossHint(item) }}</small>
          <small v-if="itemLine(item)">{{ itemLine(item) }}</small>
        </div>
      </div>
    </div>
    <footer v-if="posterStyle.footer" class="poster-foot">{{ posterStyle.footer }}</footer>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { buildCalendarDays, monthLabel } from '../poster/exportPoster';
import { TEACHER_ZONE, timeRangeText, zoneMeta } from '../poster/timezones';

const props = defineProps({
  month: { type: String, required: true },
  sessions: { type: Array, default: () => [] },
  posterStyle: { type: Object, required: true },
  titleOverride: { type: String, default: '' },
});

const root = ref(null);
const weekNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 同名课程共用色块；顺序稳定，按首次出现分配 */
const COURSE_PALETTE = [
  { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
  { bg: '#ffedd5', border: '#f97316', text: '#9a3412' },
  { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
  { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
  { bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
  { bg: '#ccfbf1', border: '#14b8a6', text: '#115e59' },
  { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
  { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  { bg: '#e0f2fe', border: '#0ea5e9', text: '#075985' },
  { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
  { bg: '#ecfccb', border: '#84cc16', text: '#3f6212' },
];

const boardStyle = computed(() => ({
  '--theme': props.posterStyle.theme,
  '--header-text': props.posterStyle.headerText,
  '--bg': props.posterStyle.bg,
  '--card': props.posterStyle.card,
}));

const label = computed(() => monthLabel(props.month));
const title = computed(() => props.titleOverride?.trim() || props.posterStyle.title?.trim() || `${label.value}课表`);
const days = computed(() => buildCalendarDays(props.month, props.sessions));

function courseKey(item) {
  const name = String(item?.course?.title || item?.title || '课程').trim() || '课程';
  const id = item?.courseId || item?.course?.id;
  return id != null && id !== '' ? `id:${id}` : `name:${name}`;
}

const courseColorMap = computed(() => {
  const map = new Map();
  let idx = 0;
  for (const item of props.sessions || []) {
    const key = courseKey(item);
    if (map.has(key)) continue;
    map.set(key, COURSE_PALETTE[idx % COURSE_PALETTE.length]);
    idx += 1;
  }
  return map;
});

const courseLegend = computed(() => {
  const seen = new Map();
  for (const item of props.sessions || []) {
    const key = courseKey(item);
    if (seen.has(key)) continue;
    const color = courseColorMap.value.get(key) || COURSE_PALETTE[0];
    seen.set(key, { key, title: itemTitle(item), bg: color.bg, border: color.border });
  }
  return [...seen.values()];
});

const studentZoneId = computed(() => {
  const fromStyle = props.posterStyle.studentZone;
  const fromSession = props.sessions.find((s) => s.studentZone)?.studentZone
    || props.sessions.find((s) => s.teacherZone && s.teacherZone !== TEACHER_ZONE)?.teacherZone;
  return fromStyle || fromSession || TEACHER_ZONE;
});
const studentZoneShort = computed(() => zoneMeta(studentZoneId.value).short);
const showTeacher = computed(() => props.posterStyle.showTeacherTime !== false);
const showStudentTz = computed(() => {
  if (props.posterStyle.showStudentTime === false) return false;
  return studentZoneId.value !== TEACHER_ZONE
    || props.sessions.some((s) => (s.studentZone || s.teacherZone) && (s.studentZone || s.teacherZone) !== TEACHER_ZONE);
});
const showLegend = computed(() => showStudentTz.value && props.posterStyle.showTime !== false);

function itemTitle(item) {
  return item.course?.title || item.title || '课程';
}

function itemColorStyle(item) {
  if (item.status === 'cancelled' || item.status === 'rescheduled') return undefined;
  const color = courseColorMap.value.get(courseKey(item));
  if (!color) return undefined;
  return {
    background: color.bg,
    color: color.text,
    borderLeft: `3px solid ${color.border}`,
  };
}

function itemLine(item) {
  const parts = [];
  if (props.posterStyle.showSchool && (item.course?.school || item.school)) parts.push(item.course?.school || item.school);
  if (props.posterStyle.showClassroom && (item.course?.classroom || item.classroom)) parts.push(item.course?.classroom || item.classroom);
  if (props.posterStyle.showTeacher && (item.teacherName || item.teacher)) parts.push(item.teacherName || item.teacher);
  return parts.join(' · ');
}

function teacherLine(item) {
  if (!showTeacher.value) return '';
  // 跨日拆格：学生日格不重复写老师时间（老师已挂在中国对应日）
  if (item.slot === 'student') return '';
  const start = item.slot === 'teacher'
    ? (item.teacherStartTime || item.startTime)
    : (item.teacherStartTime || (item.studentZone && item.studentZone !== TEACHER_ZONE ? '' : item.startTime));
  const end = item.slot === 'teacher'
    ? (item.teacherEndTime || item.endTime || '')
    : (item.teacherEndTime || (item.studentZone && item.studentZone !== TEACHER_ZONE ? '' : item.endTime));
  if (!start) return '';
  return timeRangeText(start, end);
}

function studentLine(item) {
  if (props.posterStyle.showStudentTime === false) return '';
  // 跨日拆格：老师中国日格不重复写学生时间
  if (item.slot === 'teacher') return '';
  const zone = item.studentZone || (item.teacherZone !== TEACHER_ZONE ? item.teacherZone : '') || studentZoneId.value;
  const start = item.studentStartTime || item.startTime;
  const end = item.studentEndTime || item.endTime;
  if (!start) return '';
  // 学生也在中国且与老师时间相同：只显示一侧即可，避免重复
  if (item.slot !== 'student' && (!zone || zone === TEACHER_ZONE) && props.posterStyle.showTeacherTime !== false) {
    const tStart = item.teacherStartTime || item.startTime;
    const tEnd = item.teacherEndTime || item.endTime || '';
    if (start === tStart && (end || '') === (tEnd || '')) return '';
  }
  const range = timeRangeText(start, end);
  const zoneBit = zone && zone !== TEACHER_ZONE ? ` · ${zoneMeta(zone).short}` : '';
  if (!zone || zone === TEACHER_ZONE) return range;
  return `${range}${zoneBit}`;
}

/** 跨日拆格时的对应提示 */
function crossHint(item) {
  const tDate = item.teacherDate || '';
  const sDate = item.studentDate || '';
  if (!tDate || !sDate || tDate === sDate) return '';
  if (item.slot === 'student') {
    return `老师中国 ${String(tDate).slice(5)}`;
  }
  if (item.slot === 'teacher') {
    return `学生 ${String(sDate).slice(5)} · ${zoneMeta(item.studentZone || studentZoneId.value).short}`;
  }
  return '';
}

defineExpose({ el: root });
</script>

<style scoped>
.poster-board {
  margin: 0 auto; background: var(--bg, #f8fafc); color: #0f172a;
  border-radius: 12px; padding: 22px 22px 16px; box-sizing: border-box;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
}
.poster-board.a4-landscape { width: 1120px; }
.poster-board.a4-portrait { width: 794px; }
.poster-board.square { width: 900px; }
.poster-board.wide { width: 1280px; }
.poster-hero {
  display: flex; justify-content: space-between; gap: 16px; align-items: flex-end;
  margin-bottom: 10px; padding-bottom: 12px; border-bottom: 2px solid var(--theme, #1d4ed8);
}
.poster-hero h3 { margin: 0; font-size: 28px; letter-spacing: -0.02em; color: #0f172a; }
.poster-sub { margin: 0 0 4px; color: #667085; font-size: 13px; }
.poster-meta { text-align: right; color: #475467; }
.poster-meta strong { display: block; font-size: 16px; color: var(--theme, #1d4ed8); }
.poster-meta span { font-size: 12px; }
.poster-legend {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px;
  margin: 0 0 10px; font-size: 12px; color: #475467;
}
.poster-legend .leg { display: inline-flex; align-items: center; gap: 6px; font-style: normal; font-weight: 700; }
.poster-legend .leg i {
  display: inline-block; width: 10px; height: 10px; border-radius: 3px;
}
.poster-legend .leg.teacher { color: #b54708; }
.poster-legend .leg.teacher i { background: #f79009; }
.poster-legend .leg.student { color: #175cd3; }
.poster-legend .leg.student i { background: #175cd3; }
.poster-legend .leg.course { color: #344054; font-weight: 600; }
.poster-legend .leg.course i {
  border: 1px solid transparent; box-sizing: border-box;
}
.poster-legend .leg-note { color: #98a2b3; margin-left: auto; }
.poster-week, .poster-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.poster-week span {
  text-align: center; font-size: 12px; font-weight: 700; padding: 8px 0;
  background: var(--theme, #1d4ed8); color: var(--header-text, #fff);
}
.poster-week span:nth-child(6), .poster-week span:nth-child(7) { filter: brightness(0.88); }
.poster-day {
  min-height: 96px; border: 1px solid rgba(15, 23, 42, 0.06); padding: 6px; background: #fff;
}
.poster-day.weekend { background: rgba(15, 23, 42, 0.03); }
.poster-day.out { background: rgba(15, 23, 42, 0.02); color: #cbd5e1; }
.poster-day strong { display: block; font-size: 12px; color: #667085; margin-bottom: 4px; }
.poster-day.out strong { color: #cbd5e1; }
.poster-item {
  border-radius: 8px; padding: 4px 6px; margin-bottom: 4px;
  color: #1e3a8a; background: var(--card, #eff4ff);
  border-left: 3px solid transparent; box-sizing: border-box;
}
.poster-item .time-stack { display: grid; gap: 2px; margin-bottom: 2px; }
.poster-item b {
  display: flex; align-items: baseline; gap: 4px; font-size: 11px; font-weight: 700; line-height: 1.35;
}
.poster-item b em {
  flex: 0 0 auto; font-style: normal; font-size: 10px; font-weight: 800;
  padding: 0 4px; border-radius: 4px; line-height: 1.5;
}
.poster-item b.t-teacher { color: #b54708; }
.poster-item b.t-teacher em { color: #fff; background: #f79009; }
.poster-item b.t-student { color: #175cd3; }
.poster-item b.t-student em { color: #fff; background: #175cd3; }
.poster-item span, .poster-item small { display: block; line-height: 1.35; }
.poster-item span { font-size: 12px; font-weight: 700; }
.poster-item small { font-size: 11px; opacity: .88; }
.poster-item.slot-teacher {
  box-shadow: inset 0 0 0 1px rgba(247, 144, 9, 0.4);
}
.poster-item.slot-student {
  box-shadow: inset 0 0 0 1px rgba(23, 92, 211, 0.28);
}
.poster-item .cross-hint { color: #98a2b3; font-weight: 500; }
.poster-item.cancelled, .poster-item.rescheduled { background: #f2f4f7; color: #667085; }
.poster-board.compact .poster-day { min-height: 78px; padding: 4px; }
.poster-board.compact .poster-item { padding: 3px 5px; margin-bottom: 3px; }
.poster-board.compact .poster-item span { font-size: 11px; }
.poster-board.compact .poster-item b { font-size: 10px; }
.poster-foot {
  margin-top: 12px; padding-top: 10px; border-top: 1px dashed #d0d5dd;
  text-align: center; color: #667085; font-size: 12px;
}
</style>
