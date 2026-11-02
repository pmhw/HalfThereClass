<template>
  <section class="poster-page" :class="{ 'is-public': isPublic }">
    <div class="page-head">
      <div>
        <h1>{{ pageTitle }}</h1>
        <p v-if="isPublic">免登录临时课表 · 改动会实时同步给创建者。老师时间固定中国；跨日各挂对应日期。</p>
        <p v-else-if="isLive">实时查看「{{ shareTitle || '临时链接' }}」· {{ syncStatus }}</p>
        <p v-else>老师时间固定<strong>中国</strong>；跨日时学生日与老师中国日各挂一格。可生成超级临时链接给未登录访客使用。</p>
      </div>
      <div class="actions">
        <router-link v-if="isLive" class="btn" to="/schedule-poster-diy">返回 DIY</router-link>
        <router-link v-else-if="!isPublic" class="btn" to="/schedule-poster">系统课表海报</router-link>
        <span v-if="shareMode" class="sync-pill" :class="{ err: !!syncError }">{{ syncStatus }}</span>
        <button class="btn" type="button" :disabled="exporting || !monthSessions.length" @click="exportPng">{{ exporting === 'png' ? '导出中…' : '导出高清 PNG' }}</button>
        <button class="btn primary" type="button" :disabled="exporting || !monthSessions.length" @click="exportPdf">{{ exporting === 'pdf' ? '导出中…' : '导出 PDF' }}</button>
      </div>
    </div>

    <div v-if="!isPublic && !isLive" class="card share-panel">
      <div class="share-head">
        <div>
          <h2>超级临时链接</h2>
          <p class="muted">生成后发给访客，无需登录即可编辑；你可同时开多个，点「实时」即可跟着看。</p>
        </div>
        <div class="share-create">
          <input v-model="newShareTitle" maxlength="40" placeholder="名称（可选）" />
          <select v-model.number="newShareDays">
            <option :value="1">1 天</option>
            <option :value="3">3 天</option>
            <option :value="7">7 天</option>
            <option :value="30">30 天</option>
            <option :value="0">不过期</option>
          </select>
          <button class="btn primary tiny" type="button" :disabled="shareBusy" @click="createShare">生成链接</button>
        </div>
      </div>
      <div v-if="!shares.length" class="muted">还没有临时链接</div>
      <div v-for="s in shares" :key="s.id" class="share-row">
        <div>
          <strong>{{ s.title || '未命名' }}</strong>
          <small>{{ s.sharePath }} · 修订 {{ s.revision }}{{ s.expiresAt ? ` · 到期 ${fmtTime(s.expiresAt)}` : ' · 不过期' }}</small>
        </div>
        <div class="share-ops">
          <button class="link" type="button" @click="copyShare(s)">复制链接</button>
          <router-link class="link" :to="`/schedule-poster-diy/live/${s.id}`">实时</router-link>
          <a class="link" :href="publicHref(s.token)" target="_blank" rel="noopener">打开访客页</a>
          <button class="link danger" type="button" @click="revokeShare(s)">关闭</button>
        </div>
      </div>
    </div>

    <div class="poster-layout">
      <aside class="card diy-panel">
        <h2>月份与全局时区</h2>
        <label class="field">
          <span>预览月份（学生日期）</span>
          <input v-model="cfg.month" type="month" />
        </label>
        <label class="field">
          <span>学生所在时区（全局）</span>
          <select v-model="cfg.studentZone" @change="onGlobalZoneChange">
            <option v-for="z in TIME_ZONES" :key="z.id" :value="z.id">{{ z.label }}</option>
          </select>
        </label>
        <p class="muted">老师固定中国。改学生时区会按老师中国时间重算全部课次。本月 {{ monthSessions.length }} 节 · 已存 {{ entries.length }} 节</p>

        <form class="add-form" @submit.prevent="submitForm">
          <h2>{{ editingId ? '编辑课次' : '添加课程' }}</h2>
          <label class="field">
            <span>按哪种时间填写</span>
            <select v-model="form.inputAs">
              <option value="student">学生时间 · {{ zoneMeta(cfg.studentZone).short }}</option>
              <option value="teacher">老师时间 · 中国</option>
            </select>
          </label>
          <label class="field">
            <span>{{ form.inputAs === 'student' ? `日期（${zoneMeta(cfg.studentZone).short}）` : '日期（中国 · 老师）' }}</span>
            <input v-model="form.date" type="date" required />
          </label>
          <div class="row2">
            <label class="field"><span>开始</span><input v-model="form.startTime" type="time" required /></label>
            <label class="field"><span>结束</span><input v-model="form.endTime" type="time" /></label>
          </div>

          <div v-if="!editingId" class="repeat-box">
            <label class="check"><input v-model="form.weekly" type="checkbox" />按周重复</label>
            <div v-if="form.weekly" class="weekdays">
              <button
                v-for="d in weekdayOpts"
                :key="d.value"
                type="button"
                class="day-chip"
                :class="{ on: form.weekdays.includes(d.value) }"
                @click="toggleWeekday(d.value)"
              >{{ d.label }}</button>
            </div>
            <div v-if="form.weekly" class="row2">
              <label class="field"><span>重复周数</span><input v-model.number="form.weeks" type="number" min="1" max="52" /></label>
              <label class="field"><span>或截止日</span><input v-model="form.until" type="date" /></label>
            </div>
            <p v-if="form.weekly" class="muted">将生成 {{ previewDates.length }} 个日期（按填写侧日历）</p>
          </div>

          <div v-if="liveDual" class="dual-preview">
            <div class="dual teacher">
              <em>老师 · 中国</em>
              <strong>{{ dualText(liveDual, 'teacher') }}</strong>
            </div>
            <div v-if="cfg.studentZone !== TEACHER_ZONE" class="dual student">
              <em>学生 · {{ zoneMeta(cfg.studentZone).short }}</em>
              <strong>{{ dualText(liveDual, 'student') }}</strong>
            </div>
            <p v-if="crossDayTip" class="cross-tip">{{ crossDayTip }}</p>
          </div>

          <label class="field"><span>课程名</span><input v-model="form.title" maxlength="40" placeholder="例如：三年级数学" required list="diy-titles" /></label>
          <datalist id="diy-titles">
            <option v-for="t in knownTitles" :key="t" :value="t" />
          </datalist>
          <label class="field"><span>教师</span><input v-model="form.teacher" maxlength="20" placeholder="可选" /></label>
          <label class="field"><span>学校</span><input v-model="form.school" maxlength="40" placeholder="可选" /></label>
          <label class="field"><span>教室</span><input v-model="form.classroom" maxlength="20" placeholder="可选" /></label>
          <div class="form-actions">
            <button class="btn primary tiny" type="submit">{{ editingId ? '保存修改' : (form.weekly ? `加入 ${previewDates.length} 节` : '加入课表') }}</button>
            <button v-if="editingId" class="btn tiny" type="button" @click="cancelEdit">取消编辑</button>
          </div>
        </form>

        <div v-if="monthSessions.length" class="entry-list">
          <h2>本月课次（按学生日期）</h2>
          <div v-for="item in monthSessionsSorted" :key="item.id" class="entry-row" :class="{ editing: editingId === item.id }">
            <div>
              <strong class="stu">
                学生 {{ (item.studentDate || item.date).slice(5) }} {{ item.studentStartTime || item.startTime }}{{ (item.studentEndTime || item.endTime) ? `-${item.studentEndTime || item.endTime}` : '' }}
                <template v-if="item.studentZone && item.studentZone !== TEACHER_ZONE"> · {{ zoneMeta(item.studentZone).short }}</template>
              </strong>
              <strong v-if="item.teacherStartTime" class="tch">
                老师 {{ (item.teacherDate || '').slice(5) }} {{ item.teacherStartTime }}{{ item.teacherEndTime ? `-${item.teacherEndTime}` : '' }} · 中国
                <template v-if="item.teacherDate && item.studentDate && item.teacherDate !== item.studentDate">
                  · {{ item.teacherDate > item.studentDate ? '次日' : '前日' }}
                </template>
              </strong>
              <span>{{ item.title }}</span>
              <small v-if="metaLine(item)">{{ metaLine(item) }}</small>
            </div>
            <div class="entry-ops">
              <button class="link" type="button" @click="startEdit(item)">编辑</button>
              <button class="link danger" type="button" @click="removeEntry(item.id)">删除</button>
            </div>
          </div>
        </div>

        <h2>文案与版式</h2>
        <label class="field"><span>主标题</span><input v-model="cfg.title" maxlength="40" placeholder="例如：十月课表" /></label>
        <label class="field"><span>副标题</span><input v-model="cfg.subtitle" maxlength="60" placeholder="可选" /></label>
        <label class="field"><span>页脚</span><input v-model="cfg.footer" maxlength="80" :placeholder="defaultFooter" /></label>
        <label class="field">
          <span>画幅</span>
          <select v-model="cfg.size">
            <option value="a4-landscape">A4 横版</option>
            <option value="a4-portrait">A4 竖版</option>
            <option value="square">方图（朋友圈）</option>
            <option value="wide">宽屏横幅</option>
          </select>
        </label>
        <label class="field">
          <span>疏密</span>
          <select v-model="cfg.density">
            <option value="comfortable">宽松</option>
            <option value="compact">紧凑</option>
          </select>
        </label>
        <label class="field">
          <span>清晰度</span>
          <select v-model.number="cfg.scale">
            <option :value="2">2×（推荐）</option>
            <option :value="3">3×（更高清）</option>
          </select>
        </label>

        <h2>配色</h2>
        <div class="color-row">
          <label class="field color"><span>主题色</span><input v-model="cfg.theme" type="color" /></label>
          <label class="field color"><span>表头字色</span><input v-model="cfg.headerText" type="color" /></label>
          <label class="field color"><span>背景</span><input v-model="cfg.bg" type="color" /></label>
          <label class="field color"><span>卡片</span><input v-model="cfg.card" type="color" /></label>
        </div>
        <div class="theme-presets">
          <button v-for="preset in presets" :key="preset.name" type="button" class="preset" :style="{ '--c': preset.theme }" @click="applyPreset(preset)">{{ preset.name }}</button>
        </div>

        <h2>显示项</h2>
        <label class="check"><input v-model="cfg.showTime" type="checkbox" />显示时间</label>
        <label class="check"><input v-model="cfg.showTeacherTime" type="checkbox" :disabled="!cfg.showTime" />老师时间（中国 · 橙色）</label>
        <label class="check"><input v-model="cfg.showStudentTime" type="checkbox" :disabled="!cfg.showTime" />学生时间（地区 · 蓝色）</label>
        <label class="check"><input v-model="cfg.showTeacher" type="checkbox" />教师姓名</label>
        <label class="check"><input v-model="cfg.showSchool" type="checkbox" />学校</label>
        <label class="check"><input v-model="cfg.showClassroom" type="checkbox" />教室</label>
        <label class="check"><input v-model="cfg.showWeekend" type="checkbox" />周末格着色</label>
        <label class="check"><input v-model="cfg.hideEmptyOut" type="checkbox" />隐藏上/下月空日文字</label>

        <button class="btn tiny reset" type="button" @click="resetStyle">恢复默认样式</button>
        <button class="btn tiny danger-outline" type="button" @click="clearEntries">清空全部课次</button>
      </aside>

      <div class="preview-wrap">
        <div class="preview-toolbar">
          <span>预览（学生日期月历 · 同课同色）</span>
          <em>{{ sizeLabel }} · {{ cfg.scale }}× 导出</em>
        </div>
        <div class="preview-scroll">
          <SchedulePosterBoard ref="boardRef" :month="cfg.month" :sessions="monthSessions" :poster-style="boardStyle" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import SchedulePosterBoard from '../components/SchedulePosterBoard.vue';
