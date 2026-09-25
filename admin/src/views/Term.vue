<template>
  <section>
    <div class="page-head">
      <div>
        <h1>学期排课</h1>
        <p>节假日按中国放假安排标在课表上。灰色是周末，红色是节假日，生成时都会跳过。</p>
      </div>
      <div class="term-tools">
        <span class="tip-wrap" data-tip="编辑学期">
          <button type="button" class="icon-btn" :disabled="!current" @click="openSemester(current)"><Icon name="pencil" /></button>
        </span>
        <span class="tip-wrap" :data-tip="current?._count?.sessions ? '已有课次，不能删除' : '删除学期'">
          <button type="button" class="icon-btn danger" :disabled="!current || !!current._count?.sessions" @click="removeSemester(current)"><Icon name="trash" /></button>
        </span>
        <span class="tip-wrap" data-tip="新增学期">
          <button type="button" class="icon-btn" @click="openSemester()"><Icon name="plus" /></button>
        </span>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="muted">{{ notice }}</p>

    <div v-if="!semesters.length" class="card empty">还没有学期，先新增一个秋季或春季学期</div>
    <div v-else class="card term-banner">
      <div class="term-metric">
        <span class="term-icon"><Icon name="cal" /></span>
        <div>
          <small>当前学期</small>
          <select :value="currentId" @change="onPickSemester">
            <option v-for="item in semesters" :key="item.id" :value="item.id">{{ item.label }} {{ item.name }}</option>
          </select>
        </div>
      </div>
      <div class="term-metric">
        <span class="term-icon"><Icon name="cal" /></span>
        <div>
          <small>起止日期</small>
          <strong>{{ current.startDate }} 至 {{ current.endDate }}</strong>
        </div>
      </div>
      <div class="term-metric">
        <span class="term-icon"><Icon name="list" /></span>
        <div>
          <small>节假日</small>
          <strong>{{ current._count.holidays }} 天</strong>
        </div>
      </div>
      <div class="term-metric">
        <span class="term-icon"><Icon name="play" /></span>
        <div>
          <small>已排课次</small>
          <strong>{{ current._count.sessions }} 次</strong>
        </div>
      </div>
      <div class="term-metric">
        <span :class="['tag', current.phase === 'active' ? 'green' : '']">{{ phaseText(current.phase) }}</span>
      </div>
    </div>

    <article v-if="current" class="card panel" style="margin-top: 16px">
      <h2><Icon name="cal" /> 已排课日历</h2>
      <p class="muted">{{ ended ? '学期已结束，课表只读。' : '红色是节假日，灰色是周末，这两天不生成课次。点日期看当天全部课程，点某一节可以改时间。' }}</p>
      <div class="toolbar">
        <div class="field">
          <select v-model="filterCourse" @change="loadSessions">
            <option value="">全部课程</option>
            <option v-for="item in courses" :key="item.id" :value="item.id">{{ item.title }}</option>
          </select>
        </div>
        <button type="button" class="btn primary" :disabled="ended" @click="openQuickFromCalendar">快捷生成</button>
      </div>
      <div class="cal-nav">
        <button type="button" class="btn" @click="shiftPlan(-1)">上个月</button>
        <strong>{{ planYear }}年{{ planMonth }}月</strong>
        <button type="button" class="btn" @click="shiftPlan(1)">下个月</button>
      </div>
      <div class="cal-week"><span v-for="name in weekNames.slice(1)" :key="name">{{ name }}</span></div>
      <div class="cal-grid">
        <div
          v-for="cell in planCells"
          :key="cell.key"
          class="cal-cell plan-cell"
          :class="{ empty: cell.empty, weekend: cell.weekend, holiday: cell.holiday, off: cell.inTerm === false }"
        >
          <button v-if="!cell.empty" type="button" class="plan-date" @click="openDay(cell)">{{ cell.day }}</button>
          <small v-if="cell.holiday" class="plan-mark">{{ cell.holiday.name }}</small>
          <small v-else-if="cell.weekend" class="plan-mark">周末</small>
          <button
            v-for="item in visibleSessions(cell)"
            :key="item.id"
            type="button"
            class="cal-chip"
            :class="{ muted: item.status === 'cancelled' || item.status === 'rescheduled' }"
            @click="ended ? openDay(cell) : openSession(item)"
          >
            <strong>{{ item.startTime }} · {{ hoursText(item) }}</strong>
            <em>{{ item.course?.title }}</em>
          </button>
          <button v-if="cell.sessions.length > 2" type="button" class="cal-more" @click="openDay(cell)">还有 {{ cell.sessions.length - 2 }} 节</button>
        </div>
      </div>
    </article>

    <div v-if="dayDetail" class="modal-mask">
      <div class="modal" role="dialog">
        <header>
          <div>
            <h3>{{ dayDetail.date }}</h3>
            <p class="muted">{{ daySummary(dayDetail) }}</p>
          </div>
          <button class="modal-close" type="button" @click="dayDate = ''">×</button>
        </header>
        <div class="form">
          <p v-if="dayDetail.holiday" class="muted">{{ dayDetail.holiday.name }}，生成课表时会跳过这一天。</p>
          <p v-else-if="dayDetail.weekend" class="muted">周末，生成课表时会跳过。</p>
          <div v-if="!dayDetail.sessions.length" class="empty">这一天没有排课</div>
          <div v-for="item in dayDetail.sessions" :key="item.id" class="day-row">
            <div>
              <strong>{{ item.course?.title || '课程' }}</strong>
              <p>{{ item.startTime }}<template v-if="item.endTime"> - {{ item.endTime }}</template> · {{ hoursText(item) }}</p>
            </div>
            <button v-if="!ended" type="button" class="link" @click="openSession(item)">调整</button>
          </div>
        </div>
      </div>
    </div>

    <article class="card panel" style="margin-top: 16px">
      <h2><Icon name="chart" /> 学期记录</h2>
      <p class="muted">结束后按年份和学期留存，例如 26秋、27春。有课次的学期不能删除。</p>
      <div v-if="!recordGroups.length" class="empty">还没有学期记录</div>
      <div v-for="group in recordGroups" :key="group.year" class="record-year">
        <h3>{{ group.year }}</h3>
        <div class="record-grid">
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="record-card"
            :class="{ on: item.id === currentId }"
            @click="select(item.id)"
          >
            <div class="record-head">
              <strong>{{ item.label }}</strong>
              <span :class="['tag', item.phase === 'active' ? 'green' : '']">{{ phaseText(item.phase) }}</span>
            </div>
            <p>{{ item.startDate }} 至 {{ item.endDate }}</p>
            <p>{{ item.courseCount }} 门课 · {{ item.sessionCount }} 课次</p>
            <p class="muted">上课 {{ item.held }} · 停课 {{ item.cancelled }} · 调出 {{ item.rescheduled }} · 加课 {{ item.extra }} · 听课 {{ item.observe }}</p>
          </button>
        </div>
      </div>
      <table v-if="currentRecord" style="margin-top: 16px">
        <thead><tr><th>{{ currentRecord.label }} 课程</th><th>任课老师</th><th>课次</th><th>已上</th><th>停课/调出</th></tr></thead>
        <tbody>
          <tr v-for="item in currentRecord.courses" :key="item.courseId">
            <td>{{ item.title }}</td>
            <td>
              <router-link v-if="item.teacherId" class="link" :to="`/faculty/${item.teacherId}`">{{ item.teacherName || '老师' }}</router-link>
              <span v-else>—</span>
            </td>
            <td>{{ item.total }}</td>
            <td>{{ item.held }}</td>
            <td>{{ item.stopped }}</td>
          </tr>
          <tr v-if="!currentRecord.courses.length"><td colspan="5" class="empty">这个学期还没有课次</td></tr>
        </tbody>
      </table>
    </article>

    <div v-if="form" class="modal-mask">
      <div class="modal narrow" role="dialog">
        <header>
          <h3>{{ form.id ? '编辑学期' : '新增学期' }}</h3>
          <button class="modal-close" type="button" @click="form = null">×</button>
        </header>
        <form class="form" @submit.prevent="saveSemester">
          <label>名称<input v-model="form.name" required /></label>
          <div class="form-row">
            <label>年份<input v-model.number="form.year" type="number" required /></label>
            <label>季节
              <select v-model="form.season">
                <option value="autumn">秋季（排到放寒假前）</option>
                <option value="spring">春季（排到放暑假前）</option>
              </select>
            </label>
          </div>
          <div class="form-row">
            <label>开始<input v-model="form.startDate" type="date" required /></label>
            <label>结束<input v-model="form.endDate" type="date" required /></label>
          </div>
          <p class="muted">结束日期就是生成截止日。秋季请设成放寒假的前一天。</p>
          <p v-if="formError" class="error">{{ formError }}</p>
          <div class="form-actions">
            <button class="btn primary" type="submit">保存</button>
            <button class="btn" type="button" @click="form = null">取消</button>
          </div>
        </form>
      </div>
    </div>
    <Confirm :open="!!pending" :message="pending ? `确定删除「${pending.label || pending.name}」？没有课次的空学期才会被删除。` : ''" @cancel="pending = null" @ok="doRemoveSemester" />

    <div v-if="slotForm" class="modal-mask">
      <div class="modal" role="dialog">
        <header>
          <h3>生成课表</h3>
          <button class="modal-close" type="button" @click="slotForm = null">×</button>
        </header>
        <form class="form" @submit.prevent="generate">
          <p class="muted">按分类、学校逐级筛出课程，再给这一门课设置每周上课时间。周末和节假日不计入次数。</p>
          <div class="form-row">
            <label>分类
              <select v-model="pickCategory" @change="onPickCategory">
                <option value="">全部分类</option>
                <option v-for="item in categories" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
              </select>
            </label>
            <label>学校
              <select v-model="pickSchool" @change="onPickSchool">
                <option value="">全部学校</option>
                <option v-for="item in schoolOptions" :key="item.id" :value="item.id">{{ item.name }}</option>
              </select>
            </label>
          </div>
          <label>课程
            <select v-model="slotForm.courseId" required>
              <option disabled value="">请选择课程</option>
              <option v-for="item in filteredCourses" :key="item.id" :value="String(item.id)">{{ item.title }}</option>
            </select>
          </label>
          <label>生成次数<input v-model.number="slotForm.count" type="number" min="1" max="200" required /></label>
          <div v-for="(slot, index) in slotForm.slots" :key="index" class="slot-row">
            <label>星期
              <select v-model="slot.weekday">
                <option v-for="day in 5" :key="day" :value="String(day)">{{ weekNames[day] }}</option>
              </select>
            </label>
            <label>开始<input v-model="slot.startTime" type="time" required /></label>
            <label>结束<input v-model="slot.endTime" type="time" /></label>
            <button class="btn" type="button" :disabled="slotForm.slots.length === 1" @click="slotForm.slots.splice(index, 1)">删除</button>
          </div>
          <button class="btn" type="button" @click="slotForm.slots.push({ weekday: '3', startTime: '19:00', endTime: '20:00' })">再加一节</button>
          <p v-if="!filteredCourses.length" class="muted">这个分类和学校下还没有上架课程</p>
          <p v-if="formError" class="error">{{ formError }}</p>
          <div class="form-actions">
            <button class="btn primary" type="submit" :disabled="!!generatingId">{{ generatingId ? '生成中' : '按次数生成' }}</button>
            <button class="btn" type="button" @click="slotForm = null">取消</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="editing" class="modal-mask">
      <div class="modal narrow" role="dialog">
        <header>
          <h3>调整「{{ editing.title }}」</h3>
          <button class="modal-close" type="button" @click="editing = null">×</button>
        </header>
        <form class="form" @submit.prevent="saveSession">
          <label>日期<input v-model="editing.date" type="date" required /></label>
          <div class="form-row">
            <label>开始<input v-model="editing.startTime" type="time" required /></label>
            <label>结束<input v-model="editing.endTime" type="time" /></label>
          </div>
          <p v-if="formError" class="error">{{ formError }}</p>
          <div class="form-actions">
            <button class="btn primary" type="submit">保存这一节</button>
            <button class="btn danger" type="button" @click="removeSession">删除这一节</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import Icon from '../components/Icon.vue';
