<template>
  <section class="poster-page">
    <div class="page-head">
      <div>
        <h1>系统课表海报</h1>
        <p>按系统已排课次生成海报，可选连续多个月份一并导出。数据每次从服务器拉取，不写浏览器缓存。</p>
      </div>
      <div class="actions">
        <router-link class="btn" to="/schedule-poster-diy">DIY 排课海报</router-link>
        <button class="btn" type="button" :disabled="loading || exporting" @click="loadAll(true)">刷新课次</button>
        <button class="btn" type="button" :disabled="exporting || !months.length || !hasAny" @click="exportPng">{{ exporting === 'png' ? '导出中…' : '导出当前月 PNG' }}</button>
        <button class="btn primary" type="button" :disabled="exporting || !months.length || !hasAny" @click="exportPdf">{{ exporting === 'pdf' ? '导出中…' : (months.length > 1 ? `导出 ${months.length} 月 PDF` : '导出 PDF') }}</button>
      </div>
    </div>

    <div class="poster-layout">
      <aside class="card diy-panel">
        <h2>导出月份</h2>
        <label class="field"><span>起始月</span><input v-model="fromMonth" type="month" @change="onRangeChange" /></label>
        <label class="field"><span>结束月</span><input v-model="toMonth" type="month" @change="onRangeChange" /></label>
        <p v-if="loadError" class="error">{{ loadError }}</p>
        <p v-else-if="loading" class="muted">正在从系统拉取课次…</p>
        <p v-else class="muted">共 {{ months.length }} 个月 · {{ totalSessions }} 节</p>

        <div v-if="months.length" class="month-tabs">
          <button
            v-for="m in months"
            :key="m"
            type="button"
            :class="{ on: previewMonth === m }"
            @click="previewMonth = m"
          >
            {{ shortMonth(m) }}
            <em>{{ (byMonth[m] || []).length }}</em>
          </button>
        </div>

        <div v-if="courseOptions.length" class="course-picks">
          <label class="pick all">
            <input type="checkbox" :checked="pickAll" @change="toggleAllCourses" />
            <span>全部课程</span>
          </label>
          <label v-for="course in courseOptions" :key="course.id" class="pick" :class="{ on: coursePicked(course.id) }">
            <input type="checkbox" :checked="coursePicked(course.id)" @change="toggleCourse(course.id)" />
            <span>{{ course.title }}</span>
            <small v-if="course.school">{{ course.school }}</small>
          </label>
        </div>

        <h2>文案与版式</h2>
        <label class="field"><span>主标题</span><input v-model="style.title" maxlength="40" placeholder="空则用「某年某月课表」" /></label>
        <label class="field"><span>副标题</span><input v-model="style.subtitle" maxlength="60" placeholder="可选" /></label>
        <label class="field"><span>页脚</span><input v-model="style.footer" maxlength="80" placeholder="可选" /></label>
        <label class="field">
          <span>画幅</span>
          <select v-model="style.size">
            <option value="a4-landscape">A4 横版</option>
            <option value="a4-portrait">A4 竖版</option>
            <option value="square">方图</option>
            <option value="wide">宽屏横幅</option>
          </select>
        </label>
        <label class="field">
          <span>疏密</span>
          <select v-model="style.density">
            <option value="comfortable">宽松</option>
            <option value="compact">紧凑</option>
          </select>
        </label>
        <label class="field">
          <span>清晰度</span>
          <select v-model.number="style.scale">
            <option :value="2">2×（推荐）</option>
            <option :value="3">3×（更高清）</option>
          </select>
        </label>

        <h2>配色</h2>
        <div class="color-row">
          <label class="field color"><span>主题色</span><input v-model="style.theme" type="color" /></label>
          <label class="field color"><span>表头字色</span><input v-model="style.headerText" type="color" /></label>
          <label class="field color"><span>背景</span><input v-model="style.bg" type="color" /></label>
          <label class="field color"><span>卡片</span><input v-model="style.card" type="color" /></label>
        </div>
        <div class="theme-presets">
          <button v-for="preset in presets" :key="preset.name" type="button" class="preset" :style="{ '--c': preset.theme }" @click="applyPreset(preset)">{{ preset.name }}</button>
        </div>

        <h2>显示项</h2>
        <label class="check"><input v-model="style.showTime" type="checkbox" />上课时间</label>
        <label class="check"><input v-model="style.showTeacher" type="checkbox" />教师</label>
        <label class="check"><input v-model="style.showSchool" type="checkbox" />学校</label>
        <label class="check"><input v-model="style.showClassroom" type="checkbox" />教室</label>
        <label class="check"><input v-model="style.showWeekend" type="checkbox" />周末格着色</label>
        <label class="check"><input v-model="style.hideEmptyOut" type="checkbox" />隐藏上/下月空日文字</label>
        <label class="check"><input v-model="style.hideCancelled" type="checkbox" />不显示停课/调出</label>
      </aside>

      <div class="preview-wrap">
        <div class="preview-toolbar">
          <span>预览 · {{ previewMonth }}</span>
          <em>{{ sizeLabel }} · {{ style.scale }}× · 不缓存</em>
        </div>
        <div class="preview-scroll">
          <SchedulePosterBoard
            ref="boardRef"
            :month="previewMonth"
            :sessions="previewSessions"
            :poster-style="style"
          />
          <!-- 隐藏板：多月 PDF 时逐月捕获 -->
          <div class="offscreen">
            <SchedulePosterBoard
              v-for="m in months"
              :key="`cap-${m}`"
              :ref="(el) => setCapRef(m, el)"
              :month="m"
              :sessions="sessionsOf(m)"
              :poster-style="style"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import SchedulePosterBoard from '../components/SchedulePosterBoard.vue';
