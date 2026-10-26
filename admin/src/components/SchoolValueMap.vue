<template>
  <div ref="rootEl" class="svm" :class="{ 'svm-card-open': !!active }">
    <div ref="mapEl" class="svm-map"></div>
    <div class="svm-vignette"></div>

    <div v-if="mapState !== 'ready'" class="svm-map-fallback">
      <div v-if="mapState === 'loading'" class="svm-fallback-box">
        <span class="svm-spinner"></span>
        <p>正在加载经营地图…</p>
      </div>
      <div v-else class="svm-fallback-box">
        <div class="svm-fallback-art" v-html="schoolSvg('middle')"></div>
        <strong>地图暂时无法显示</strong>
        <p>{{ mapError }}</p>
        <div class="svm-fallback-actions">
          <router-link v-if="can('admin.settings')" class="btn" to="/settings">去系统设置</router-link>
          <button class="btn primary" type="button" @click="reload">重新加载</button>
        </div>
      </div>
    </div>

    <svg v-if="active && cardPos" class="svm-pointer" :width="cardPos.w" :height="cardPos.h">
      <line :x1="cardPos.px" :y1="cardPos.py" :x2="cardPos.ax" :y2="cardPos.ay" />
      <circle :cx="cardPos.px" :cy="cardPos.py" r="4.5" />
      <circle class="svm-pointer-ring" :cx="cardPos.px" :cy="cardPos.py" r="10" />
    </svg>

    <div class="svm-layer">
      <header class="svm-kpis">
        <article v-for="item in kpis" :key="item.key" class="svm-glass svm-kpi">
          <span class="svm-kpi-icon" :class="item.key"><Icon :name="item.icon" /></span>
          <div class="svm-kpi-body">
            <div class="svm-kpi-label">{{ item.label }}<em v-if="item.hint">{{ item.hint }}</em></div>
            <div class="svm-kpi-value">
              <CountUp :value="item.value" :money="item.money" :duration="1800" />
              <small v-if="item.unit">{{ item.unit }}</small>
            </div>
          </div>
        </article>
      </header>

      <aside class="svm-glass svm-filter">
        <div class="svm-panel-title"><Icon name="layers" />学校筛选</div>
        <div class="svm-filter-group">
          <div class="svm-filter-label">统计学期</div>
          <select v-if="semesters.length" class="svm-term" :value="semesterId || ''" @change="switchSemester($event.target.value)">
            <option v-for="item in semesters" :key="item.id" :value="item.id">{{ item.label }} {{ item.name }}</option>
          </select>
          <p v-else class="svm-filter-hint">还没有学期</p>
        </div>
        <div class="svm-filter-group">
          <div class="svm-filter-label">学校类型</div>
          <button
            v-for="opt in typeOptions"
            :key="opt.key"
            type="button"
            :class="['svm-chip', { on: filters.type === opt.key }]"
            @click="filters.type = opt.key"
          >
            <span>{{ opt.label }}</span><b>{{ opt.count }}</b>
          </button>
        </div>
        <div class="svm-filter-group">
          <div class="svm-filter-label">合作方式</div>
          <button
            v-for="opt in modeOptions"
            :key="opt.key"
            type="button"
            :class="['svm-chip', { on: filters.mode === opt.key }]"
            @click="filters.mode = opt.key"
          >
            <span>{{ opt.label }}</span><b>{{ opt.count }}</b>
          </button>
        </div>
        <div class="svm-filter-group">
          <div class="svm-filter-label">利润等级</div>
          <button
            v-for="opt in tierOptions"
            :key="opt.key"
            type="button"
            :class="['svm-chip', { on: filters.tier === opt.key }]"
            @click="filters.tier = opt.key"
          >
            <span>{{ opt.label }}</span><b>{{ opt.count }}</b>
          </button>
        </div>
        <div v-if="unplacedCount" class="svm-unplaced">
          <Icon name="pin" />
          {{ unplacedCount }} 所学校未设置坐标
          <router-link v-if="can('course.school')" to="/schools">去补充</router-link>
        </div>
      </aside>

      <aside class="svm-glass svm-top">
        <div class="svm-panel-title">
          <Icon name="signal" />学校学期利润 TOP 5
        </div>
        <div v-if="!topList.length" class="svm-empty">暂无学校数据</div>
        <button
          v-for="(item, index) in topList"
          :key="item.id"
          type="button"
          :class="['svm-rank', { on: active?.id === item.id }]"
          @click="focusSchool(item)"
        >
          <span :class="['svm-rank-no', `no${index + 1}`]">{{ index + 1 }}</span>
          <span class="svm-rank-icon" v-html="schoolSvg(item.type)"></span>
          <span class="svm-rank-name">
            <strong>{{ item.name }}</strong>
            <small>{{ typeLabel(item.type) }} · {{ item.sessionCount }} 节</small>
          </span>
          <span class="svm-rank-value">{{ fmtMoney(item.value?.profit) }}</span>
        </button>
        <p class="svm-top-foot">按{{ termHint }}利润排序</p>
      </aside>

      <footer class="svm-glass svm-legend">
        <span v-for="tier in PROFIT_TIERS" :key="tier.key" :class="['svm-legend-item', `tier-${tier.key}`]">
          <i></i>{{ tier.label }}<small>{{ tier.range }}</small>
        </span>
      </footer>
    </div>

    <transition name="svm-card">
      <article
        v-if="active"
        ref="cardEl"
        class="svm-card"
        :style="cardPos ? { left: `${cardPos.left}px`, top: `${cardPos.top}px` } : { visibility: 'hidden' }"
        @click.stop
      >
        <button class="svm-card-close" type="button" aria-label="关闭" @click="closeCard"><Icon name="x" /></button>
        <div class="svm-card-head">
          <span class="svm-card-art" v-html="schoolSvg(active.type)"></span>
          <div>
            <h3>{{ active.name }}</h3>
            <div class="svm-card-tags">
              <span class="svm-tag type">{{ typeLabel(active.type) }}</span>
              <span class="svm-tag mode">{{ modeLabel(active.mode) }}</span>
              <span :class="['svm-tag', `tier-${activeTier.key}`]">{{ activeTier.label }}</span>
            </div>
            <p v-if="active.address" class="svm-card-addr">{{ active.address }}</p>
          </div>
        </div>

        <div class="svm-card-profit">
          <div>
            <span>学期利润</span><em>{{ termHint }}</em>
          </div>
          <strong><CountUp :value="active.value?.profit || 0" money :duration="1400" /></strong>
          <small v-if="semester">{{ semester.name }} · {{ semester.startDate }} 至 {{ semester.endDate }}</small>
        </div>

        <div class="svm-card-stats">
          <div><b><CountUp :value="active.teacherCount" /></b><span>教师数量</span></div>
          <div><b><CountUp :value="active.openCourseCount" /></b><span>已开课程</span></div>
          <div><b><CountUp :value="active.sessionCount" /></b><span>学期课次</span></div>
          <div><b><CountUp :value="active.studentCount" /></b><span>学期学生</span></div>
        </div>

        <section class="svm-card-sec">
          <h4>教师团队<small>{{ active.teacherCount }} 位</small></h4>
          <div v-if="!active.teachers.length" class="svm-empty small">暂未安排教师</div>
          <div v-else class="svm-teachers">
            <div v-for="t in active.teachers.slice(0, 4)" :key="t.id" class="svm-teacher">
              <img v-if="t.avatar" :src="t.avatar" alt="" />
              <span v-else class="svm-avatar" :style="{ background: avatarColor(t.id) }">{{ t.name.slice(0, 1) }}</span>
              <small>{{ t.name }}</small>
            </div>
            <div v-if="active.teachers.length > 4" class="svm-teacher more">
              <small>+{{ active.teachers.length - 4 }} 位教师</small>
            </div>
          </div>
        </section>

        <section class="svm-card-sec">
          <h4>课程</h4>
          <div v-if="!courseTags.length" class="svm-empty small">暂未开课</div>
          <div v-else class="svm-course-tags">
            <span v-for="(tag, i) in courseTags" :key="tag" :class="`c${i % 6}`" :title="tag">{{ tag }}</span>
          </div>
        </section>

        <section class="svm-card-sec">
          <h4>经营数据<small>{{ termHint }}</small></h4>
          <div class="svm-biz">
            <div><span>学期课次</span><b>{{ active.sessionCount }} 节</b></div>
            <div><span>学期报名</span><b>{{ active.enrollCount }} 人</b></div>
            <div><span>学期收入</span><b>{{ fmtMoney(active.value?.income) }}</b></div>
            <div><span>教师成本</span><b class="cost">−{{ fmtMoney(active.value?.teacherCost) }}</b></div>
            <div title="结算给合作机构的金额"><span>机构收益</span><b class="cost">−{{ fmtMoney(active.value?.orgCost) }}</b></div>
            <div><span>其他成本</span><b class="cost">−{{ fmtMoney(active.value?.otherCost) }}</b></div>
            <div class="profit"><span>学期利润</span><b>{{ fmtMoney(active.value?.profit) }}</b></div>
          </div>
          <p class="svm-formula">
            学期利润 = 该学期收入 − 教师成本 − 机构成本 − 其他成本。只统计学期起止日期内已记收益的课次，无需财务密码。
            <button v-if="can('course.school')" type="button" class="svm-link" @click="metaOpen = !metaOpen">调整分类</button>
          </p>
        </section>

        <section v-if="metaOpen && can('course.school')" class="svm-card-meta">
          <label>
            类型
            <select :value="active.type" @change="saveMeta('type', $event.target.value)">
              <option v-for="t in SCHOOL_TYPES" :key="t.key" :value="t.key">{{ t.label }}</option>
            </select>
          </label>
          <label>
            合作方式
            <select :value="active.mode" @change="saveMeta('mode', $event.target.value)">
              <option v-for="m in SCHOOL_MODES" :key="m.key" :value="m.key">{{ m.label }}</option>
            </select>
          </label>
        </section>
      </article>
    </transition>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { api, getProfile } from '../api';
