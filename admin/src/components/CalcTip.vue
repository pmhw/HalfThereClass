<template>
  <span class="calc-tip">
    <button
      ref="btnRef"
      type="button"
      class="calc-tip-btn"
      :class="{ on: open }"
      :title="`${tip.title}：查看计算逻辑`"
      :aria-label="`${tip.title} 计算逻辑`"
      @mousedown.stop
      @click.prevent.stop="toggle"
    >
      <Icon name="help" />
    </button>
    <Teleport to="body">
      <div v-if="open" ref="popRef" class="calc-tip-pop" :style="popStyle" role="dialog" @mousedown.stop @click.stop>
        <header>
          <strong>{{ tip.title }}</strong>
          <button type="button" class="calc-tip-close" aria-label="关闭" @click="close"><Icon name="x" /></button>
        </header>
        <div v-if="tip.formula?.length" class="calc-tip-formula">
          <div v-for="(line, idx) in tip.formula" :key="idx">{{ line }}</div>
        </div>
        <ol v-if="tip.steps?.length" class="calc-tip-steps">
          <li v-for="(line, idx) in tip.steps" :key="idx">{{ line }}</li>
        </ol>
        <ul v-if="tip.notes?.length" class="calc-tip-notes">
          <li v-for="(line, idx) in tip.notes" :key="idx">{{ line }}</li>
        </ul>
      </div>
    </Teleport>
  </span>
</template>

<script>
let closeOpened = null;
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import Icon from './Icon.vue';
import { calcTip } from '../calcTips';

const props = defineProps({
  name: { type: String, required: true },
  ctx: { type: Object, default: () => ({}) },
});

const open = ref(false);
const btnRef = ref(null);
const popRef = ref(null);
const pos = ref({ top: 0, left: 0, width: 360 });
const tip = computed(() => calcTip(props.name, props.ctx));
const popStyle = computed(() => ({ top: `${pos.value.top}px`, left: `${pos.value.left}px`, width: `${pos.value.width}px` }));

function place() {
  const btn = btnRef.value;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(380, vw - 24);
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), vw - width - 12);
  const height = popRef.value?.offsetHeight || 0;
  let top = rect.bottom + 8;
  if (top + height > vh - 12 && rect.top - height - 8 > 12) top = rect.top - height - 8;
  pos.value = { top, left, width };
}

function onDocDown() {
  close();
}
function onKey(e) {
  if (e.key === 'Escape') close();
}

async function show() {
  if (closeOpened) closeOpened();
  open.value = true;
  closeOpened = close;
  place();
  await nextTick();
  place();
  document.addEventListener('mousedown', onDocDown);
  document.addEventListener('keydown', onKey);
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
}

function close() {
  if (!open.value) return;
  open.value = false;
  if (closeOpened === close) closeOpened = null;
  document.removeEventListener('mousedown', onDocDown);
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('scroll', place, true);
  window.removeEventListener('resize', place);
}

function toggle() {
  if (open.value) close();
  else show();
}

onBeforeUnmount(close);
</script>

<style scoped>
.calc-tip { display: inline-flex; vertical-align: middle; margin-left: 4px; }
.calc-tip-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%;
  background: transparent; color: #98a2b3; cursor: pointer; transition: color .15s, background .15s;
}
.calc-tip-btn :deep(svg) { width: 15px; height: 15px; }
.calc-tip-btn:hover, .calc-tip-btn.on { color: var(--primary, #2563eb); background: #eff4ff; }

.calc-tip-pop {
  position: fixed; z-index: 3000; max-height: min(70vh, 520px); overflow: auto;
  padding: 14px 16px; border-radius: 12px; background: #fff; border: 1px solid #e4e7ec;
  box-shadow: 0 12px 32px rgba(16, 24, 40, .16); color: #344054; font-size: 13px; line-height: 1.6;
  text-align: left; font-weight: 400; white-space: normal; letter-spacing: 0; text-transform: none;
}
.calc-tip-pop header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.calc-tip-pop header strong { color: #0f172a; font-size: 14px; }
.calc-tip-close {
  display: inline-flex; padding: 2px; border: 0; background: transparent; color: #98a2b3; cursor: pointer; border-radius: 6px;
}
.calc-tip-close:hover { color: #344054; background: #f2f4f7; }
.calc-tip-close :deep(svg) { width: 16px; height: 16px; }
.calc-tip-formula {
  padding: 8px 10px; margin-bottom: 8px; border-radius: 8px; background: #eff8ff; color: #175cd3;
  font-weight: 600; font-variant-numeric: tabular-nums;
}
.calc-tip-steps { margin: 0 0 6px; padding-left: 18px; }
.calc-tip-steps li + li { margin-top: 4px; }
.calc-tip-notes { margin: 6px 0 0; padding: 8px 0 0 16px; border-top: 1px dashed #eaecf0; color: #667085; font-size: 12px; }
.calc-tip-notes li + li { margin-top: 3px; }
</style>