import { api } from '../api';
import { notify } from '../notify';
import {
  POSTER_PRESETS,
  addCanvasToPdf,
  capturePosterEl,
  canvasToPngBlob,
  createPosterPdf,
  defaultPosterStyle,
  downloadBlob,
  listMonthsBetween,
  monthLabel,
} from '../poster/exportPoster';

function defaultMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const presets = POSTER_PRESETS;
const fromMonth = ref(defaultMonth());
const toMonth = ref(defaultMonth());
const previewMonth = ref(defaultMonth());
const style = reactive(defaultPosterStyle());
const pickAll = ref(true);
const courseIds = ref([]);
const byMonth = reactive({});
const loading = ref(false);
const loadError = ref('');
const exporting = ref('');
const boardRef = ref(null);
const capRefs = reactive({});

const months = computed(() => {
  const a = fromMonth.value;
  const b = toMonth.value;
  if (!a || !b) return [];
  return a <= b ? listMonthsBetween(a, b) : listMonthsBetween(b, a);
});

const sizeLabel = computed(() => ({
  'a4-landscape': 'A4 横版',
  'a4-portrait': 'A4 竖版',
  square: '方图',
  wide: '宽屏横幅',
}[style.size] || style.size));

const courseOptions = computed(() => {
  const map = new Map();
  for (const m of months.value) {
    for (const row of byMonth[m] || []) {
      const course = row.course;
      if (!course?.id || map.has(course.id)) continue;
      map.set(course.id, { id: course.id, title: course.title || `课程#${course.id}`, school: course.school || '' });
    }
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'zh'));
});

function filterList(list) {
  let rows = list || [];
  if (style.hideCancelled) {
    rows = rows.filter((item) => item.status !== 'cancelled' && item.status !== 'rescheduled');
  }
  if (!pickAll.value) {
    const set = new Set(courseIds.value || []);
    rows = rows.filter((item) => set.has(item.course?.id || item.courseId));
  }
  return rows;
}

function sessionsOf(month) {
  return filterList(byMonth[month] || []);
}

const previewSessions = computed(() => sessionsOf(previewMonth.value));
const totalSessions = computed(() => months.value.reduce((sum, m) => sum + sessionsOf(m).length, 0));
const hasAny = computed(() => totalSessions.value > 0);

function shortMonth(m) {
  const [, mm] = String(m).split('-');
  return `${Number(mm)}月`;
}

function coursePicked(id) {
  if (pickAll.value) return true;
  return (courseIds.value || []).includes(id);
}

function toggleAllCourses(event) {
  pickAll.value = !!event.target.checked;
  if (pickAll.value) courseIds.value = [];
  else courseIds.value = courseOptions.value.map((item) => item.id);
}

function toggleCourse(id) {
  const ids = courseOptions.value.map((item) => item.id);
  const current = pickAll.value ? [...ids] : [...(courseIds.value || [])];
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  if (!next.length) {
    pickAll.value = false;
    courseIds.value = [];
    return;
  }
  if (next.length === ids.length) {
    pickAll.value = true;
    courseIds.value = [];
    return;
  }
  pickAll.value = false;
  courseIds.value = next;
}

function applyPreset(preset) {
  style.theme = preset.theme;
  style.headerText = preset.headerText;
  style.bg = preset.bg;
  style.card = preset.card;
}

function setCapRef(month, el) {
  if (el) capRefs[month] = el;
  else delete capRefs[month];
}

async function loadAll() {
  if (!months.value.length) {
    loadError.value = '请选择有效的月份区间';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    for (const key of Object.keys(byMonth)) delete byMonth[key];
    for (const month of months.value) {
      const data = await api.sessions({ month });
      byMonth[month] = Array.isArray(data?.list) ? data.list : [];
    }
    if (!months.value.includes(previewMonth.value)) {
      previewMonth.value = months.value[0];
    }
  } catch (err) {
    loadError.value = err?.message || '课次加载失败';
  } finally {
    loading.value = false;
  }
}