import {
  POSTER_PRESETS,
  addCanvasToPdf,
  capturePosterEl,
  canvasToPngBlob,
  createPosterPdf,
  defaultPosterStyle,
  downloadBlob,
} from '../poster/exportPoster';
import {
  TEACHER_ZONE,
  TIME_ZONES,
  buildDualTimes,
  expandWeeklyDates,
  rebuildFromTeacher,
  timeRangeText,
  zoneMeta,
} from '../poster/timezones';
import { diyPublicUrl, useDiyShareSync } from '../poster/useDiyShareSync';
import { notify } from '../notify';

const route = useRoute();
const isPublic = computed(() => Boolean(route.meta.diyPublic));
const isLive = computed(() => Boolean(route.meta.diyLive));
const shareMode = computed(() => isPublic.value || isLive.value);
const pageTitle = computed(() => {
  if (isPublic.value) return shareTitle.value || '临时 DIY 课表';
  if (isLive.value) return `实时 · ${shareTitle.value || '临时链接'}`;
  return 'DIY 排课海报';
});

const CACHE_CFG = 'htc_diy_poster_cfg_v6';
const CACHE_ENTRIES = 'htc_diy_poster_entries_v6';
const presets = POSTER_PRESETS;
const weekdayOpts = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
];

function defaultMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function loadCfg() {
  try {
    const raw = JSON.parse(
      localStorage.getItem(CACHE_CFG)
      || localStorage.getItem('htc_diy_poster_cfg_v5')
      || localStorage.getItem('htc_diy_poster_cfg_v4')
      || 'null',
    );
    if (!raw || typeof raw !== 'object') return { ...defaultPosterStyle(), month: defaultMonth() };
    const studentZone = raw.studentZone || TEACHER_ZONE;
    return { ...defaultPosterStyle(), ...raw, studentZone, month: raw.month || defaultMonth() };
  } catch {
    return { ...defaultPosterStyle(), month: defaultMonth() };
  }
}

function migrateEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.teacherZone && raw.teacherZone !== TEACHER_ZONE && raw.teacherStartTime && raw.studentZone == null) {
    return {
      ...raw,
      studentZone: raw.teacherZone,
      teacherZone: TEACHER_ZONE,
      teacherDate: raw.date,
      teacherStartTime: raw.startTime,
      teacherEndTime: raw.endTime || '',
      studentDate: raw.teacherDate || raw.date,
      studentStartTime: raw.teacherStartTime || raw.startTime,
      studentEndTime: raw.teacherEndTime || raw.endTime || '',
      date: raw.teacherDate || raw.date,
      startTime: raw.teacherStartTime || raw.startTime,
      endTime: raw.teacherEndTime || raw.endTime || '',
    };
  }
  const studentDate = raw.studentDate || raw.date;
  const studentStart = raw.studentStartTime || raw.startTime;
  const studentEnd = raw.studentEndTime || raw.endTime || '';
  return {
    ...raw,
    studentZone: raw.studentZone || TEACHER_ZONE,
    teacherZone: TEACHER_ZONE,
    studentDate,
    studentStartTime: studentStart,
    studentEndTime: studentEnd,
    teacherDate: raw.teacherDate || raw.date,
    teacherStartTime: raw.teacherStartTime || raw.startTime,
    teacherEndTime: raw.teacherEndTime || raw.endTime || '',
    date: studentDate,
    startTime: studentStart,
    endTime: studentEnd,
  };
}