import { allow } from '../access';
import { loadAmap } from '../amap';
import { notify } from '../notify';
import Icon from './Icon.vue';
import {
  PROFIT_TIERS,
  SCHOOL_MODES,
  SCHOOL_TYPES,
  modeLabel,
  schoolSvg,
  tierOf,
  typeLabel,
} from '../schoolArt';

const can = (...perms) => allow(getProfile(), ...perms);

function fmtMoney(value, like = value) {
  const n = Number(value || 0);
  const digits = Number.isInteger(Math.round(Number(like || 0) * 100) / 100) ? 0 : 2;
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

const easeOut = (t) => 1 - (1 - t) ** 3;

function tween(from, to, duration, onFrame) {
  const start = performance.now();
  let raf = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    onFrame(from + (to - from) * easeOut(t));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

const CountUp = defineComponent({
  props: { value: { type: Number, default: 0 }, money: Boolean, duration: { type: Number, default: 1200 } },
  setup(props) {
    const shown = ref(0);
    let stop = null;
    watch(
      () => props.value,
      (to) => {
        stop?.();
        stop = tween(shown.value, Number(to || 0), props.duration, (v) => { shown.value = v; });
      },
      { immediate: true },
    );
    onBeforeUnmount(() => stop?.());
    return () => h('span', props.money ? fmtMoney(shown.value, props.value) : Math.round(shown.value).toLocaleString('zh-CN'));
  },
});

const rootEl = ref(null);
const mapEl = ref(null);
const cardEl = ref(null);
const mapState = ref('loading');
const mapError = ref('');
const base = ref({ schools: [], totals: {}, semester: null, semesters: [] });
const semesterId = ref(null);
const activeId = ref(null);
const metaOpen = ref(false);
const cardPos = ref(null);
const filters = reactive({ type: 'all', mode: 'all', tier: 'all' });

const map = shallowRef(null);
let AMapRef = null;
let markers = [];
let mapDragged = false;
let markerClickAt = 0;
let cardRaf = 0;
let disposed = false;
const counted = new Set();

const semester = computed(() => base.value.semester || null);
const semesters = computed(() => base.value.semesters || []);
const termHint = computed(() => semester.value?.label || '本学期');

const schools = computed(() =>
  base.value.schools.map((s) => ({
    ...s,
    value: s.value || { income: 0, teacherCost: 0, orgCost: 0, otherCost: 0, profit: 0 },
    tier: tierOf(s.value?.profit || 0),
  })),
);

const placed = computed(() => schools.value.filter((s) => s.lng != null && s.lat != null));
const unplacedCount = computed(() => schools.value.length - placed.value.length);

function tierRangeKey(s) {
  return s.tier.key;
}

const visible = computed(() =>
  placed.value.filter((s) => {
    if (filters.type !== 'all' && s.type !== filters.type) return false;
    if (filters.mode !== 'all' && s.mode !== filters.mode) return false;
    if (filters.tier !== 'all' && tierRangeKey(s) !== filters.tier) return false;
    return true;
  }),
);

const countBy = (key, value) => schools.value.filter((s) => s[key] === value).length;
const typeOptions = computed(() => [
  { key: 'all', label: '全部学校', count: schools.value.length },
  ...SCHOOL_TYPES.map((t) => ({ key: t.key, label: t.label, count: countBy('type', t.key) })),
]);
const modeOptions = computed(() => [
  { key: 'all', label: '全部方式', count: schools.value.length },
  ...SCHOOL_MODES.map((m) => ({ key: m.key, label: m.label, count: countBy('mode', m.key) })),
]);
const tierOptions = computed(() => [
  { key: 'all', label: '全部', count: schools.value.length },
  ...[...PROFIT_TIERS].reverse().map((t) => ({
    key: t.key,
    label: t.range,
    count: schools.value.filter((s) => s.tier.key === t.key).length,
  })),
]);

const topList = computed(() =>
  [...schools.value]
    .sort((a, b) => (b.value?.profit || 0) - (a.value?.profit || 0) || b.sessionCount - a.sessionCount)
    .slice(0, 5),
);

const kpis = computed(() => {
  const t = base.value.totals || {};
  return [
    { key: 'school', label: '学校总数', icon: 'building', value: t.schoolCount || 0, unit: '所' },
    { key: 'teacher', label: '教师总数', icon: 'users', value: t.teacherCount || 0, unit: '位', hint: termHint.value },
    { key: 'course', label: '已开课程', icon: 'book', value: t.openCourseCount || 0, unit: '门', hint: termHint.value },
    {
      key: 'profit',
      label: '学期利润',
      icon: 'chart',
      money: true,
      hint: termHint.value,
      value: t.profit || 0,
    },
  ];
});

const active = computed(() => schools.value.find((s) => s.id === activeId.value) || null);
const activeTier = computed(() => active.value?.tier || PROFIT_TIERS[3]);

const courseTags = computed(() => {
  const tags = [];
  const seen = new Set();
  for (const c of active.value?.courses || []) {
    const title = String(c.category || c.title || '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/\s*[-－—]\s*(?:[A-Za-z]|\d[A-Za-z]?)$/, '')
      .trim();
    if (title && !seen.has(title)) {
      seen.add(title);
      tags.push(title);
    }
  }
  return tags.slice(0, 8);
});

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6'];
const avatarColor = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/* ---------- 地图 ---------- */

/** 高德的边距顺序是 上、下、左、右；上方要留出气泡高度 */
const MAP_AVOID = [210, 70, 280, 320];

function zoomScale(zoom) {
  return Math.max(0.58, Math.min(1.3, 0.62 + (zoom - 11) * 0.1));
}

function applyZoomScale() {
  if (!map.value || !rootEl.value) return;
  rootEl.value.style.setProperty('--svm-zoom', zoomScale(map.value.getZoom()).toFixed(3));
}

function pixelOf(lng, lat) {
  const p = map.value.lngLatToContainer(new AMapRef.LngLat(lng, lat));
  return { x: typeof p.getX === 'function' ? p.getX() : p.x, y: typeof p.getY === 'function' ? p.getY() : p.y };
}

/** 只有地图缩得很小（约省级及更远）且校舍几乎叠在一起时才合并 */
const CLUSTER_BELOW_ZOOM = 9;

function groupSchools(list) {
  if ((map.value?.getZoom?.() || 0) >= CLUSTER_BELOW_ZOOM) return list.map((s) => [s]);
  const items = list
    .map((s) => ({ school: s, px: pixelOf(s.lng, s.lat) }))
    .sort((a, b) => (b.school.value?.profit || 0) - (a.school.value?.profit || 0) || a.school.id - b.school.id);
  const used = new Set();
  const groups = [];
  for (const item of items) {
    if (used.has(item)) continue;
    used.add(item);
    const members = [item];
    for (const other of items) {
      if (used.has(other)) continue;
      if (Math.abs(other.px.x - item.px.x) < 36 && Math.abs(other.px.y - item.px.y) < 28) {
        used.add(other);
        members.push(other);
      }
    }
    groups.push(members.map((m) => m.school));
  }
  return groups;
}

function singleContent(s) {
  const el = document.createElement('div');
  const tier = s.tier;
  const delay = ((s.id * 0.37) % 2.4).toFixed(2);
  el.className = `svm-pin tier-${tier.key} type-${s.type}${activeId.value === s.id ? ' is-active' : ''}`;
  el.style.setProperty('--svm-tier', tier.scale);
  el.style.setProperty('--svm-delay', `-${delay}s`);
  const valueHtml = `<b class="svm-bubble-value" data-to="${s.value?.profit || 0}">${fmtMoney(s.value?.profit || 0)}</b>`;
  el.innerHTML = `
    <div class="svm-bubble">
      <div class="svm-bubble-name">${escapeHtml(s.name)}</div>
      <div class="svm-bubble-row"><span>学期利润</span><em>${escapeHtml(termHint.value)}</em></div>
      ${valueHtml}
    </div>
    <i class="svm-stem"></i>
    <div class="svm-art">
      <i class="svm-halo"></i>
      <i class="svm-shadow"></i>
      <i class="svm-ripple"></i>
      ${schoolSvg(s.type, 'svm-building')}
    </div>`;
  const valueEl = el.querySelector('.svm-bubble-value[data-to]');
  if (valueEl && !counted.has(s.id)) {
    counted.add(s.id);
    const to = Number(valueEl.dataset.to || 0);
    tween(0, to, 2200, (v) => { valueEl.textContent = fmtMoney(v, to); });
  }
  sealMarker(el);
  return el;
}

function clusterContent(group) {
  const el = document.createElement('div');
  const lead = group[0];
  const total = group.reduce((sum, s) => sum + (s.value?.profit || 0), 0);
  el.className = 'svm-cluster';
  el.innerHTML = `
    <div class="svm-cluster-bubble">
      <span class="svm-cluster-icons">${group.slice(0, 3).map((s) => schoolSvg(s.type)).join('')}</span>
      <span class="svm-cluster-text"><b>${group.length} 所学校</b><small>${escapeHtml(termHint.value)} ${fmtMoney(total)}</small></span>
    </div>
    <i class="svm-cluster-ring"></i>`;
  el.title = group.map((s) => s.name).join('、');
  el.dataset.lead = lead.id;
  sealMarker(el);
  return el;
}

/** 标记里的校名、金额是普通文字，拖地图时浏览器会进入文字选择并把鼠标卡住 */
function sealMarker(el) {
  el.addEventListener('selectstart', (event) => event.preventDefault());
  el.addEventListener('dragstart', (event) => event.preventDefault());
  el.querySelectorAll('img, svg').forEach((node) => node.setAttribute('draggable', 'false'));
}

function clearMapSelection() {
  const sel = window.getSelection?.();
  if (!sel || sel.isCollapsed || !sel.rangeCount || !rootEl.value) return;
  const node = sel.anchorNode;
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  if (el && rootEl.value.contains(el)) sel.removeAllRanges();
}

function onMapSelectStart(event) {
  const target = event.target;
  if (target?.closest?.('input, textarea')) return;
  event.preventDefault();
}

function onMapDragStart() {
  mapDragged = true;
  rootEl.value?.classList.add('is-dragging');
  clearMapSelection();
}

function onMapDragEnd() {
  rootEl.value?.classList.remove('is-dragging');
  setTimeout(() => { mapDragged = false; }, 0);
}

function onWindowMouseUp() {
  rootEl.value?.classList.remove('is-dragging');
  clearMapSelection();
  if (mapDragged) setTimeout(() => { mapDragged = false; }, 0);
}

function renderMarkers() {
  const m = map.value;
  if (!m) return;
  if (markers.length) m.remove(markers);
  markers = [];
  for (const group of groupSchools(visible.value)) {
    if (group.length === 1) {
      const s = group[0];
      const marker = new AMapRef.Marker({
        position: [s.lng, s.lat],
        content: singleContent(s),
        anchor: 'top-left',
        offset: new AMapRef.Pixel(0, 0),
        zIndex: 120 + Math.round((s.value?.profit || 0) / 1000) + (activeId.value === s.id ? 10000 : 0),
        bubble: true,
        cursor: 'pointer',
      });
      marker.on('click', () => {
        if (mapDragged) return;
        markerClickAt = Date.now();
        openSchool(s);
      });
      markers.push(marker);
    } else {
      const lng = group.reduce((sum, s) => sum + s.lng, 0) / group.length;
      const lat = group.reduce((sum, s) => sum + s.lat, 0) / group.length;
      const marker = new AMapRef.Marker({
        position: [lng, lat],
        content: clusterContent(group),
        anchor: 'top-left',
        offset: new AMapRef.Pixel(0, 0),
        zIndex: 100,
        bubble: true,
        cursor: 'pointer',
      });
      marker.on('click', () => {
        if (mapDragged) return;
        markerClickAt = Date.now();
        expandCluster(group);
      });
      markers.push(marker);
    }
  }
  if (markers.length) m.add(markers);
}

function mapSize() {
  const size = map.value.getSize();
  return {
    w: typeof size.getWidth === 'function' ? size.getWidth() : size.width,
    h: typeof size.getHeight === 'function' ? size.getHeight() : size.height,
  };
}

/** 安全区：避开 KPI、左右面板，上方留出气泡高度 */
function safeRect() {
  const { w, h } = mapSize();
  const side = w > 980 ? 1 : 0.4;
  return { left: 250 * side + 30, right: w - 290 * side - 30, top: 210, bottom: h - 60 };
}

/**
 * 地图有俯仰角时 setBounds 估算不准：逐步缩小直到所有学校都落进安全区，
 * 再一次性平滑过渡到目标视野
 */
function fitPoints(list, animate = true) {
  const m = map.value;
  if (!m || !list.length) return;
  const startZoom = m.getZoom();
  const startCenter = m.getCenter();
  const lngs = list.map((s) => s.lng);
  const lats = list.map((s) => s.lat);
  const center = [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
  const rect = safeRect();
  let zoom = 16;
  if (list.length > 1) {
    m.setBounds(new AMapRef.Bounds([Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]), true, MAP_AVOID);
    zoom = Math.min(m.getZoom() + 0.7, 17);
  }
  for (let i = 0; i < 24; i += 1) {
    m.setZoomAndCenter(zoom, center, true);
    const { w, h } = mapSize();
    const mid = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
    const pts = list.map((s) => pixelOf(s.lng, s.lat));
    const box = {
      minX: Math.min(...pts.map((p) => p.x)),
      maxX: Math.max(...pts.map((p) => p.x)),
      minY: Math.min(...pts.map((p) => p.y)),
      maxY: Math.max(...pts.map((p) => p.y)),
    };
    const shifted = m.containerToLngLat(new AMapRef.Pixel(
      w / 2 + (box.minX + box.maxX) / 2 - mid.x,
      h / 2 + (box.minY + box.maxY) / 2 - mid.y,
    ));
    center[0] = shifted.getLng();
    center[1] = shifted.getLat();
    const fits = box.maxX - box.minX <= rect.right - rect.left && box.maxY - box.minY <= rect.bottom - rect.top;
    if (fits || zoom <= 4) break;
    zoom -= 0.3;
  }
  m.setZoomAndCenter(zoom, center, true);
  if (animate) {
    m.setZoomAndCenter(startZoom, startCenter, true);
    m.setZoomAndCenter(zoom, center, false, 600);
  }
}

function expandCluster(group) {
  fitPoints(group);
}

function fitAll() {
  const list = visible.value.length ? visible.value : placed.value;
  if (!map.value || !list.length) return;
  if (list.length === 1) {
    map.value.setZoomAndCenter(14, [list[0].lng, list[0].lat], true);
    return;
  }
  fitPoints(list, false);
}

/** 只要浅色楼块，不要高德默认的立式标注；地名改由贴地文字绘制 */
function softenMap(m) {
  try {
    m.setFeatures(['bg', 'road', 'building']);
    m.setStatus({ showLabel: false });
  } catch {
    /* 部分版本无 setStatus */
  }
}

const districtCache = new Map();
let groundEl = null;
let groundItems = [];
let groundToken = 0;
let groundTimer = 0;
let lastGroundKey = '';

function ensureGroundLayer() {
  const host = mapEl.value?.querySelector('.amap-maps') || mapEl.value;
  if (!host) return null;
  if (!groundEl) {
    groundEl = document.createElement('div');
    groundEl.className = 'svm-ground';
  }
  if (groundEl.parentElement !== host) host.appendChild(groundEl);
  return groundEl;
}

function inView(m, lng, lat) {
  const bounds = m.getBounds?.();
  if (!bounds?.getSouthWest || !bounds?.getNorthEast) return true;
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return lng >= sw.getLng() && lng <= ne.getLng() && lat >= sw.getLat() && lat <= ne.getLat();
}

function pointOfCenter(center) {
  if (!center) return null;
  const lng = typeof center.getLng === 'function' ? center.getLng() : center.lng;
  const lat = typeof center.getLat === 'function' ? center.getLat() : center.lat;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

function districtChildren(keyword) {
  const name = String(keyword || '').replace(/市辖区/g, '').trim();
  if (!name || !AMapRef?.DistrictSearch) return Promise.resolve([]);
  if (districtCache.has(name)) return Promise.resolve(districtCache.get(name));
  return new Promise((resolve) => {
    try {
      const search = new AMapRef.DistrictSearch({
        level: /省|自治区/.test(name) ? 'province' : 'city',
        subdistrict: 1,
        extensions: 'base',
        showbiz: false,
      });
      search.search(name, (status, result) => {
        const children = status === 'complete' ? (result?.districtList?.[0]?.districtList || []) : [];
        const list = children.map((item) => {
          const point = pointOfCenter(item.center);
          return point ? { name: item.name, ...point, kind: 'area' } : null;
        }).filter(Boolean);
        districtCache.set(name, list);
        resolve(list);
      });
    } catch {
      resolve([]);
    }
  });
}

function searchInBounds(keyword, bounds, citycode) {
  if (!AMapRef?.PlaceSearch || !bounds) return Promise.resolve([]);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), 6000);
    try {
      const options = { pageSize: 12, extensions: 'base' };
      if (citycode) {
        options.city = citycode;
        options.citylimit = true;
      }
      const ps = new AMapRef.PlaceSearch(options);
      ps.searchInBounds(keyword, bounds, (status, result) => {
        clearTimeout(timer);
        resolve(status === 'complete' ? (result?.poiList?.pois || []) : []);
      });
    } catch {
      clearTimeout(timer);
      resolve([]);
    }
  });
}

function shortPlaceName(name) {
  const text = String(name || '').replace(/[（(].*?[）)]/g, '').trim();
  return text.length > 10 ? `${text.slice(0, 10)}…` : text;
}

function cityOf(m) {
  return new Promise((resolve) => {
    if (!m?.getCity) {
      resolve({});
      return;
    }
    m.getCity((info) => resolve(info || {}));
  });
}

function takeSpread(m, list, limit) {
  const chosen = [];
  const cells = new Set();
  const { w, h } = mapSize();
  const schoolNames = new Set(placed.value.map((s) => s.name));
  for (const item of list) {
    if (!item?.name || schoolNames.has(item.name)) continue;
    if (!inView(m, item.lng, item.lat)) continue;
    const p = pixelOf(item.lng, item.lat);
    if (p.x < 12 || p.y < 12 || p.x > w - 12 || p.y > h - 12) continue;
    const onSchool = placed.value.some((s) => {
      const sp = pixelOf(s.lng, s.lat);
      return Math.hypot(sp.x - p.x, sp.y - p.y) < 108;
    });
    if (onSchool) continue;
    const cell = `${Math.round(p.x / 132)}:${Math.round(p.y / 54)}`;
    if (cells.has(cell)) continue;
    cells.add(cell);
    chosen.push(item);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

async function refreshGround() {
  const m = map.value;
  if (!m || !AMapRef || disposed) return;
  const center = m.getCenter();
  const zoom = m.getZoom();
  const key = `${zoom.toFixed(0)}:${center.getLng().toFixed(2)}:${center.getLat().toFixed(2)}`;
  if (key === lastGroundKey && groundItems.length) {
    if (!groundEl?.isConnected) paintGround();
    else layoutGround();
    return;
  }
  const token = ++groundToken;
  const info = await cityOf(m);
  if (token !== groundToken || disposed || !map.value) return;
  const areas = [];
  if (zoom < 10 && info.province && info.province !== info.city) areas.push(...await districtChildren(info.province));
  if (token !== groundToken || disposed || !map.value) return;
  areas.push(...await districtChildren(info.city || info.province));
  if (token !== groundToken || disposed || !map.value) return;
  let places = [];
  if (zoom >= 10) {
    const bounds = m.getBounds();
    const batches = await Promise.all([
      searchInBounds('大厦', bounds, info.citycode),
      searchInBounds('公园', bounds, info.citycode),
      searchInBounds('地铁站', bounds, info.citycode),
    ]);
    const seen = new Set();
    for (const [index, rows] of batches.entries()) {
      const word = ['大厦', '公园', '地铁站'][index];
      for (const poi of rows) {
        const point = pointOfCenter(poi.location);
        const name = shortPlaceName(poi.name);
        if (!point || !name || seen.has(name)) continue;
        seen.add(name);
        const kind = word === '大厦' || /大厦|大楼|中心|广场/.test(name) ? 'building' : 'place';
        places.push({ name, ...point, kind });
      }
    }
  }
  if (token !== groundToken || disposed || !map.value) return;
  lastGroundKey = key;
  const areaLabels = takeSpread(map.value, areas, zoom >= 14 ? 3 : 8);
  const placeLabels = takeSpread(map.value, places, 10);
  groundItems = [...areaLabels, ...placeLabels];
  paintGround();
}

function scheduleGround() {
  clearTimeout(groundTimer);
  groundTimer = setTimeout(() => { refreshGround().catch(() => {}); }, 420);
}

function paintGround() {
  const layer = ensureGroundLayer();
  if (!layer) return;
  layer.replaceChildren();
  for (const item of groundItems) {
    const el = document.createElement('span');
    el.className = `svm-ground-label ${item.kind}`;
    el.textContent = item.name;
    el.dataset.lng = String(item.lng);
    el.dataset.lat = String(item.lat);
    el.dataset.kind = item.kind;
    layer.appendChild(el);
  }
  layoutGround();
}

function layoutGround() {
  const m = map.value;
  if (!m || !groundEl) return;
  const pitch = Number(m.getPitch?.() || 0);
  const rot = -Number(m.getRotation?.() || 0);
  const zoom = Number(m.getZoom?.() || 12);
  for (const el of groundEl.children) {
    const lng = Number(el.dataset.lng);
    const lat = Number(el.dataset.lat);
    const p = m.lngLatToContainer(new AMapRef.LngLat(lng, lat));
    const x = typeof p.getX === 'function' ? p.getX() : p.x;
    const y = typeof p.getY === 'function' ? p.getY() : p.y;
    const base = el.dataset.kind === 'area' ? 1.05 : el.dataset.kind === 'building' ? 0.92 : 0.84;
    const scale = base * Math.max(0.72, Math.min(1.22, 0.58 + (zoom - 9) * 0.08));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transform = `translate(-50%, -50%) rotateX(${pitch.toFixed(2)}deg) rotateZ(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
  }
}

/** 页面切走时容器尺寸会变成 0，切回来要重新铺满并解开拖动锁 */
function resumeMap(attempt = 0) {
  const m = map.value;
  const box = mapEl.value;
  if (!m || !box || disposed) return;
  if (box.clientWidth < 20 && attempt < 10) {
    requestAnimationFrame(() => resumeMap(attempt + 1));
    return;
  }
  mapDragged = false;
  rootEl.value?.classList.remove('is-dragging');
  try {
    m.setStatus({ dragEnable: false });
    m.resize();
    m.setStatus({
      dragEnable: true,
      zoomEnable: true,
      rotateEnable: true,
      pitchEnable: true,
      doubleClickZoom: true,
    });
  } catch {
    /* ignore */
  }
  applyZoomScale();
  if (groundItems.length && !groundEl?.isConnected) paintGround();
  else layoutGround();
}

async function initMap() {
  mapState.value = 'loading';
  try {
    const AMap = await loadAmap(base.value.amap);
    if (disposed) return;
    AMapRef = AMap;
    // 优先马卡龙粉彩底图；部分 Key 可能不支持时回退 fresh / normal
    const styles = ['amap://styles/macaron', 'amap://styles/fresh', 'amap://styles/light'];
    const m = new AMap.Map(mapEl.value, {
      viewMode: '3D',
      pitch: 42,
      zoom: 11,
      zooms: [4, 19],
      center: placed.value[0] ? [placed.value[0].lng, placed.value[0].lat] : [121.47, 31.23],
      mapStyle: styles[0],
      features: ['bg', 'road', 'building'],
      showBuildingBlock: true,
      showLabel: false,
      wallColor: 'rgba(214, 224, 248, 0.92)',
      roofColor: 'rgba(246, 242, 255, 0.96)',
      showIndoorMap: false,
      jogEnable: true,
      animateEnable: true,
      skyColor: '#dce9ff',
    });
    map.value = m;
    let styleIdx = 0;
    m.on('error', () => {
      styleIdx += 1;
      if (styleIdx < styles.length) {
        try { m.setMapStyle(styles[styleIdx]); } catch { /* ignore */ }
      }
    });
    m.on('click', () => {
      if (mapDragged || Date.now() - markerClickAt < 80) return;
      closeCard();
    });
    m.on('dragstart', onMapDragStart);
    m.on('dragend', onMapDragEnd);
    m.on('zoomchange', () => {
      applyZoomScale();
      layoutGround();
    });
    m.on('mapmove', layoutGround);
    m.on('rotatechange', layoutGround);
    m.on('zoomend', () => {
      renderMarkers();
      scheduleGround();
    });
    m.on('moveend', scheduleGround);
    m.on('resize', () => {
      renderMarkers();
      layoutGround();
    });
    m.on('complete', () => {
      mapState.value = 'ready';
      softenMap(m);
      ensureGroundLayer();
      applyZoomScale();
      renderMarkers();
      scheduleGround();
    });
    fitAll();
    applyZoomScale();
    setTimeout(() => {
      if (mapState.value === 'loading' && map.value) {
        mapState.value = 'ready';
        softenMap(map.value);
        ensureGroundLayer();
        renderMarkers();
        scheduleGround();
      }
    }, 4000);
  } catch (err) {
    mapState.value = 'error';
    mapError.value = err?.message || '高德地图加载失败';
  }
}

/* ---------- 学校卡片 ---------- */

function openSchool(s) {
  if (activeId.value !== s.id) metaOpen.value = false;
  activeId.value = s.id;
  renderMarkers();
  focusOn(s);
  startCardLoop();
}

function focusSchool(s) {
  if (s.lng == null || s.lat == null) {
    notify.warn(`「${s.name}」还没有设置坐标`);
    return;
  }
  if (!visible.value.some((v) => v.id === s.id)) Object.assign(filters, { type: 'all', mode: 'all', tier: 'all' });
  nextTick(() => openSchool(s));
}

/** 把学校移到视野左侧偏中的位置，右侧留给详情卡片；先算好终点再一次性平滑过渡 */
function focusOn(s) {
  const m = map.value;
  if (!m) return;
  const startZoom = m.getZoom();
  const startCenter = m.getCenter();
  const zoom = Math.min(Math.max(startZoom, 15), 17);
  m.setZoomAndCenter(zoom, [s.lng, s.lat], true);
  const { w, h } = mapSize();
  const p = pixelOf(s.lng, s.lat);
  const target = { x: Math.max(300, w * 0.36), y: h * 0.62 };
  const center = m.containerToLngLat(new AMapRef.Pixel(w / 2 + (p.x - target.x), h / 2 + (p.y - target.y)));
  m.setZoomAndCenter(startZoom, startCenter, true);
  m.setZoomAndCenter(zoom, center, false, 650);
}

function closeCard() {
  if (!activeId.value) return;
  activeId.value = null;
  cardPos.value = null;
  stopCardLoop();
  renderMarkers();
}

function updateCardPos() {
  const m = map.value;
  const s = active.value;
  const root = rootEl.value;
  if (!m || !s || !root) return;
  const w = root.clientWidth;
  const hgt = root.clientHeight;
  const card = cardEl.value;
  const cw = card?.offsetWidth || 360;
  const ch = card?.offsetHeight || 460;
  const p = pixelOf(s.lng, s.lat);
  const lift = 74 * s.tier.scale * zoomScale(m.getZoom());
  const minTop = hgt - ch - 10 >= 92 ? 92 : 10;
  const sideTop = Math.max(minTop, Math.min(hgt - ch - 10, p.y - lift / 2 - ch * 0.45));
  const sideY = (top) => Math.max(top + 24, Math.min(top + ch - 24, p.y - lift / 2));
  let left;
  let top;
  let ax;
  let ay;
  if (p.x + 96 + cw <= w - 10) {
    left = p.x + 96;
    top = sideTop;
    ax = left;
    ay = sideY(top);
  } else if (p.x - 96 - cw >= 10) {
    left = p.x - 96 - cw;
    top = sideTop;
    ax = left + cw;
    ay = sideY(top);
  } else if (p.y - lift - 18 - ch >= 10) {
    top = p.y - lift - 18 - ch;
    left = Math.max(10, Math.min(w - cw - 10, p.x - cw / 2));
    ax = Math.max(left + 24, Math.min(left + cw - 24, p.x));
    ay = top + ch;
  } else {
    top = Math.min(hgt - ch - 10, p.y + 30);
    left = Math.max(10, Math.min(w - cw - 10, p.x - cw / 2));
    ax = Math.max(left + 24, Math.min(left + cw - 24, p.x));
    ay = top;
  }
  cardPos.value = { left, top, ax, ay, px: p.x, py: p.y, w, h: hgt };
}

function startCardLoop() {
  stopCardLoop();
  const loop = () => {
    updateCardPos();
    cardRaf = requestAnimationFrame(loop);
  };
  cardRaf = requestAnimationFrame(loop);
}

function stopCardLoop() {
  if (cardRaf) cancelAnimationFrame(cardRaf);
  cardRaf = 0;
}

async function saveMeta(key, value) {
  const s = active.value;
  if (!s) return;
  try {
    await api.saveSchoolMapMeta(s.id, { [key]: value });
    const target = base.value.schools.find((item) => item.id === s.id);
    if (target) target[key] = value;
    renderMarkers();
    notify.success('已更新学校分类');
  } catch (err) {
    notify.error(err.message || '保存失败');
  }
}

/* ---------- 数据 ---------- */

async function load() {
  const data = await api.schoolMap(semesterId.value || undefined);
  base.value = data;
  if (data?.semester?.id) semesterId.value = data.semester.id;
}

async function switchSemester(id) {
  const next = Number(id);
  if (!next || next === semesterId.value) return;
  semesterId.value = next;
  counted.clear();
  await load();
  renderMarkers();
}

async function reload() {
  try {
    await load();
    if (!map.value) await initMap();
    else renderMarkers();
  } catch (err) {
    mapState.value = 'error';
    mapError.value = err?.message || '加载失败';
  }
}

function onKey(event) {
  if (event.key === 'Escape') closeCard();
}

watch(visible, () => {
  if (active.value && !visible.value.some((s) => s.id === active.value.id)) closeCard();
  renderMarkers();
});

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('mouseup', onWindowMouseUp);
  rootEl.value?.addEventListener('selectstart', onMapSelectStart);
  rootEl.value?.addEventListener('dragstart', onMapSelectStart);
  try {
    await load();
    await initMap();
  } catch (err) {
    mapState.value = 'error';
    mapError.value = err?.message || '加载失败';
  }
});

let firstActivate = true;
onActivated(async () => {
  if (firstActivate) {
    firstActivate = false;
    return;
  }
  resumeMap();
  try {
    await load();
    renderMarkers();
    scheduleGround();
  } catch {
    /* 静默刷新失败时保留现有画面 */
  }
});

onDeactivated(() => {
  mapDragged = false;
  rootEl.value?.classList.remove('is-dragging');
  clearTimeout(groundTimer);
});

onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(groundTimer);
  groundToken += 1;
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('mouseup', onWindowMouseUp);
  rootEl.value?.removeEventListener('selectstart', onMapSelectStart);
  rootEl.value?.removeEventListener('dragstart', onMapSelectStart);
  stopCardLoop();
  map.value?.destroy();
  map.value = null;
  markers = [];
});

defineExpose({ reload });
</script>

<style>
.svm {
  --svm-zoom: 1;
  position: relative;
  height: calc(100vh - var(--chrome-h, 64px) - 88px);
  min-height: 640px;
  border-radius: 22px;
  overflow: hidden;
  background: linear-gradient(160deg, #e8f0ff 0%, #efeaff 48%, #e8f8f3 100%);
  box-shadow: 0 1px 2px rgba(16, 24, 40, .04), 0 18px 48px -22px rgba(79, 70, 229, .28);
  isolation: isolate;
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}
.svm img, .svm svg { -webkit-user-drag: none; }

.svm-map { position: absolute; inset: 0; cursor: grab; }
.svm-map .amap-markers { z-index: 30; }
.svm-map .amap-maps,
.svm-map .amap-layers,
.svm-map canvas { cursor: grab; }
.svm-ground {
  position: absolute; inset: 0; z-index: 12; overflow: hidden; pointer-events: none;
  perspective: 720px; perspective-origin: 50% 36%;
}
.svm-ground-label {
  position: absolute; left: 0; top: 0; transform-origin: center center;
  font-weight: 800; line-height: 1; white-space: nowrap; letter-spacing: .08em;
  color: rgba(71, 86, 138, .72);
  text-shadow:
    0 1px 0 rgba(255, 255, 255, .96),
    0 2px 0 rgba(186, 198, 230, .7),
    0 3px 0 rgba(150, 168, 214, .38),
    0 8px 10px rgba(64, 84, 140, .16);
}
.svm-ground-label.area { font-size: 20px; letter-spacing: .34em; color: rgba(63, 78, 132, .52); }
.svm-ground-label.building { font-size: 13px; letter-spacing: .06em; color: rgba(78, 68, 132, .7); }
.svm-ground-label.place { font-size: 12px; letter-spacing: .04em; font-weight: 700; color: rgba(46, 96, 118, .66); }
.svm.is-dragging .svm-map,
.svm.is-dragging .svm-map .amap-maps,
.svm.is-dragging .svm-map .amap-layers,
.svm.is-dragging .svm-map canvas,
.svm.is-dragging .amap-marker,
.svm.is-dragging .amap-marker * { cursor: grabbing !important; }
/* 卡通化：降饱和、提亮、柔化对比，让高德底图更像插画城市场景 */
.svm-map canvas.amap-layer {
  filter: saturate(.28) brightness(1.12) contrast(.82) hue-rotate(8deg);
}
.svm-map .amap-logo, .svm-map .amap-copyright { opacity: .4; filter: grayscale(.4); }

.svm-vignette {
  position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background:
    radial-gradient(120% 90% at 50% 55%, transparent 52%, rgba(232, 240, 255, .78) 100%),
    linear-gradient(180deg, rgba(220, 233, 255, .82) 0%, transparent 16%, transparent 84%, rgba(236, 241, 255, .7) 100%),
    linear-gradient(90deg, rgba(243, 240, 255, .35) 0%, transparent 18%, transparent 82%, rgba(232, 248, 243, .35) 100%);
}

.svm-map-fallback {
  position: absolute; inset: 0; z-index: 2; display: grid; place-items: center;
  background: linear-gradient(160deg, #eef4ff 0%, #f3f0ff 55%, #eefaf6 100%);
}
.svm-fallback-box { text-align: center; color: #475467; }
.svm-fallback-box strong { display: block; font-size: 16px; color: #1d2939; margin-top: 4px; }
.svm-fallback-box p { margin: 6px 0 14px; font-size: 13px; }
.svm-fallback-art { width: 120px; margin: 0 auto; }
.svm-fallback-actions { display: flex; gap: 8px; justify-content: center; }
.svm-spinner {
  display: inline-block; width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid rgba(99, 102, 241, .18); border-top-color: #6366f1;
  animation: svm-spin .9s linear infinite;
}

.svm-layer { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.svm-layer > * { pointer-events: auto; }

.svm-glass {
  background: rgba(255, 255, 255, .62);
  border: 1px solid rgba(255, 255, 255, .85);
  box-shadow: 0 10px 30px -12px rgba(52, 64, 120, .28), inset 0 1px 0 rgba(255, 255, 255, .9);
  backdrop-filter: blur(14px) saturate(1.3);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  border-radius: 16px;
}

/* KPI */
.svm-kpis {
  position: absolute; top: 14px; left: 14px; right: 14px;
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;
}
.svm-kpi { display: flex; align-items: center; gap: 12px; padding: 12px 16px; min-width: 0; }
.svm-kpi-icon {
  flex: none; width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; color: #fff;
  box-shadow: 0 6px 14px -6px currentColor;
}
.svm-kpi-icon svg { width: 18px; height: 18px; }
.svm-kpi-icon.school { background: linear-gradient(135deg, #60a5fa, #6366f1); }
.svm-kpi-icon.teacher { background: linear-gradient(135deg, #2dd4bf, #0ea5e9); }
.svm-kpi-icon.course { background: linear-gradient(135deg, #fbbf24, #fb7185); }
.svm-kpi-icon.profit { background: linear-gradient(135deg, #a78bfa, #ec4899); }
.svm-kpi-body { min-width: 0; }
.svm-kpi-label { font-size: 12px; color: #667085; display: flex; align-items: center; gap: 6px; }
.svm-kpi-label em, .svm-bubble-row em, .svm-card-profit em {
  font-style: normal; font-size: 10px; line-height: 16px; padding: 0 6px; border-radius: 999px;
  color: #6d4cf5; background: rgba(124, 92, 252, .1);
}
.svm-kpi-value { font-size: 22px; font-weight: 750; color: #101828; letter-spacing: -.3px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.svm-kpi-value small { font-size: 12px; font-weight: 500; color: #98a2b3; margin-left: 3px; }
.svm-kpi-value.muted { color: #98a2b3; }
.svm-unlock {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border-radius: 999px;
  border: 0; cursor: pointer; font-size: 12px; font-weight: 600; color: #fff;
  background: linear-gradient(135deg, #8b5cf6, #6366f1); box-shadow: 0 6px 14px -6px rgba(99, 102, 241, .8);
}
.svm-unlock svg { width: 13px; height: 13px; }

/* 筛选 & TOP5 */
.svm-panel-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: #1d2939; margin-bottom: 10px; }
.svm-panel-title svg { width: 15px; height: 15px; color: #6366f1; }
.svm-filter { position: absolute; left: 14px; top: 96px; width: 220px; padding: 14px; max-height: calc(100% - 160px); overflow: auto; }
.svm-filter-group + .svm-filter-group { margin-top: 12px; }
.svm-filter-label { font-size: 11px; color: #98a2b3; margin-bottom: 6px; display: flex; justify-content: space-between; }
.svm-term {
  width: 100%; height: 32px; padding: 0 8px; border-radius: 10px;
  border: 1px solid rgba(99, 102, 241, .28); background: #fff; color: #344054; font-size: 12.5px;
}
.svm-filter-hint { color: #a78bfa; }
.svm-chip {
  display: flex; width: 100%; align-items: center; justify-content: space-between; height: 30px; padding: 0 10px; margin-bottom: 4px;
  border: 1px solid transparent; border-radius: 10px; background: transparent; color: #475467; font-size: 12.5px; cursor: pointer;
  transition: background .2s, color .2s, border-color .2s;
}
.svm-chip b { font-weight: 600; font-size: 11px; color: #98a2b3; }
.svm-chip:hover:not(:disabled) { background: rgba(255, 255, 255, .8); }
.svm-chip.on { background: #fff; color: #4f46e5; border-color: rgba(99, 102, 241, .28); font-weight: 600; box-shadow: 0 4px 12px -6px rgba(79, 70, 229, .45); }
.svm-chip.on b { color: #6366f1; }
.svm-chip:disabled { opacity: .45; cursor: not-allowed; }
.svm-unplaced { margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(251, 191, 36, .12); color: #b45309; font-size: 12px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.svm-unplaced svg { width: 13px; height: 13px; }
.svm-unplaced a { color: #4f46e5; font-weight: 600; margin-left: auto; }

.svm-top { position: absolute; right: 14px; top: 96px; width: 268px; padding: 14px 12px 10px; }
.svm-top .svm-panel-title svg { color: #f59e0b; }
.svm-rank {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 6px; border: 0; border-radius: 12px;
  background: transparent; cursor: pointer; text-align: left; transition: background .2s, transform .2s;
}
.svm-rank:hover { background: rgba(255, 255, 255, .85); transform: translateX(-2px); }
.svm-rank.on { background: #fff; box-shadow: 0 4px 14px -6px rgba(79, 70, 229, .4); }
.svm-rank-no { flex: none; width: 20px; height: 20px; border-radius: 7px; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #667085; background: #eef2f6; }
.svm-rank-no.no1 { color: #fff; background: linear-gradient(135deg, #fbbf24, #f97316); }
.svm-rank-no.no2 { color: #fff; background: linear-gradient(135deg, #cbd5e1, #94a3b8); }
.svm-rank-no.no3 { color: #fff; background: linear-gradient(135deg, #fdba74, #c2410c); }
.svm-rank-icon { flex: none; width: 34px; height: 34px; }
.svm-rank-icon svg { width: 100%; height: 100%; }
.svm-rank-name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.svm-rank-name strong { font-size: 12.5px; color: #1d2939; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.svm-rank-name small { font-size: 11px; color: #98a2b3; }
.svm-rank-value { font-size: 13px; font-weight: 750; color: #4f46e5; font-variant-numeric: tabular-nums; white-space: nowrap; }
.svm-rank-value.muted { color: #c0c6d4; }
.svm-rank-value svg { width: 13px; height: 13px; }
.svm-top-foot { margin: 6px 6px 0; font-size: 11px; color: #98a2b3; }
.svm-empty { padding: 14px 6px; text-align: center; font-size: 12px; color: #98a2b3; }
.svm-empty.small { padding: 4px 0; text-align: left; }

.svm-legend { position: absolute; left: 14px; bottom: 14px; display: flex; gap: 14px; padding: 8px 14px; font-size: 12px; color: #475467; }
.svm-legend-item { display: inline-flex; align-items: center; gap: 5px; }
.svm-legend-item small { color: #98a2b3; }
.svm-legend-item i { width: 10px; height: 10px; border-radius: 50%; background: #cbd5e1; }
.svm-legend-item.tier-S i { background: linear-gradient(135deg, #fbbf24, #f472b6); box-shadow: 0 0 0 3px rgba(251, 191, 36, .25); width: 13px; height: 13px; }
.svm-legend-item.tier-A i { background: linear-gradient(135deg, #a78bfa, #6366f1); width: 12px; height: 12px; }
.svm-legend-item.tier-B i { background: linear-gradient(135deg, #67e8f9, #3b82f6); }
.svm-legend-item.tier-N i { background: #cbd5e1; width: 8px; height: 8px; }

/* 学校标记 */
.svm-pin { position: relative; width: 0; height: 0; cursor: pointer; --svm-s: calc(var(--svm-tier, 1) * var(--svm-zoom, 1)); }
.svm-pin::before {
  content: ''; position: absolute; left: -56px; top: -150px; width: 112px; height: 190px;
}
.svm-art {
  position: absolute; left: -42px; top: -57.6px; width: 84px; height: 85.4px;
  transform-origin: 42px 57.6px; transform: scale(var(--svm-s));
  transition: transform .35s cubic-bezier(.34, 1.56, .64, 1);
}
.svm-building {
  position: relative; z-index: 2; width: 100%; height: 100%; display: block;
  filter: drop-shadow(0 6px 6px rgba(60, 72, 130, .18));
  animation: svm-float 4.2s ease-in-out infinite; animation-delay: var(--svm-delay, 0s);
}
.svm-pin:hover .svm-art { transform: scale(calc(var(--svm-s) * 1.05)); }
.svm-pin.is-active .svm-art { transform: scale(calc(var(--svm-s) * 1.1)); }
.svm-shadow {
  position: absolute; z-index: 1; left: 50%; top: 62%; width: 86%; height: 30%; transform: translate(-50%, -50%);
  border-radius: 50%; background: radial-gradient(closest-side, rgba(45, 55, 110, .22), transparent);
}
.svm-halo {
  position: absolute; z-index: 0; left: 50%; top: 66%; width: 150%; height: 66%; transform: translate(-50%, -50%);
  border-radius: 50%; opacity: 0; pointer-events: none;
}
.svm-pin.tier-S .svm-halo {
  opacity: 1;
  background: radial-gradient(closest-side, rgba(251, 191, 36, .55), rgba(244, 114, 182, .22) 60%, transparent);
  animation: svm-halo 3.2s ease-in-out infinite;
}
.svm-pin.tier-A .svm-halo {
  opacity: .8;
  background: radial-gradient(closest-side, rgba(139, 92, 246, .32), transparent);
}
.svm-ripple {
  position: absolute; z-index: 1; left: 50%; top: 66%; width: 90%; height: 46%; transform: translate(-50%, -50%) scale(.4);
  border-radius: 50%; border: 2px solid rgba(99, 102, 241, .65); opacity: 0; pointer-events: none;
}
.svm-pin.is-active .svm-ripple { animation: svm-ripple 1.6s ease-out infinite; }
.svm-flag { transform-box: fill-box; transform-origin: left center; animation: svm-flag 2.4s ease-in-out infinite; }

.svm-stem {
  position: absolute; left: -.5px; width: 1px; height: 16px;
  bottom: calc(52px * var(--svm-s) + 2px);
  background: linear-gradient(180deg, rgba(99, 102, 241, .65), rgba(99, 102, 241, 0));
  animation: svm-float 4.2s ease-in-out infinite; animation-delay: var(--svm-delay, 0s);
}
.svm-bubble {
  position: absolute; left: 0; bottom: calc(52px * var(--svm-s) + 18px); transform: translateX(-50%);
  min-width: 112px; padding: 6px 11px 7px; border-radius: 12px; white-space: nowrap; text-align: left;
  background: rgba(255, 255, 255, .78);
  border: 1px solid rgba(255, 255, 255, .95);
  box-shadow: 0 8px 22px -10px rgba(52, 64, 140, .45), inset 0 1px 0 #fff;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  animation: svm-float-bubble 4.2s ease-in-out infinite; animation-delay: var(--svm-delay, 0s);
  transition: box-shadow .25s, border-color .25s;
}
.svm-bubble::after {
  content: ''; position: absolute; left: 50%; bottom: -4px; width: 7px; height: 7px; transform: translateX(-50%) rotate(45deg);
  background: rgba(255, 255, 255, .9); border-right: 1px solid rgba(255, 255, 255, .95); border-bottom: 1px solid rgba(255, 255, 255, .95);
}
.svm-bubble-name { font-size: 11px; font-weight: 650; color: #344054; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.svm-bubble-row { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #98a2b3; margin-top: 1px; }
.svm-bubble-row em { font-size: 9px; line-height: 14px; padding: 0 5px; }
.svm-bubble-value { display: block; font-size: 15px; font-weight: 800; color: #4338ca; letter-spacing: -.2px; font-variant-numeric: tabular-nums; }
.svm-bubble-value.locked { font-size: 12px; font-weight: 600; color: #8b5cf6; }
.svm-pin.tier-S .svm-bubble { border-color: rgba(251, 191, 36, .7); box-shadow: 0 10px 26px -10px rgba(245, 158, 11, .55), inset 0 1px 0 #fff; }
.svm-pin.tier-S .svm-bubble-value { background: linear-gradient(90deg, #f59e0b, #ec4899); -webkit-background-clip: text; background-clip: text; color: transparent; font-size: 17px; }
.svm-pin.tier-A .svm-bubble-value { color: #6d28d9; font-size: 16px; }
.svm-pin.tier-N .svm-bubble { min-width: 96px; padding: 5px 9px 6px; }
.svm-pin.tier-N .svm-bubble-value { font-size: 13.5px; color: #475467; }
.svm-pin:hover .svm-bubble, .svm-pin.is-active .svm-bubble { border-color: rgba(99, 102, 241, .45); box-shadow: 0 12px 28px -10px rgba(79, 70, 229, .55), inset 0 1px 0 #fff; }

.svm-cluster { position: relative; width: 0; height: 0; cursor: pointer; }
.svm-cluster-bubble {
  position: absolute; left: 0; top: 0; transform: translate(-50%, -50%);
  display: flex; align-items: center; gap: 8px; padding: 6px 14px 6px 8px; border-radius: 999px; white-space: nowrap;
  background: rgba(255, 255, 255, .82); border: 1px solid #fff;
  box-shadow: 0 10px 26px -10px rgba(79, 70, 229, .55), inset 0 1px 0 #fff;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  transition: transform .25s cubic-bezier(.34, 1.56, .64, 1);
  z-index: 2;
}
.svm-cluster:hover .svm-cluster-bubble { transform: translate(-50%, -50%) scale(1.06); }
.svm-cluster-icons { display: flex; }
.svm-cluster-icons svg { width: 34px; height: 34px; }
.svm-cluster-icons svg + svg { margin-left: -16px; }
.svm-cluster-text { display: flex; flex-direction: column; line-height: 1.25; }
.svm-cluster-text b { font-size: 13px; color: #1d2939; }
.svm-cluster-text small { font-size: 11px; color: #6366f1; font-weight: 600; }
.svm-cluster-ring {
  position: absolute; left: 0; top: 0; width: 110px; height: 110px; transform: translate(-50%, -50%);
  border-radius: 50%; background: radial-gradient(closest-side, rgba(129, 140, 248, .28), transparent); z-index: 1;
  animation: svm-halo 3.4s ease-in-out infinite;
}

/* 指示线 */
.svm-pointer { position: absolute; left: 0; top: 0; z-index: 4; pointer-events: none; overflow: visible; }
.svm-pointer line { stroke: rgba(99, 102, 241, .7); stroke-width: 1.4; stroke-dasharray: 4 4; }
.svm-pointer circle { fill: #6366f1; }
.svm-pointer .svm-pointer-ring { fill: none; stroke: rgba(99, 102, 241, .5); stroke-width: 1.4; animation: svm-ring 1.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }

/* 详情卡片 */
.svm-card {
  position: absolute; z-index: 5; width: 368px; max-height: calc(100% - 20px); overflow: auto;
  padding: 14px 14px 12px; border-radius: 20px;
  background: rgba(255, 255, 255, .78);
  border: 1px solid rgba(255, 255, 255, .95);
  box-shadow: 0 24px 60px -20px rgba(45, 55, 130, .45), inset 0 1px 0 #fff;
  backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
  scrollbar-width: thin;
}
.svm-card-enter-active { transition: opacity .35s ease, transform .45s cubic-bezier(.22, 1, .36, 1); }
.svm-card-leave-active { transition: opacity .2s ease, transform .2s ease; }
.svm-card-enter-from { opacity: 0; transform: translateY(36px) scale(.98); }
.svm-card-leave-to { opacity: 0; transform: translateY(12px); }
.svm-card-close {
  position: absolute; right: 10px; top: 10px; width: 28px; height: 28px; border-radius: 9px; border: 0; cursor: pointer;
  display: grid; place-items: center; color: #667085; background: rgba(241, 244, 249, .9);
}
.svm-card-close:hover { background: #e4e7ec; color: #101828; }
.svm-card-close svg { width: 14px; height: 14px; }
.svm-card-head { display: flex; gap: 10px; align-items: center; padding-right: 28px; }
.svm-card-art { flex: none; width: 54px; height: 54px; }
.svm-card-art svg { width: 100%; height: 100%; }
.svm-card-head h3 { margin: 0; font-size: 16px; color: #101828; line-height: 1.3; }
.svm-card-tags { display: flex; gap: 4px; margin-top: 5px; flex-wrap: wrap; }
.svm-tag { font-size: 10.5px; line-height: 18px; padding: 0 7px; border-radius: 999px; background: #eef2f6; color: #475467; }
.svm-tag.type { background: #eef4ff; color: #3b5bdb; }
.svm-tag.mode { background: #ecfdf3; color: #067647; }
.svm-tag.tier-S { background: linear-gradient(90deg, #fef3c7, #fce7f3); color: #b45309; font-weight: 700; }
.svm-tag.tier-A { background: #f3e8ff; color: #6d28d9; font-weight: 700; }
.svm-tag.tier-B { background: #e0f2fe; color: #0369a1; font-weight: 700; }
.svm-tag.tier-N { background: #f2f4f7; color: #667085; }
.svm-card-addr { margin: 4px 0 0; font-size: 11px; color: #98a2b3; }

.svm-card-profit {
  margin-top: 10px; padding: 9px 12px; border-radius: 14px;
  background: linear-gradient(135deg, rgba(99, 102, 241, .1), rgba(236, 72, 153, .08));
  border: 1px solid rgba(129, 140, 248, .22);
}
.svm-card-profit > div { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #667085; }
.svm-card-profit strong {
  display: inline-block; margin-top: 2px; margin-right: 8px; font-size: 26px; font-weight: 800; letter-spacing: -.5px; font-variant-numeric: tabular-nums;
  background: linear-gradient(90deg, #4f46e5, #c026d3); -webkit-background-clip: text; background-clip: text; color: transparent;
}
.svm-card-profit strong.muted { color: #98a2b3; background: none; }
.svm-card-profit .svm-unlock { margin-top: 6px; }
.svm-card-profit small { font-size: 11px; color: #98a2b3; }

.svm-card-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }
.svm-card-stats > div { padding: 6px 4px; border-radius: 12px; background: rgba(255, 255, 255, .7); text-align: center; border: 1px solid rgba(234, 236, 240, .8); }
.svm-card-stats b { display: block; font-size: 16px; color: #101828; font-variant-numeric: tabular-nums; }
.svm-card-stats span { font-size: 10.5px; color: #98a2b3; }

.svm-card-sec { margin-top: 10px; }
.svm-card-sec h4 { margin: 0 0 6px; font-size: 12px; color: #344054; display: flex; align-items: center; gap: 6px; }
.svm-card-sec h4 small { font-weight: 500; color: #a78bfa; font-size: 10.5px; }
.svm-teachers { display: flex; gap: 6px; flex-wrap: wrap; }
.svm-teacher { display: flex; align-items: center; gap: 5px; padding: 3px 8px 3px 3px; border-radius: 999px; background: rgba(255, 255, 255, .75); border: 1px solid rgba(234, 236, 240, .9); }
.svm-teacher img, .svm-avatar {
  width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 2px solid #fff;
  box-shadow: 0 4px 10px -4px rgba(52, 64, 120, .4);
}
.svm-avatar { display: grid; place-items: center; color: #fff; font-size: 11px; font-weight: 700; background: #94a3b8; }
.svm-teacher.more { padding: 3px 10px; background: linear-gradient(135deg, rgba(224, 231, 255, .9), rgba(237, 233, 254, .9)); }
.svm-teacher.more small { color: #4338ca; font-weight: 600; max-width: none; }
.svm-teacher small { font-size: 11.5px; color: #344054; max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.svm-course-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.svm-course-tags span {
  max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11.5px; padding: 3px 9px; border-radius: 999px; font-weight: 600;
}
.svm-course-tags .c0 { color: #4338ca; background: #e0e7ff; }
.svm-course-tags .c1 { color: #0e7490; background: #cffafe; }
.svm-course-tags .c2 { color: #be185d; background: #fce7f3; }
.svm-course-tags .c3 { color: #15803d; background: #dcfce7; }
.svm-course-tags .c4 { color: #c2410c; background: #ffedd5; }
.svm-course-tags .c5 { color: #6d28d9; background: #ede9fe; }
.svm-biz { display: grid; grid-template-columns: 1fr 1fr; column-gap: 14px; border-radius: 14px; background: rgba(255, 255, 255, .7); border: 1px solid rgba(234, 236, 240, .8); padding: 2px 12px; }
.svm-biz > div { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 12px; color: #667085; border-bottom: 1px dashed #eaecf0; }
.svm-biz > .profit { grid-column: 1 / -1; border-bottom: 0; }
.svm-biz span small { display: block; font-size: 10.5px; color: #98a2b3; }
.svm-biz b { font-weight: 650; color: #1d2939; font-variant-numeric: tabular-nums; }
.svm-biz b.cost { color: #b42318; }
.svm-biz .profit span { color: #344054; font-weight: 650; }
.svm-biz .profit b {
  font-size: 18px; font-weight: 800;
  background: linear-gradient(90deg, #4f46e5, #c026d3); -webkit-background-clip: text; background-clip: text; color: transparent;
}
.svm-biz-locked { grid-column: 1 / -1; border-bottom: 0 !important; justify-content: center !important; gap: 6px; color: #8b5cf6 !important; font-size: 12px !important; }
.svm-biz-locked svg { width: 13px; height: 13px; }
.svm-formula { margin: 6px 2px 0; font-size: 10.5px; line-height: 1.6; color: #98a2b3; }
.svm-link { border: 0; background: none; padding: 0; margin-left: 4px; font-size: 11px; color: #6366f1; cursor: pointer; }
.svm-link:hover { text-decoration: underline; }
.svm-card-meta { margin-top: 8px; padding-top: 10px; border-top: 1px solid rgba(234, 236, 240, .9); display: flex; gap: 10px; }
.svm-card-meta label { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #98a2b3; }
.svm-card-meta select { height: 30px; border-radius: 9px; border: 1px solid #e4e7ec; background: rgba(255, 255, 255, .9); padding: 0 8px; font-size: 12px; color: #344054; }

.svm-card-open .svm-top, .svm-card-open .svm-filter { opacity: .55; transition: opacity .3s; }
.svm-card-open .svm-top:hover, .svm-card-open .svm-filter:hover { opacity: 1; }

@keyframes svm-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes svm-float-bubble { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -4px); } }
@keyframes svm-halo { 0%, 100% { opacity: .65; transform: translate(-50%, -50%) scale(.92); } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1.06); } }
@keyframes svm-ripple { 0% { opacity: .9; transform: translate(-50%, -50%) scale(.4); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.6); } }
@keyframes svm-ring { 0% { opacity: .9; transform: scale(.5); } 100% { opacity: 0; transform: scale(1.8); } }
@keyframes svm-flag { 0%, 100% { transform: skewY(0) scaleX(1); } 50% { transform: skewY(-6deg) scaleX(.9); } }
@keyframes svm-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .svm-building, .svm-bubble, .svm-stem, .svm-halo, .svm-cluster-ring, .svm-flag { animation: none !important; }
}

@media (max-width: 1280px) {
  .svm-top { width: 230px; }
  .svm-filter { width: 196px; }
}
@media (max-width: 1080px) {
  .svm-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .svm-filter, .svm-top { top: 160px; }
}
@media (max-width: 860px) {
  .svm-top { display: none; }
}
</style>