async function onRangeChange() {
  if (fromMonth.value && toMonth.value && fromMonth.value > toMonth.value) {
    const tmp = fromMonth.value;
    fromMonth.value = toMonth.value;
    toMonth.value = tmp;
  }
  previewMonth.value = fromMonth.value;
  await loadAll();
}

async function exportPng() {
  exporting.value = 'png';
  try {
    await nextTick();
    const board = boardRef.value?.el || boardRef.value?.$el;
    const canvas = await capturePosterEl(board, { bg: style.bg, scale: style.scale });
    downloadBlob(await canvasToPngBlob(canvas), `课表海报-${previewMonth.value}.png`);
    notify.success(`已导出 ${monthLabel(previewMonth.value)} PNG`);
  } catch (err) {
    notify.error(err?.message || '导出失败');
  } finally {
    exporting.value = '';
  }
}

async function exportPdf() {
  exporting.value = 'pdf';
  try {
    await nextTick();
    const pdf = createPosterPdf(style.size);
    const landscape = style.size !== 'a4-portrait' && style.size !== 'square';
    let pages = 0;
    for (const month of months.value) {
      if (!sessionsOf(month).length) continue;
      const board = capRefs[month];
      const el = board?.el || board?.$el;
      if (!el) throw new Error(`${month} 预览未就绪`);
      const canvas = await capturePosterEl(el, { bg: style.bg, scale: style.scale });
      if (pages > 0) {
        pdf.addPage(style.size === 'square' ? [200, 200] : 'a4', landscape ? 'landscape' : 'portrait');
      }
      addCanvasToPdf(pdf, canvas);
      pages += 1;
    }
    if (!pages) throw new Error('所选月份没有可导出的课次');
    const name = months.value.length > 1
      ? `课表海报-${months.value[0]}_${months.value[months.value.length - 1]}.pdf`
      : `课表海报-${months.value[0]}.pdf`;
    pdf.save(name);
    notify.success(pages > 1 ? `已导出 ${pages} 个月 PDF` : '已导出 PDF');
  } catch (err) {
    notify.error(err?.message || '导出失败');
  } finally {
    exporting.value = '';
  }
}

onMounted(() => loadAll());
</script>

<style scoped>
.poster-page { display: flex; flex-direction: column; gap: 14px; }
.poster-layout {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.diy-panel { padding: 16px; position: sticky; top: 12px; max-height: calc(100vh - 120px); overflow: auto; }
.diy-panel h2 { margin: 16px 0 10px; font-size: 13px; font-weight: 700; color: #344054; }
.diy-panel h2:first-child { margin-top: 0; }
.field { display: grid; gap: 6px; margin-bottom: 10px; font-size: 13px; color: #475467; }
.field input, .field select {
  height: 36px; border: 1px solid #d0d5dd; border-radius: 8px; padding: 0 10px; background: #fff;
}
.field.color { grid-template-columns: 1fr auto; align-items: center; }
.field.color input[type='color'] {
  width: 42px; height: 32px; padding: 0; border: 0; background: transparent; cursor: pointer;
}
.color-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.theme-presets { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
.preset {
  border: 1px solid #e4e7ec; background: #fff; border-radius: 999px; padding: 4px 10px;
  font-size: 12px; cursor: pointer; color: #344054;
}
.preset::before {
  content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: var(--c); margin-right: 6px; vertical-align: middle;
}
.check { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 13px; color: #344054; }
.course-picks { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 4px; }
.pick {
  display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
  padding: 4px 8px; border: 1px solid #e4e7ec; border-radius: 999px; background: #fff; font-size: 12px;
}
.pick.on, .pick.all { border-color: #b2ccff; background: #eff4ff; }
.pick small { color: #98a2b3; }
.month-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
.month-tabs button {
  border: 1px solid #e4e7ec; background: #fff; border-radius: 8px; padding: 6px 10px;
  font-size: 12px; cursor: pointer; color: #344054;
}
.month-tabs button.on { border-color: #84b0f5; background: #eff8ff; color: #175cd3; font-weight: 700; }
.month-tabs em { margin-left: 4px; font-style: normal; color: #98a2b3; }
.muted { color: #667085; font-size: 12px; margin: 0 0 8px; line-height: 1.5; }
.error { color: #b42318; font-size: 12px; margin: 0 0 8px; }
.preview-wrap { min-width: 0; }
.preview-toolbar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px; color: #667085; font-size: 13px;
}
.preview-toolbar em { font-style: normal; color: #98a2b3; }
.preview-scroll {
  overflow: auto; border: 1px solid #e4e7ec; border-radius: 14px; background: #eef2f6;
  padding: 16px; max-height: calc(100vh - 160px); position: relative;
}
.offscreen {
  position: absolute; left: -10000px; top: 0; pointer-events: none; opacity: 0;
}
@media (max-width: 1100px) {
  .poster-layout { grid-template-columns: 1fr; }
  .diy-panel { position: static; max-height: none; }
}
</style>
