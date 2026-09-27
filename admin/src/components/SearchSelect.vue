<template>
  <div class="search-select" :class="{ open, disabled }" ref="root">
    <button
      type="button"
      class="select-search-trigger"
      :class="{ empty: !display, open }"
      :disabled="disabled"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span>{{ display || placeholder }}</span>
      <Icon name="chevron" />
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        class="select-search-menu search-select-menu"
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
            v-if="allowEmpty"
            type="button"
            class="off"
            :class="{ on: isEmpty }"
            @mousedown.prevent="pick(emptyValue)"
          >{{ emptyLabel }}</button>
          <button
            v-for="item in filtered"
            :key="String(item.value)"
            type="button"
            :class="{ on: same(item.value, modelValue) }"
            @mousedown.prevent="pick(item.value)"
          >
            <strong v-if="item.title">{{ item.title }}</strong>
            <span>{{ item.label }}</span>
            <small v-if="item.hint">{{ item.hint }}</small>
          </button>
          <p v-if="!filtered.length" class="combo-empty">{{ emptyText }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: [String, Number, null], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  searchPlaceholder: { type: String, default: '搜索…' },
  emptyText: { type: String, default: '无匹配结果' },
  allowEmpty: { type: Boolean, default: false },
  emptyLabel: { type: String, default: '不选择' },
  emptyValue: { type: [String, Number], default: '' },
  disabled: { type: Boolean, default: false },
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

const current = computed(() => normalized.value.find((item) => same(item.value, props.modelValue)) || null);
const display = computed(() => {
  if (!current.value) return '';
  return current.value.title
    ? `${current.value.title}${current.value.hint ? ` · ${current.value.hint}` : ''}`
    : current.value.label;
});
const isEmpty = computed(() => same(props.modelValue, props.emptyValue) || props.modelValue === '' || props.modelValue == null);

function same(a, b) {
  if (a == null && (b == null || b === '')) return true;
  return String(a) === String(b);
}

function placeMenu() {
  const el = root.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const gap = 6;
  const maxH = 300;
  const below = window.innerHeight - rect.bottom - gap;
  const openUp = below < 180 && rect.top > below;
  menuStyle.value = {
    position: 'fixed',
    left: `${Math.max(8, rect.left)}px`,
    width: `${Math.max(rect.width, 220)}px`,
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
  emit('update:modelValue', value);
  emit('change', value);
  close();
}

function pickFirst() {
  if (filtered.value[0]) pick(filtered.value[0].value);
  else if (props.allowEmpty && !query.value.trim()) pick(props.emptyValue);
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
.select-search-trigger.empty span { color: var(--faint); }
.select-search-list button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
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
}
.select-search-list button.on small { color: #93c5fd; }
</style>