function loadEntries() {
  try {
    const raw = JSON.parse(
      localStorage.getItem(CACHE_ENTRIES)
      || localStorage.getItem('htc_diy_poster_entries_v5')
      || localStorage.getItem('htc_diy_poster_entries_v4')
      || 'null',
    );
    if (!Array.isArray(raw)) return [];
    return raw.map(migrateEntry).filter(Boolean);
  } catch {
    return [];
  }
}

const cfg = reactive(isPublic.value || isLive.value ? { ...defaultPosterStyle(), month: defaultMonth() } : loadCfg());
const entries = ref(isPublic.value || isLive.value ? [] : loadEntries());
const exporting = ref('');
const editingId = ref('');
const boardRef = ref(null);
const shareTitle = ref('');
const syncStatus = ref('连接中…');
const syncError = ref('');
const shares = ref([]);
const shareBusy = ref(false);
const newShareTitle = ref('');
const newShareDays = ref(7);
const form = reactive({
  date: `${defaultMonth()}-01`,
  startTime: '09:00',
  endTime: '10:30',
  title: '',
  teacher: '',
  school: '',
  classroom: '',
  inputAs: 'student',
  weekly: false,
  weekdays: [1, 2, 3, 4, 5],
  weeks: 4,
  until: '',
});

const sync = useDiyShareSync({
  mode: isPublic.value ? 'public' : 'admin',
  getIdOrToken: () => (isPublic.value ? String(route.params.token || '') : String(route.params.shareId || '')),
  getSnapshot: () => ({
    cfg: { ...cfg },
    entries: entries.value,
    title: shareTitle.value,
  }),
  applyRemote: (data) => {
    if (data.title != null) shareTitle.value = data.title;
    if (data.cfg && typeof data.cfg === 'object') {
      const next = { ...defaultPosterStyle(), ...data.cfg };
      Object.keys(cfg).forEach((k) => { if (!(k in next)) delete cfg[k]; });
      Object.assign(cfg, next);
    }
    if (Array.isArray(data.entries)) {
      entries.value = data.entries.map(migrateEntry).filter(Boolean);
    }
  },
  onStatus: (text) => {
    syncStatus.value = text;
    syncError.value = /失败|过期|无效|冲突|刷新/.test(text) ? text : '';
  },
});

