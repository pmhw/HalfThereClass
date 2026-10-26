<template>
  <div v-if="enabled" class="month-bar" :class="{ all: isAll }">
    <span class="month-label"><Icon name="cal" />结算月份</span>
    <button type="button" class="month-step" title="上个月" @click="step(-1)">‹</button>
    <button
      ref="trigger"
      type="button"
      class="month-current"
      :class="{ open }"
      title="选择月份"
      @click.stop="toggle"
    >
      <strong>{{ isAll ? '全部月份' : text(financeMonth) }}</strong>
      <small v-if="!isAll && financeMonth === thisMonth">本月</small>
      <Icon name="chevron" class="month-caret" />
    </button>
    <button type="button" class="month-step" title="下个月" :disabled="!isAll && financeMonth >= thisMonth" @click="step(1)">›</button>
    <button v-if="isAll || financeMonth !== thisMonth" type="button" class="month-today" @click="pick(thisMonth)">回到本月</button>
    <button v-if="allowAll" type="button" class="month-today" :class="{ on: isAll }" @click="toggleAll">全部</button>

    <Teleport to="body">
      <div v-if="open" ref="pop" class="month-pop" :style="popStyle" @click.stop>
        <div class="month-pop-head">
          <button type="button" class="month-pop-nav" title="上一年" @click="viewYear -= 1">‹</button>
          <strong>{{ viewYear }} 年</strong>
          <button type="button" class="month-pop-nav" title="下一年" :disabled="viewYear >= thisYear" @click="viewYear += 1">›</button>
        </div>
        <div class="month-grid">
          <button
            v-for="cell in cells"
            :key="cell.value"
            type="button"
            class="month-cell"
            :class="{ on: cell.value === selected, now: cell.value === thisMonth }"
            :disabled="cell.future"
            @click="choose(cell.value)"
          >
            {{ cell.label }}
          </button>
        </div>
        <div class="month-pop-foot">
          <button type="button" class="month-pop-link" @click="choose(thisMonth)">本月</button>
          <button type="button" class="month-pop-link" @click="choose(shiftMonth(thisMonth, -1))">上月</button>
          <button v-if="allowAll" type="button" class="month-pop-link" :class="{ on: isAll }" @click="chooseAll">全部月份</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { currentMonth, financeMonth, isMonth, monthAll, monthKey, monthMode, setFinanceMonth, shiftMonth } from '../composables/useFinanceMonth';

const route = useRoute();
const router = useRouter();
const thisMonth = currentMonth();
const thisYear = Number(thisMonth.slice(0, 4));

const mode = computed(() => monthMode(route));
const key = computed(() => monthKey(route));
const enabled = computed(() => !!mode.value);
const allowAll = computed(() => mode.value === 'all');
const isAll = computed(() => allowAll.value && !!monthAll[key.value]);
const selected = computed(() => (isAll.value ? '' : financeMonth.value));

const open = ref(false);
const trigger = ref(null);
const pop = ref(null);
const popStyle = ref({});
const viewYear = ref(thisYear);

const cells = computed(() => Array.from({ length: 12 }, (_, i) => {
  const value = `${viewYear.value}-${String(i + 1).padStart(2, '0')}`;
  return { value, label: `${i + 1}月`, future: value > thisMonth };
}));

function text(m) {
  const [y, mon] = String(m).split('-');
  return `${y}年${Number(mon)}月`;
}

function pick(value) {
  if (!value) {
    if (allowAll.value) monthAll[key.value] = true;
    return;
  }
  if (allowAll.value) monthAll[key.value] = false;
  setFinanceMonth(value);
}

function step(delta) {
  pick(isAll.value ? financeMonth.value : shiftMonth(financeMonth.value, delta));
}

function toggleAll() {
  monthAll[key.value] = !isAll.value;
}

function place() {
  const el = trigger.value;
  if (!el || !open.value) return;
  const rect = el.getBoundingClientRect();
  const width = 268;
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
  popStyle.value = { position: 'fixed', top: `${rect.bottom + 8}px`, left: `${left}px`, width: `${width}px`, zIndex: 1200 };
}

async function toggle() {
  if (open.value) {
    open.value = false;
    return;
  }
  viewYear.value = Number(financeMonth.value.slice(0, 4)) || thisYear;
  open.value = true;
  await nextTick();
  place();
}

function choose(value) {
  pick(value);
  open.value = false;
}

function chooseAll() {
  pick('');
  open.value = false;
}

function onDoc(event) {
  if (!open.value) return;
  if (trigger.value?.contains(event.target) || pop.value?.contains(event.target)) return;
  open.value = false;
}

function onKey(event) {
  if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('mousedown', onDoc);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDoc);
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', place);
  window.removeEventListener('scroll', place, true);
});

watch(() => route.path, () => { open.value = false; });