import Confirm from '../components/Confirm.vue';

const semesters = ref([]);
const holidays = ref([]);
const courses = ref([]);
const categories = ref([]);
const pickCategory = ref('');
const pickSchool = ref('');
const currentId = ref(null);
const error = ref('');
const notice = ref('');
const form = ref(null);
const formError = ref('');
const pending = ref(null);
const generatingId = ref(null);
const planYear = ref(0);
const planMonth = ref(0);
const filterCourse = ref('');
const slotForm = ref(null);
const editing = ref(null);
const sessionResult = ref({ list: [], pagination: { page: 1, totalPages: 1, total: 0 } });
const records = ref([]);
const current = computed(() => semesters.value.find((item) => item.id === currentId.value) || null);
const ended = computed(() => current.value?.phase === 'ended');
const currentRecord = computed(() => records.value.find((item) => item.id === currentId.value) || null);
const recordGroups = computed(() => {
  const map = new Map();
  for (const item of records.value) {
    if (!map.has(item.year)) map.set(item.year, []);
    map.get(item.year).push(item);
  }
  return [...map.entries()].map(([year, items]) => ({
    year,
    items: items.sort((a, b) => (a.season === b.season ? 0 : a.season === 'spring' ? -1 : 1)),
  }));
});

function phaseText(phase) {
  if (phase === 'ended') return '已结束';
  if (phase === 'upcoming') return '未开始';
  return '进行中';
}