const monthSessions = computed(() => entries.value.filter((item) => String(item.date || '').startsWith(cfg.month)));
const monthSessionsSorted = computed(() => [...monthSessions.value].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)));
const knownTitles = computed(() => [...new Set(entries.value.map((e) => e.title).filter(Boolean))]);
const sizeLabel = computed(() => ({
  'a4-landscape': 'A4 横版',
  'a4-portrait': 'A4 竖版',
  square: '方图',
  wide: '宽屏横幅',
}[cfg.size] || cfg.size));
const defaultFooter = computed(() => {
  const stu = zoneMeta(cfg.studentZone).short;
  return cfg.studentZone === TEACHER_ZONE ? '' : `学生时区：${stu} · 老师时区：中国`;
});
const boardStyle = computed(() => {
  const footer = cfg.footer?.trim() || defaultFooter.value;
  return { ...cfg, footer, studentZone: cfg.studentZone || TEACHER_ZONE };
});

const liveDual = computed(() => {
  if (!form.date || !form.startTime) return null;
  return buildDualTimes({
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    inputAs: form.inputAs,
    studentZone: cfg.studentZone || TEACHER_ZONE,
  });
});

const crossDayTip = computed(() => {
  const d = liveDual.value;
  if (!d || !d.studentDate || !d.teacherDate || d.studentDate === d.teacherDate) return '';
  const place = d.studentDate;
  return `学生挂 ${place.slice(5)}，老师中国挂 ${d.teacherDate.slice(5)}（各一格）`;
});

const previewDates = computed(() => {
  if (!form.weekly || editingId.value) return form.date ? [form.date] : [];
  return expandWeeklyDates(form.date, form.weekdays, { until: form.until, weeks: form.weeks });
});

function dualText(dual, side) {
  if (!dual) return '';
  if (side === 'student') {
    return `${dual.studentDate.slice(5)} ${timeRangeText(dual.studentStartTime, dual.studentEndTime)}`;
  }
  return `${(dual.teacherDate || '').slice(5)} ${timeRangeText(dual.teacherStartTime, dual.teacherEndTime)}`;
}

function metaLine(item) {
  return [item.teacher, item.school, item.classroom].filter(Boolean).join(' · ');
}

function toggleWeekday(day) {
  const set = new Set(form.weekdays);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  form.weekdays = [...set].sort((a, b) => a - b);
}