// 地址里带 ?month= 时以地址为准（从其他页面跳转过来、刷新、分享链接）
watch(
  () => [key.value, route.query.month],
  ([path, q]) => {
    if (!mode.value) return;
    const canAll = mode.value === 'all';
    if (canAll && monthAll[path] === undefined) monthAll[path] = route.meta.monthDefault === 'all';
    if (isMonth(q)) {
      if (canAll) monthAll[path] = false;
      if (q !== financeMonth.value) setFinanceMonth(q);
    } else if (canAll && q === '') {
      monthAll[path] = true;
    }
  },
  { immediate: true },
);

// 当前月份写回地址，刷新或复制链接时保持一致
watch(
  () => [key.value, financeMonth.value, monthAll[key.value]],
  () => {
    if (!mode.value) return;
    const want = isAll.value ? '' : financeMonth.value;
    if (route.query.month === want) return;
    router.replace({ query: { ...route.query, month: want } }).catch(() => {});
  },
  { immediate: true },
);
</script>

<style scoped>
.month-bar {
  display: flex; align-items: center; gap: 4px; flex: none;
  padding: 4px 6px 4px 12px; border: 1px solid #bfdbfe; border-radius: 12px;
  background: linear-gradient(180deg, #f5f9ff, #eaf2ff); box-shadow: 0 1px 2px rgba(37, 99, 235, 0.08);
}
.month-label { display: inline-flex; align-items: center; gap: 6px; margin-right: 4px; color: #1d4ed8; font-size: 12px; font-weight: 600; white-space: nowrap; }
.month-label :deep(svg) { width: 15px; height: 15px; }
.month-step {
  width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent;
  color: #1d4ed8; font-size: 20px; line-height: 1; cursor: pointer;
}
.month-step:hover:not(:disabled) { background: #fff; }
.month-step:disabled { color: #b6c7e6; cursor: not-allowed; }
.month-current {
  display: inline-flex; align-items: center; gap: 6px; min-width: 128px; height: 30px; justify-content: center;
  padding: 0 10px; border: 1px solid transparent; border-radius: 8px; background: #fff; cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
}
.month-current:hover, .month-current.open { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
.month-current strong { font-size: 15px; font-weight: 700; color: #0f172a; white-space: nowrap; }
.month-current small {
  padding: 1px 6px; border-radius: 999px; background: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 600;
}
.month-caret { width: 14px; height: 14px; color: #64748b; transition: transform .15s; }
.month-current.open .month-caret { transform: rotate(180deg); }
.month-bar.all .month-current strong { color: #475467; }
.month-today {
  height: 28px; margin-left: 2px; padding: 0 10px; border: 1px solid #bfdbfe; border-radius: 8px;
  background: #fff; color: #1d4ed8; font-size: 12px; white-space: nowrap; cursor: pointer;
}
.month-today.on { background: #2563eb; border-color: #2563eb; color: #fff; }
@media (max-width: 1100px) {
  .month-label { display: none; }
}
</style>

<style>
.month-pop {
  padding: 12px; border: 1px solid #e4ebf5; border-radius: 14px; background: #fff;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.16);
  animation: month-pop-in .14s ease-out;
}
@keyframes month-pop-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.month-pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.month-pop-head strong { font-size: 15px; color: #0f172a; }
.month-pop-nav {
  width: 30px; height: 30px; border: 0; border-radius: 8px; background: #f5f8fc;
  color: #1d4ed8; font-size: 18px; line-height: 1; cursor: pointer;
}
.month-pop-nav:hover:not(:disabled) { background: #eaf2ff; }
.month-pop-nav:disabled { color: #c7d2e3; cursor: not-allowed; }
.month-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.month-cell {
  position: relative; height: 36px; border: 1px solid transparent; border-radius: 10px;
  background: #f8fafc; color: #344054; font-size: 13px; cursor: pointer; transition: background .12s, color .12s;
}
.month-cell:hover:not(:disabled):not(.on) { background: #eaf2ff; color: #1d4ed8; }
.month-cell.now:not(.on) { border-color: #bfdbfe; color: #1d4ed8; font-weight: 600; }
.month-cell.now::after {
  content: ''; position: absolute; left: 50%; bottom: 4px; width: 4px; height: 4px; margin-left: -2px;
  border-radius: 50%; background: currentColor;
}
.month-cell.on { background: #2563eb; color: #fff; font-weight: 700; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.28); }
.month-cell:disabled { background: transparent; color: #cbd5e1; cursor: not-allowed; }
.month-pop-foot { display: flex; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #eef2f7; }
.month-pop-link {
  flex: 1; height: 28px; border: 1px solid #e4ebf5; border-radius: 8px; background: #fff;
  color: #1d4ed8; font-size: 12px; cursor: pointer;
}
.month-pop-link:hover { background: #f5f9ff; border-color: #bfdbfe; }
.month-pop-link.on { background: #2563eb; border-color: #2563eb; color: #fff; }
</style>
