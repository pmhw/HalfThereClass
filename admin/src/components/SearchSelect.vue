<template>
  <div class="search-select" :class="{ open, disabled, multiple }" ref="root">
    <button
      type="button"
      class="select-search-trigger"
      :class="{ empty: !display, open }"
      :disabled="disabled"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span class="trigger-text">{{ display || placeholder }}</span>
      <Icon name="chevron" />
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        class="select-search-menu search-select-menu"
        :class="{ multiple }"
        :style="menuStyle"
        @click.stop
      >
        <input
          ref="input"
          v-model="query"
          :placeholder="searchPlaceholder"
          autocomplete="off"
          @keydown.esc.prevent="close"
          @keydown.enter.prevent="pickFirst"
        />
        <div class="select-search-list">
          <button
            v-if="allowEmpty && !multiple"
            type="button"
            class="off"
            :class="{ on: isEmpty }"
            @mousedown.prevent="pick(emptyValue)"
          >{{ emptyLabel }}</button>
          <button
            v-if="multiple && selectedValues.length"
            type="button"
            class="off"
            @mousedown.prevent="clearAll"
          >清空已选（{{ selectedValues.length }}）</button>
          <button
            v-for="item in filtered"
            :key="String(item.value)"
            type="button"
            :class="{ on: isSelected(item.value) }"
            @mousedown.prevent="pick(item.value)"
          >
            <span v-if="multiple" class="check" :class="{ on: isSelected(item.value) }" />
            <span class="opt-body">
              <strong v-if="item.title">{{ item.title }}</strong>
              <span v-if="item.label && item.label !== item.title">{{ item.label }}</span>
              <small v-if="item.hint">{{ item.hint }}</small>
            </span>
          </button>
          <p v-if="!filtered.length" class="combo-empty">{{ emptyText }}</p>
        </div>
        <div v-if="multiple" class="multi-foot">
          <span>已选 {{ selectedValues.length }} 项</span>
          <button type="button" class="done" @mousedown.prevent="close">完成</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: [String, Number, Array, null], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  searchPlaceholder: { type: String, default: '搜索…' },
  emptyText: { type: String, default: '无匹配结果' },
  allowEmpty: { type: Boolean, default: false },
  emptyLabel: { type: String, default: '不选择' },
  emptyValue: { type: [String, Number], default: '' },
  disabled: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'change']);

const root = ref(null);
const input = ref(null);
const open = ref(false);
const query = ref('');
const menuStyle = ref({});

const normalized = computed(() => (props.options || []).map((item) => {
  if (item == null) return null;
  if (typeof item === 'string' || typeof item === 'number') {
    return { value: item, label: String(item), search: String(item) };
  }
  const value = item.value ?? item.id ?? '';
  const label = item.label ?? item.name ?? item.title ?? String(value);
  const title = item.title || '';
  const hint = item.hint || item.sub || '';
  const search = [label, title, hint, item.search, item.phone, item.teacherNo].filter(Boolean).join(' ');
  return { value, label, title, hint, search: search.toLowerCase() };
}).filter(Boolean));

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return normalized.value;
  return normalized.value.filter((item) => item.search.includes(q));
});

const selectedValues = computed(() => {
  if (!props.multiple) return [];
  const raw = Array.isArray(props.modelValue) ? props.modelValue : [];
  return raw.map((v) => String(v));
});

const current = computed(() => {
  if (props.multiple) return null;
  return normalized.value.find((item) => same(item.value, props.modelValue)) || null;
});

const display = computed(() => {
  if (props.multiple) {
    const n = selectedValues.value.length;
    if (!n) return '';
    const titles = normalized.value
      .filter((item) => selectedValues.value.includes(String(item.value)))
      .map((item) => item.title || item.label);
    if (n === 1) return titles[0] || '已选 1 门';
    if (n <= 2) return titles.join('、');
    return `已选 ${n} 门：${titles.slice(0, 2).join('、')}…`;
  }
  if (!current.value) return '';
  if (current.value.title) {
    const hint = current.value.hint || '';
    // 长说明只出现在下拉里，避免触发器被撑爆
    if (hint && hint.length <= 24) return `${current.value.title} · ${hint}`;
    return current.value.title;
  }
  return current.value.label;
});

