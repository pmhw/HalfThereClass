<template>
  <div class="grade-picker" ref="root">
    <button
      type="button"
      class="grade-trigger"
      :class="{ empty: !display, open }"
      @click.stop="toggle"
    >
      <span>{{ display || placeholder }}</span>
      <Icon name="chevron" />
    </button>
    <Teleport to="body">
      <div v-if="open" class="grade-pop" :style="popStyle" @click.stop>
        <div class="grade-tabs">
          <button type="button" :class="{ on: mode === 'pick' }" @click="mode = 'pick'">勾选年级</button>
          <button type="button" :class="{ on: mode === 'range' }" @click="mode = 'range'">选择范围</button>
        </div>

        <template v-if="mode === 'pick'">
          <div class="grade-actions">
            <button type="button" class="linkish" @click="selectAll">全选常用</button>
            <button type="button" class="linkish" @click="clear">清空</button>
          </div>
          <div class="grade-groups">
            <div v-for="group in GRADE_GROUPS" :key="group.key" class="grade-group">
              <div class="grade-group-head">
                <label class="check-line">
                  <input type="checkbox" :checked="groupChecked(group)" :indeterminate.prop="groupHalf(group)" @change="toggleGroup(group, $event.target.checked)" />
                  <strong>{{ group.label }}</strong>
                </label>
              </div>
              <div class="grade-chips">
                <label v-for="item in group.items" :key="item" class="grade-chip" :class="{ on: draft.includes(item) }">
                  <input type="checkbox" :checked="draft.includes(item)" @change="toggleItem(item, $event.target.checked)" />
                  {{ item }}
                </label>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="grade-range">
            <label>起始年级
              <select v-model="rangeStart">
                <option v-for="item in GRADE_ORDER" :key="`s${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
            <span class="range-arrow">→</span>
            <label>结束年级
              <select v-model="rangeEnd">
                <option v-for="item in GRADE_ORDER" :key="`e${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
          <p class="muted grade-preview">将生成：{{ rangePreview.join('、') || '—' }}</p>
          <button type="button" class="btn" @click="applyRange">应用到勾选</button>
        </template>

        <div class="grade-foot">
          <button type="button" class="btn" @click="close">取消</button>
          <button type="button" class="btn primary" @click="confirm">确定</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import {
  GRADE_GROUPS,
  GRADE_ORDER,
  displayGrade,
  expandGradeRange,
  joinGrades,
  parseGrades,
} from '../grades';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '设置年级' },
});
const emit = defineEmits(['update:modelValue', 'change']);

const root = ref(null);
const open = ref(false);
const mode = ref('pick');
const draft = ref([]);
const rangeStart = ref('一年级');
const rangeEnd = ref('六年级');
const popStyle = ref({});

const display = computed(() => displayGrade(props.modelValue));
const rangePreview = computed(() => expandGradeRange(rangeStart.value, rangeEnd.value));

function syncDraft() {
  draft.value = parseGrades(props.modelValue);
}

function place() {
  const el = root.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const width = 320;
  let left = rect.left;
  if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
  const top = rect.bottom + 6;
  popStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: `${Math.min(top, window.innerHeight - 420)}px`,
    width: `${width}px`,
    zIndex: 1200,
  };
}

async function toggle() {
  if (open.value) {
    close();
    return;
  }
  syncDraft();
  open.value = true;
  await nextTick();
  place();
}

function close() {
  open.value = false;
}

function toggleItem(item, on) {
  if (on) {
    if (item === '全部年级') draft.value = ['全部年级'];
    else draft.value = [...draft.value.filter((x) => x !== '全部年级'), item];
  } else {
    draft.value = draft.value.filter((x) => x !== item);
  }
}

function groupItems(group) {
  return group.items.filter((x) => x !== '全部年级');
}

function groupChecked(group) {
  const items = groupItems(group);
  return items.length > 0 && items.every((x) => draft.value.includes(x));
}

function groupHalf(group) {
  const items = groupItems(group);
  const n = items.filter((x) => draft.value.includes(x)).length;
  return n > 0 && n < items.length;
}

function toggleGroup(group, on) {
  const items = groupItems(group);
  if (on) {
    draft.value = [...new Set([...draft.value.filter((x) => x !== '全部年级'), ...items])];
  } else {
    draft.value = draft.value.filter((x) => !items.includes(x));
  }
}

function selectAll() {
  draft.value = [...GRADE_ORDER];
}

function clear() {
  draft.value = [];
}

function applyRange() {
  draft.value = rangePreview.value;
  mode.value = 'pick';
}

function confirm() {
  const value = joinGrades(draft.value);
  emit('update:modelValue', value);
  emit('change', value);
  close();
}

function onDoc(event) {
  if (!open.value) return;
  const pop = document.querySelector('.grade-pop');
  if (root.value?.contains(event.target) || pop?.contains(event.target)) return;
  close();
}

watch(() => props.modelValue, syncDraft);
onMounted(() => {
  document.addEventListener('mousedown', onDoc);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDoc);
  window.removeEventListener('resize', place);
  window.removeEventListener('scroll', place, true);
});
</script>

<style scoped>
.grade-picker { display: inline-block; max-width: 100%; }
.grade-trigger {
  display: inline-flex; align-items: center; gap: 4px; max-width: 160px;
  padding: 4px 8px; border: 1px dashed transparent; border-radius: 8px;
  background: transparent; color: #344054; font-size: 13px; cursor: pointer; text-align: left;
}
.grade-trigger:hover, .grade-trigger.open { border-color: #c9d7f2; background: #f8fbff; }
.grade-trigger.empty { color: #98a2b3; }
.grade-trigger span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grade-trigger :deep(svg) { width: 14px; height: 14px; flex: none; color: #98a2b3; }
</style>

<style>
.grade-pop {
  background: #fff; border: 1px solid #e7edf5; border-radius: 14px;
  box-shadow: 0 16px 40px rgba(16, 24, 40, .14); padding: 12px;
}
.grade-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.grade-tabs button {
  flex: 1; height: 32px; border: 0; border-radius: 8px; background: #f2f4f7;
  color: #667085; font-size: 13px; font-weight: 600; cursor: pointer;
}
.grade-tabs button.on { background: #eef4ff; color: #2563eb; }
.grade-actions { display: flex; gap: 12px; margin-bottom: 8px; }
.grade-actions .linkish { border: 0; background: none; color: #2563eb; font-size: 12px; cursor: pointer; padding: 0; }
.grade-groups { max-height: 280px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.grade-group-head { margin-bottom: 6px; }
.grade-group-head strong { font-size: 13px; }
.grade-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.grade-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px;
  border: 1px solid #e7edf5; border-radius: 999px; font-size: 12px; cursor: pointer; background: #fff;
}
.grade-chip.on { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
.grade-chip input { display: none; }
.grade-range { display: flex; align-items: flex-end; gap: 8px; }
.grade-range label { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #667085; }
.grade-range select { height: 36px; border: 1px solid #e7edf5; border-radius: 8px; padding: 0 8px; }
.range-arrow { padding-bottom: 8px; color: #98a2b3; }
.grade-preview { margin: 10px 0; font-size: 12px; line-height: 1.5; }
.grade-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; padding-top: 10px; border-top: 1px solid #eef2f7; }
</style>