async function loadSemesters() {
  const [list, archive] = await Promise.all([api.semesters(), api.semesterRecords()]);
  semesters.value = list;
  records.value = archive;
  if (!currentId.value && semesters.value[0]) currentId.value = semesters.value[0].id;
  if (currentId.value && !semesters.value.some((item) => item.id === currentId.value)) currentId.value = semesters.value[0]?.id || null;
}

async function select(id) {
  currentId.value = id;
  const semester = semesters.value.find((item) => item.id === id);
  if (semester) {
    const [year, month] = semester.startDate.split('-').map(Number);
    planYear.value = year;
    planMonth.value = month;
  }
  await Promise.all([loadHolidays(), loadSessions()]);
}

async function loadHolidays() {
  holidays.value = currentId.value ? await api.holidays(currentId.value) : [];
}

async function loadSessions() {
  if (!currentId.value || !planYear.value) return;
  const month = `${planYear.value}-${`${planMonth.value}`.padStart(2, '0')}`;
  sessionResult.value = await api.sessions({
    semesterId: currentId.value,
    courseId: filterCourse.value,
    month,
  });
}

function openSemester(item) {
  formError.value = '';
  form.value = item
    ? { id: item.id, name: item.name, year: item.year, season: item.season, startDate: item.startDate, endDate: item.endDate }
    : { id: null, name: '2026秋季学期', year: 2026, season: 'autumn', startDate: '2026-09-01', endDate: '2027-01-15' };
}