const isEmpty = computed(() => {
  if (props.multiple) return !selectedValues.value.length;
  return same(props.modelValue, props.emptyValue) || props.modelValue === '' || props.modelValue == null;
});

function same(a, b) {
  if (a == null && (b == null || b === '')) return true;
  return String(a) === String(b);
}

function isSelected(value) {
  if (props.multiple) return selectedValues.value.includes(String(value));
  return same(value, props.modelValue);
}

function placeMenu() {
  const el = root.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const gap = 6;
  const maxH = props.multiple ? 360 : 300;
  const below = window.innerHeight - rect.bottom - gap;
  const openUp = below < 180 && rect.top > below;
  menuStyle.value = {
    position: 'fixed',
    left: `${Math.max(8, rect.left)}px`,
    width: `${Math.max(rect.width, props.multiple ? 320 : 220)}px`,
    top: openUp ? 'auto' : `${rect.bottom + gap}px`,
    bottom: openUp ? `${window.innerHeight - rect.top + gap}px` : 'auto',
    maxHeight: `${Math.min(maxH, openUp ? rect.top - 16 : below - 8)}px`,
    zIndex: 90,
  };
}

async function toggle() {
  if (props.disabled) return;
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  query.value = '';
  await nextTick();
  placeMenu();
  input.value?.focus();
}

function close() {
  open.value = false;
  query.value = '';
}

function pick(value) {
  if (props.multiple) {
    const set = new Set(selectedValues.value);
    const key = String(value);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    const next = [...set];
    emit('update:modelValue', next);
    emit('change', next);
    return;
  }
  emit('update:modelValue', value);
  emit('change', value);
  close();
}

function clearAll() {
  emit('update:modelValue', []);
  emit('change', []);
}

function pickFirst() {
  if (filtered.value[0]) pick(filtered.value[0].value);
  else if (!props.multiple && props.allowEmpty && !query.value.trim()) pick(props.emptyValue);
}

function onDoc(e) {
  if (!open.value) return;
  const t = e.target;
  if (root.value?.contains(t)) return;
  if (t?.closest?.('.search-select-menu')) return;
  close();
}

function onScroll() {
  if (open.value) placeMenu();
}

watch(() => props.modelValue, () => {
  /* keep display reactive */
});

onMounted(() => {
  document.addEventListener('mousedown', onDoc);
  window.addEventListener('resize', onScroll);
  window.addEventListener('scroll', onScroll, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDoc);
  window.removeEventListener('resize', onScroll);
  window.removeEventListener('scroll', onScroll, true);
});
</script>

<style scoped>
.search-select { width: 100%; min-width: 0; }
.search-select.disabled { opacity: 0.55; pointer-events: none; }
.select-search-trigger.empty .trigger-text { color: var(--faint); }
.trigger-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.select-search-list button {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
}
.select-search-list button .opt-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}
.select-search-list button strong {
  font-size: 13px;
  font-weight: 650;
  color: inherit;
}
.select-search-list button span { font-size: 13px; }
.select-search-list button small {
  font-size: 11px;
  color: #98a2b3;
  line-height: 1.4;
}
.select-search-list button.on small { color: #93c5fd; }
.check {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border: 1.5px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  box-sizing: border-box;
}
.check.on {
  border-color: #2563eb;
  background: #2563eb;
  box-shadow: inset 0 0 0 2px #fff;
}
.multi-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid #eef2f7;
  font-size: 12px;
  color: #64748b;
  background: #f8fafc;
}
.multi-foot .done {
  border: 0;
  background: #2563eb;
  color: #fff;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
</style>