function makeId() {
  return `diy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildPayload(date) {
  const dual = buildDualTimes({
    date,
    startTime: form.startTime,
    endTime: form.endTime,
    inputAs: form.inputAs,
    studentZone: cfg.studentZone || TEACHER_ZONE,
  });
  if (!dual) return null;
  return {
    title: String(form.title || '').trim(),
    teacher: String(form.teacher || '').trim(),
    school: String(form.school || '').trim(),
    classroom: String(form.classroom || '').trim(),
    status: 'scheduled',
    ...dual,
  };
}

function submitForm() {
  const title = String(form.title || '').trim();
  if (!form.date || !form.startTime || !title) {
    notify.error('请填写日期、开始时间和课程名');
    return;
  }
  if (editingId.value) {
    const payload = buildPayload(form.date);
    if (!payload) {
      notify.error('时间无法换算');
      return;
    }
    entries.value = entries.value.map((item) => (item.id === editingId.value ? { ...item, ...payload, id: item.id } : item));
    cfg.month = payload.date.slice(0, 7);
    notify.success('已保存修改');
    cancelEdit();
    return;
  }

  const dates = form.weekly ? previewDates.value : [form.date];
  if (!dates.length) {
    notify.error('请选择至少一个重复星期');
    return;
  }
  const created = [];
  for (const date of dates) {
    const payload = buildPayload(date);
    if (!payload) continue;
    created.push({ id: makeId(), ...payload });
  }
  if (!created.length) {
    notify.error('没有生成有效课次');
    return;
  }
  entries.value = [...entries.value, ...created];
  cfg.month = created[0].date.slice(0, 7);
  form.title = '';
  notify.success(created.length > 1 ? `已加入 ${created.length} 节课` : '已加入课表');
}

function startEdit(item) {
  editingId.value = item.id;
  form.weekly = false;
  form.inputAs = 'student';
  form.date = item.studentDate || item.date;
  form.startTime = item.studentStartTime || item.startTime;
  form.endTime = item.studentEndTime || item.endTime || '';
  form.title = item.title || '';
  form.teacher = item.teacher || '';
  form.school = item.school || '';
  form.classroom = item.classroom || '';
  cfg.month = String(form.date).slice(0, 7);
}

function cancelEdit() {
  editingId.value = '';
  form.title = '';
}

function removeEntry(id) {
  if (editingId.value === id) cancelEdit();
  entries.value = entries.value.filter((item) => item.id !== id);
}

const lastStudentZone = ref(cfg.studentZone || TEACHER_ZONE);

async function onGlobalZoneChange() {
  const zone = cfg.studentZone || TEACHER_ZONE;
  const prev = lastStudentZone.value || TEACHER_ZONE;
  if (zone === prev) return;
  if (!entries.value.length) {
    lastStudentZone.value = zone;
    return;
  }
  const ok = await notify.confirm({
    title: '按新时区重算课次？',
    message: `将以老师中国时间为准，把全部 ${entries.value.length} 节课的学生时间换算到「${zoneMeta(zone).short}」。月历日期可能变化。`,
    okText: '重算',
  });
  if (!ok) {
    cfg.studentZone = prev;
    return;
  }
  const next = [];
  for (const item of entries.value) {
    const dual = rebuildFromTeacher(item, zone);
    if (!dual) {
      next.push({ ...item, studentZone: zone });
      continue;
    }
    next.push({ ...item, ...dual, id: item.id, title: item.title, teacher: item.teacher, school: item.school, classroom: item.classroom, status: item.status });
  }
  entries.value = next;
  lastStudentZone.value = zone;
  notify.success('已按新学生时区重算');
}

async function clearEntries() {
  const ok = await notify.confirm({
    title: '清空 DIY 课次',
    message: '将清除浏览器里保存的全部 DIY 课次，样式配置保留。',
    okText: '清空',
    danger: true,
  });
  if (!ok) return;
  entries.value = [];
  cancelEdit();
  notify.success('已清空课次');
}

function applyPreset(preset) {
  cfg.theme = preset.theme;
  cfg.headerText = preset.headerText;
  cfg.bg = preset.bg;
  cfg.card = preset.card;
}

function resetStyle() {
  const month = cfg.month;
  const studentZone = cfg.studentZone;
  Object.assign(cfg, defaultPosterStyle(), { month, studentZone });
  notify.success('已恢复默认样式');
}

watch(cfg, () => {
  if (shareMode.value) {
    if (!sync.applying) sync.schedulePush();
    return;
  }
  try {
    localStorage.setItem(CACHE_CFG, JSON.stringify({ ...cfg }));
  } catch { /* ignore */ }
}, { deep: true });

watch(entries, (list) => {
  if (shareMode.value) {
    if (!sync.applying) sync.schedulePush();
    return;
  }
  try {
    localStorage.setItem(CACHE_ENTRIES, JSON.stringify(list));
  } catch { /* ignore */ }
}, { deep: true });

function fmtTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function publicHref(token) {
  return diyPublicUrl(token);
}

async function refreshShares() {
  if (isPublic.value || isLive.value) return;
  try {
    shares.value = await api.diyShares();
  } catch (err) {
    notify.error(err?.message || '加载临时链接失败');
  }
}

async function createShare() {
  shareBusy.value = true;
  try {
    const row = await api.createDiyShare({
      title: newShareTitle.value.trim(),
      expireDays: newShareDays.value === 0 ? null : newShareDays.value,
      cfg: { ...cfg },
      entries: entries.value,
    });
    newShareTitle.value = '';
    await refreshShares();
    const url = diyPublicUrl(row.token);
    try {
      await navigator.clipboard.writeText(url);
      notify.success('已生成并复制链接');
    } catch {
      notify.success(`已生成：${url}`);
    }
  } catch (err) {
    notify.error(err?.message || '生成失败');
  } finally {
    shareBusy.value = false;
  }
}

async function copyShare(s) {
  const url = diyPublicUrl(s.token);
  try {
    await navigator.clipboard.writeText(url);
    notify.success('已复制链接');
  } catch {
    notify.info(url);
  }
}

async function revokeShare(s) {
  const ok = await notify.confirm({
    title: '关闭临时链接',
    message: `关闭后访客将无法再打开「${s.title || '未命名'}」。`,
    okText: '关闭',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteDiyShare(s.id);
    shares.value = shares.value.filter((x) => x.id !== s.id);
    notify.success('已关闭');
  } catch (err) {
    notify.error(err?.message || '关闭失败');
  }
}

onMounted(async () => {
  if (typeof document !== 'undefined' && shareMode.value) {
    document.title = pageTitle.value;
  }
  if (shareMode.value) {
    try {
      const key = isPublic.value ? String(route.params.token || '') : String(route.params.shareId || '');
      const data = isPublic.value ? await api.publicDiyShare(key) : await api.diyShare(key);
      sync.start(data);
      syncStatus.value = '已同步';
    } catch (err) {
      syncStatus.value = err?.message || '加载失败';
      syncError.value = syncStatus.value;
      notify.error(syncStatus.value);
    }
    return;
  }
  refreshShares();
});

async function capture() {
  const board = boardRef.value?.el || boardRef.value?.$el;
  return capturePosterEl(board, { bg: cfg.bg, scale: cfg.scale });
}

async function exportPng() {
  exporting.value = 'png';
  try {
    const canvas = await capture();
    downloadBlob(await canvasToPngBlob(canvas), `DIY课表海报-${cfg.month}.png`);
    notify.success(`已导出 ${cfg.scale}× 高清 PNG`);
  } catch (err) {
    notify.error(err?.message || '导出失败');
  } finally {
    exporting.value = '';
  }
}

async function exportPdf() {
  exporting.value = 'pdf';
  try {
    const canvas = await capture();
    const pdf = createPosterPdf(cfg.size);
    addCanvasToPdf(pdf, canvas);
    pdf.save(`DIY课表海报-${cfg.month}.pdf`);
    notify.success('已导出 PDF');
  } catch (err) {
    notify.error(err?.message || '导出失败');
  } finally {
    exporting.value = '';
  }
}
</script>

<style scoped>
.poster-page { display: flex; flex-direction: column; gap: 14px; }
.poster-page.is-public {
  min-height: 100vh; padding: 16px; box-sizing: border-box;
  background: linear-gradient(180deg, #eef2f7 0%, #f8fafc 40%);
}
.sync-pill {
  display: inline-flex; align-items: center; height: 32px; padding: 0 10px;
  border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 12px; font-weight: 600;
}
.sync-pill.err { background: #fef3f2; color: #b42318; }
.share-panel { padding: 14px 16px; }
.share-panel h2 { margin: 0 0 4px; font-size: 14px; }
.share-head {
  display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: flex-end;
  margin-bottom: 12px;
}
.share-create { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.share-create input, .share-create select {
  height: 34px; border: 1px solid #d0d5dd; border-radius: 8px; padding: 0 10px; background: #fff;
}
.share-create input { min-width: 160px; }
.share-row {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px;
  padding: 10px 0; border-top: 1px solid #f2f4f7; font-size: 13px;
}
.share-row strong { display: block; color: #0f172a; }
.share-row small { display: block; color: #98a2b3; margin-top: 2px; word-break: break-all; }
.share-ops { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.poster-layout {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.diy-panel { padding: 16px; position: sticky; top: 12px; max-height: calc(100vh - 120px); overflow: auto; }
.diy-panel h2 {
  margin: 16px 0 10px; font-size: 13px; font-weight: 700; color: #344054;
}
.diy-panel h2:first-child { margin-top: 0; }
.field { display: grid; gap: 6px; margin-bottom: 10px; font-size: 13px; color: #475467; }
.field input, .field select, .field textarea {
  height: 36px; border: 1px solid #d0d5dd; border-radius: 8px; padding: 0 10px; background: #fff;
}
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
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
.muted { color: #667085; font-size: 12px; margin: 0 0 8px; line-height: 1.5; }
.add-form { margin-top: 4px; padding-top: 4px; }
.repeat-box {
  margin: 0 0 12px; padding: 10px; border-radius: 10px; background: #f8fafc; border: 1px solid #e4e7ec;
}
.weekdays { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.day-chip {
  width: 32px; height: 32px; border-radius: 8px; border: 1px solid #d0d5dd; background: #fff;
  font-size: 12px; font-weight: 700; color: #475467; cursor: pointer;
}
.day-chip.on { background: #175cd3; border-color: #175cd3; color: #fff; }
.dual-preview {
  display: grid; gap: 6px; margin: 0 0 12px; padding: 10px;
  border-radius: 10px; background: #f8fafc; border: 1px solid #e4e7ec;
}
.dual { display: grid; gap: 2px; }
.dual em { font-style: normal; font-size: 11px; font-weight: 700; }
.dual strong { font-size: 13px; }
.dual.student em, .dual.student strong { color: #175cd3; }
.dual.teacher em, .dual.teacher strong { color: #b54708; }
.cross-tip { margin: 4px 0 0; font-size: 12px; color: #b54708; line-height: 1.4; }
.form-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.entry-list { margin-top: 8px; }
.entry-row {
  display: flex; justify-content: space-between; gap: 8px; align-items: flex-start;
  padding: 8px 0; border-bottom: 1px solid #f2f4f7; font-size: 12px;
}
.entry-row.editing { background: #f5f8ff; margin: 0 -8px; padding: 8px; border-radius: 8px; }
.entry-row strong.tch { display: block; color: #b54708; margin-top: 2px; font-weight: 600; }
.entry-row strong.stu { display: block; color: #175cd3; }
.entry-row span { display: block; color: #0f172a; font-weight: 600; margin-top: 2px; }
.entry-row small { display: block; color: #98a2b3; margin-top: 2px; }
.entry-ops { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.reset, .danger-outline { margin-top: 8px; width: 100%; }
.danger-outline { color: #b42318; border-color: #fecdca; background: #fff; }
.preview-wrap { min-width: 0; }
.preview-toolbar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px; color: #667085; font-size: 13px;
}
.preview-toolbar em { font-style: normal; color: #98a2b3; }
.preview-scroll {
  overflow: auto; border: 1px solid #e4e7ec; border-radius: 14px; background: #eef2f6;
  padding: 16px; max-height: calc(100vh - 160px);
}
@media (max-width: 1100px) {
  .poster-layout { grid-template-columns: 1fr; }
  .diy-panel { position: static; max-height: none; }
}
</style>
