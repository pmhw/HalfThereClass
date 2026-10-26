<template>
  <span v-if="hasBank" class="bank-tip">
    <button
      ref="btnRef"
      type="button"
      class="bank-tip-btn"
      :class="{ on: open }"
      aria-label="查看银行卡并复制"
      @click.stop="openPop"
    >
      <Icon name="copy" />
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="popRef"
        class="bank-tip-pop"
        :style="popStyle"
        role="dialog"
        aria-modal="false"
        @mousedown.stop
        @click.stop
      >
        <header class="bank-tip-head">
          <div class="titles">
            <strong>{{ title || '收款银行卡' }}</strong>
            <span class="hint">点击一行复制 · 点 × 关闭</span>
          </div>
          <button type="button" class="bank-tip-close" aria-label="关闭" @click="close">
            <Icon name="x" />
          </button>
        </header>
        <button
          v-for="item in fields"
          :key="item.label"
          type="button"
          class="bank-tip-row"
          :disabled="!item.value"
          :title="item.value ? `复制${item.label}` : `未填${item.label}`"
          @click="copy(item)"
        >
          <small>{{ item.label }}</small>
          <span>{{ item.value || '—' }}</span>
        </button>
      </div>
    </Teleport>
  </span>
  <span v-else class="bank-miss">未填</span>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import Icon from './Icon.vue';
import { notify } from '../notify';

const props = defineProps({
  title: { type: String, default: '' },
  bankName: { type: String, default: '' },
  bankAccountName: { type: String, default: '' },
  bankAccount: { type: String, default: '' },
});

let zSeed = 3200;
let openCount = 0;

const open = ref(false);
const btnRef = ref(null);
const popRef = ref(null);
const zIndex = ref(3200);
const pos = ref({ top: 0, left: 0, width: 300 });
let cascade = 0;

const hasBank = computed(() => !!(props.bankName || props.bankAccountName || props.bankAccount));
const fields = computed(() => [
  { label: '开户行', value: String(props.bankName || '').trim() },
  { label: '户名', value: String(props.bankAccountName || '').trim() },
  { label: '卡号', value: String(props.bankAccount || '').trim() },
]);
const popStyle = computed(() => ({
  top: `${pos.value.top}px`,
  left: `${pos.value.left}px`,
  width: `${pos.value.width}px`,
  zIndex: String(zIndex.value),
}));

function place() {
  const btn = btnRef.value;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(320, vw - 24);
  const height = popRef.value?.offsetHeight || 220;
  let left = Math.min(Math.max(12, rect.right + 8 + cascade), vw - width - 12);
  let top = Math.min(Math.max(12, rect.top + cascade), vh - height - 12);
  if (left + width > vw - 12) left = Math.max(12, rect.left - width - 8);
  pos.value = { top, left, width };
}

async function openPop() {
  if (open.value) {
    zIndex.value = ++zSeed;
    return;
  }
  cascade = (openCount % 6) * 18;
  openCount += 1;
  open.value = true;
  zIndex.value = ++zSeed;
  place();
  await nextTick();
  place();
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
}

function close() {
  if (!open.value) return;
  open.value = false;
  openCount = Math.max(0, openCount - 1);
  window.removeEventListener('scroll', place, true);
  window.removeEventListener('resize', place);
}

async function copy(item) {
  const text = String(item.value || '').trim();
  if (!text) {
    notify.error(`未填写${item.label}`);
    return;
  }
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const input = document.createElement('textarea');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    notify.success(`已复制${item.label}`);
  } catch {
    notify.error(`复制失败：${text}`);
  }
}

onBeforeUnmount(close);
</script>

<style scoped>
.bank-tip { display: inline-flex; vertical-align: middle; }
.bank-tip-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border: 1px solid #e4e7ec; border-radius: 8px;
  background: #fff; color: #667085; cursor: pointer; transition: color .15s, background .15s, border-color .15s;
}
.bank-tip-btn :deep(svg) { width: 15px; height: 15px; }
.bank-tip-btn:hover, .bank-tip-btn.on {
  color: var(--primary, #2563eb); background: #eff4ff; border-color: #b2ccff;
}
.bank-miss { color: #98a2b3; font-size: 12px; }
.bank-tip-pop {
  position: fixed;
  padding: 12px; border-radius: 12px; background: #fff; border: 1px solid #e4e7ec;
  box-shadow: 0 12px 32px rgba(16, 24, 40, .18); color: #344054; font-size: 13px;
}
.bank-tip-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
  margin-bottom: 10px;
}
.bank-tip-head .titles { min-width: 0; }
.bank-tip-head strong {
  display: block; color: #0f172a; font-size: 14px; line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px;
}
.bank-tip-head .hint { display: block; margin-top: 2px; color: #98a2b3; font-size: 11px; }
.bank-tip-close {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; margin: -4px -4px 0 0; padding: 0; border: 0; border-radius: 8px;
  background: transparent; color: #98a2b3; cursor: pointer;
}
.bank-tip-close:hover { color: #344054; background: #f2f4f7; }
.bank-tip-close :deep(svg) { width: 16px; height: 16px; }
.bank-tip-row {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  width: 100%; margin: 0 0 6px; padding: 8px 10px; border: 1px solid #e4e7ec; border-radius: 8px;
  background: #f8fafc; text-align: left; cursor: pointer; color: #0f172a;
}
.bank-tip-row:last-child { margin-bottom: 0; }
.bank-tip-row:hover:not(:disabled) { border-color: var(--primary, #2563eb); background: #eff4ff; }
.bank-tip-row:disabled { cursor: default; opacity: .7; }
.bank-tip-row small { color: #98a2b3; font-size: 11px; }
.bank-tip-row span { font-size: 13px; line-height: 1.4; word-break: break-all; user-select: text; }
</style>