function openPreset() {
  formError.value = '';
  form.value = { id: null, name: '2026秋季学期', year: 2026, season: 'autumn', startDate: '2026-09-01', endDate: '2027-01-15' };
}

async function saveSemester() {
  formError.value = '';
  try {
    const saved = form.value.id ? await api.updateSemester(form.value.id, form.value) : await api.createSemester(form.value);
    form.value = null;
    await loadSemesters();
    await select(saved.id);
  } catch (err) {
    formError.value = err.message;
  }
}

function removeSemester(item) {
  pending.value = item;
}

async function doRemoveSemester() {
  const item = pending.value;
  pending.value = null;
  if (!item) return;
  error.value = '';
  try {
    await api.deleteSemester(item.id);
    if (currentId.value === item.id) currentId.value = null;
    await loadSemesters();
    if (currentId.value) await select(currentId.value);
  } catch (err) {
    error.value = err.message;
  }
}

async function onPickSemester(event) {
  await select(Number(event.target.value));
}

const route = useRoute();
const weekNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const categoryCourses = computed(() => {
  if (!pickCategory.value) return courses.value;
  return courses.value.filter((item) => String(item.categoryId) === pickCategory.value);
});
const schoolOptions = computed(() => {
  const map = new Map();
  for (const item of categoryCourses.value) {
    const id = item.schoolId ? String(item.schoolId) : '0';
    if (!map.has(id)) map.set(id, item.school || '未设置学校');
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
});
const filteredCourses = computed(() => categoryCourses.value.filter((item) => {
  if (!pickSchool.value) return true;
  const id = item.schoolId ? String(item.schoolId) : '0';
  return id === pickSchool.value;
}));
const holidayMap = computed(() => Object.fromEntries(holidays.value.map((item) => [item.date, item])));
const sessionMap = computed(() => {
  const map = {};
  for (const item of sessionResult.value.list) {
    if (!map[item.date]) map[item.date] = [];
    map[item.date].push(item);
  }
  return map;
});
const planCells = computed(() => buildMonth(planYear.value, planMonth.value, sessionMap.value));
const dayDate = ref('');
const dayDetail = computed(() => planCells.value.find((cell) => cell.date === dayDate.value) || null);

function hoursText(item) {
  if (!item?.startTime || !item?.endTime) return '时长未设';
  const [sh, sm] = item.startTime.split(':').map(Number);
  const [eh, em] = item.endTime.split(':').map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (!Number.isFinite(mins) || mins <= 0) return '时长未设';
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (!rest) return `${hours}小时`;
  if (!hours) return `${rest}分钟`;
  return `${hours}小时${rest}分`;
}

function visibleSessions(cell) {
  return cell.sessions.slice(0, 2);
}

function daySummary(cell) {
  const count = cell.sessions.length;
  const mins = cell.sessions.reduce((sum, item) => {
    if (!item.startTime || !item.endTime) return sum;
    const [sh, sm] = item.startTime.split(':').map(Number);
    const [eh, em] = item.endTime.split(':').map(Number);
    const gap = eh * 60 + em - (sh * 60 + sm);
    return gap > 0 ? sum + gap : sum;
  }, 0);
  const hours = mins ? hoursText({ startTime: '00:00', endTime: `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` }) : '';
  if (!count) return cell.holiday ? cell.holiday.name : '没有排课';
  return hours ? `${count} 节 · 共 ${hours}` : `${count} 节`;
}

function openDay(cell) {
  if (!cell || cell.empty) return;
  dayDate.value = cell.date;
}

function buildMonth(year, month, sessions = {}) {
  if (!current.value || !year) return [];
  const first = new Date(year, month - 1, 1);
  const lead = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const count = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push({ key: `e${year}-${month}-${i}`, empty: true, sessions: [] });
  for (let day = 1; day <= count; day += 1) {
    const date = `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
    const jsDay = new Date(year, month - 1, day).getDay();
    const weekday = jsDay === 0 ? 7 : jsDay;
    cells.push({
      key: date,
      date,
      day,
      weekday,
      weekend: weekday >= 6,
      holiday: holidayMap.value[date] || null,
      inTerm: date >= current.value.startDate && date <= current.value.endDate,
      sessions: sessions[date] || [],
    });
  }
  return cells;
}

function shiftPlan(delta) {
  let year = planYear.value;
  let month = planMonth.value + delta;
  if (month < 1) { month = 12; year -= 1; }
  if (month > 12) { month = 1; year += 1; }
  planYear.value = year;
  planMonth.value = month;
  loadSessions();
}

function onPickCategory() {
  pickSchool.value = '';
  if (slotForm.value) slotForm.value.courseId = '';
}
function onPickSchool() {
  if (!slotForm.value) return;
  if (!filteredCourses.value.some((item) => String(item.id) === String(slotForm.value.courseId))) {
    slotForm.value.courseId = '';
  }
}
function openQuickFromCalendar() {
  const item = courses.value.find((row) => String(row.id) === String(filterCourse.value));
  openGenerate(item || null);
}
function openGenerate(item) {
  formError.value = '';
  if (item) {
    pickCategory.value = item.categoryId ? String(item.categoryId) : '';
    pickSchool.value = item.schoolId ? String(item.schoolId) : '0';
  } else {
    pickCategory.value = '';
    pickSchool.value = '';
  }
  slotForm.value = {
    courseId: item ? String(item.id) : '',
    count: 16,
    slots: [{ weekday: '1', startTime: '16:00', endTime: '17:00' }],
  };
}

async function generate() {
  const form = slotForm.value;
  if (!currentId.value || !form) return;
  const course = courses.value.find((item) => String(item.id) === String(form.courseId));
  if (!course) {
    formError.value = '请选择课程';
    return;
  }
  const slots = form.slots.map((slot) => ({
    weekday: Number(slot.weekday),
    startTime: slot.startTime,
    endTime: slot.endTime || null,
  }));
  if (slots.some((slot) => !slot.startTime)) {
    formError.value = '请填写每节课的开始时间';
    return;
  }
  const count = Number(form.count);
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    formError.value = '生成次数请填 1 到 200';
    return;
  }
  generatingId.value = course.id;
  formError.value = '';
  error.value = '';
  notice.value = '';
  try {
    const data = await api.generateSemester(currentId.value, [course.id], slots, count);
    const times = slots.map((slot) => `${weekNames[slot.weekday]} ${slot.startTime}${slot.endTime ? `-${slot.endTime}` : ''}`).join('、');
    const short = data.created < count ? `，学期结束前只排到 ${data.created} 节` : '';
    notice.value = `「${course.title}」已按 ${times} 生成 ${data.created} 节${short}，跳过节假日 ${data.omitted || 0} 次`;
    filterCourse.value = course.id;
    slotForm.value = null;
    await Promise.all([loadSemesters(), loadSessions()]);
  } catch (err) {
    formError.value = err.message;
  } finally {
    generatingId.value = null;
  }
}

function openSession(item) {
  formError.value = '';
  editing.value = {
    id: item.id,
    title: item.course?.title || '课次',
    date: item.date,
    startTime: item.startTime || '',
    endTime: item.endTime || '',
  };
}

async function saveSession() {
  if (!editing.value) return;
  formError.value = '';
  try {
    await api.updateSession(editing.value.id, {
      date: editing.value.date,
      startTime: editing.value.startTime,
      endTime: editing.value.endTime || null,
    });
    editing.value = null;
    notice.value = '这一节已调整，之后重新生成也会保留';
    await Promise.all([loadSemesters(), loadSessions()]);
  } catch (err) {
    formError.value = err.message;
  }
}

async function removeSession() {
  if (!editing.value) return;
  formError.value = '';
  try {
    await api.deleteSession(editing.value.id);
    editing.value = null;
    notice.value = '这一节已删除';
    await Promise.all([loadSemesters(), loadSessions()]);
  } catch (err) {
    formError.value = err.message;
  }
}

onMounted(async () => {
  try {
    const [data, categoryList] = await Promise.all([
      api.courses({ page: 1, pageSize: 100, status: '1' }),
      api.categories(),
    ]);
    courses.value = data.list;
    categories.value = (categoryList || []).filter((item) => item.status !== 0);
    await loadSemesters();
    if (currentId.value) await select(currentId.value);
    const preset = Number(route.query.courseId);
    if (!preset) return;
    const item = courses.value.find((row) => row.id === preset);
    if (item && !ended.value) openGenerate(item);
    else if (!item) notice.value = '这门课还没上架，上架后才能生成课表';
    else notice.value = '当前学期已结束，不能再生成';
  } catch (err) {
    error.value = err.message;
  }
});
</script>
