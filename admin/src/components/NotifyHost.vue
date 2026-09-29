<template>
  <Teleport to="body">
    <div class="notify-stack" aria-live="polite" aria-relevant="additions">
      <TransitionGroup name="notify-toast">
        <div
          v-for="item in notify.state.toasts"
          :key="item.id"
          class="notify-toast"
          :class="[item.type, { leaving: item.leaving }]"
          role="status"
          @click="notify.dismiss(item.id)"
        >
          <i class="notify-glow" aria-hidden="true"></i>
          <span class="notify-icon" aria-hidden="true">
            <Icon :name="iconOf(item.type)" />
          </span>
          <div class="notify-body">
            <strong v-if="item.title">{{ item.title }}</strong>
            <p>{{ item.message }}</p>
          </div>
          <button class="notify-x" type="button" aria-label="关闭" @click.stop="notify.dismiss(item.id)">×</button>
          <i class="notify-bar" aria-hidden="true"></i>
        </div>
      </TransitionGroup>
    </div>

    <Transition name="notify-dialog">
      <div
        v-if="dialog"
        class="notify-mask"
        role="presentation"
        @mousedown.self="cancelDialog"
      >
        <div class="notify-dialog" role="alertdialog" aria-modal="true" :aria-label="dialog.title">
          <i class="notify-dialog-shine" aria-hidden="true"></i>
          <div class="notify-dialog-icon" :class="{ danger: dialog.danger }">
            <Icon :name="dialog.icon || 'help'" />
          </div>
          <h3>{{ dialog.title }}</h3>
          <p v-if="dialog.message">{{ dialog.message }}</p>
          <label v-if="dialog.mode === 'prompt'" class="notify-prompt">
            <textarea
              ref="promptRef"
              v-model="promptValue"
              rows="3"
              :placeholder="dialog.placeholder || ''"
              @keydown.enter.exact.prevent="okDialog"
            />
          </label>
          <div class="notify-dialog-actions">
            <button class="btn" type="button" @click="cancelDialog">{{ dialog.cancelText }}</button>
            <button
              class="btn"
              :class="dialog.danger ? 'danger-fill' : 'primary'"
              type="button"
              :disabled="dialog.mode === 'prompt' && dialog.required && !String(promptValue || '').trim()"
              @click="okDialog"
            >{{ dialog.okText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { notify } from '../notify';

const dialog = computed(() => notify.state.dialog);
const promptValue = ref('');
const promptRef = ref(null);

function iconOf(type) {
  if (type === 'success') return 'check';
  if (type === 'error') return 'x';
  if (type === 'warn') return 'bell';
  return 'info';
}

function cancelDialog() {
  const d = notify.state.dialog;
  if (!d) return;
  if (d.mode === 'prompt') d.resolve(null);
  else d.resolve(false);
}

function okDialog() {
  const d = notify.state.dialog;
  if (!d) return;
  if (d.mode === 'prompt') {
    const text = String(promptValue.value || '');
    if (d.required && !text.trim()) return;
    d.resolve(true, text);
    return;
  }
  d.resolve(true);
}

function onKey(e) {
  if (e.key === 'Escape' && notify.state.dialog) cancelDialog();
}

watch(dialog, async (value) => {
  if (value) {
    window.addEventListener('keydown', onKey);
    if (value.mode === 'prompt') {
      promptValue.value = value.value || '';
      await nextTick();
      promptRef.value?.focus?.();
    }
  } else {
    window.removeEventListener('keydown', onKey);
    promptValue.value = '';
  }
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.notify-stack {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 120;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(360px, calc(100vw - 28px));
  pointer-events: none;
}
.notify-toast {
  position: relative;
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px 14px;
  border-radius: 12px;
  overflow: hidden;
  color: var(--text, #172033);
  background: #fff;
  border: 1px solid #e8edf5;
  box-shadow: 0 8px 24px rgba(30, 60, 100, 0.1);
  cursor: pointer;
  transform-origin: right top;
}
.notify-glow { display: none; }

.notify-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex: none;
  background: var(--primary-soft);
  color: var(--primary);
  animation: notify-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.notify-toast.success .notify-icon { background: var(--green-soft); color: var(--green); }
.notify-toast.error .notify-icon { background: var(--red-soft); color: var(--red); }
.notify-toast.warn .notify-icon { background: var(--amber-soft); color: var(--amber-text, #b45309); }
.notify-icon :deep(svg) { width: 16px; height: 16px; }

.notify-body { min-width: 0; flex: 1; padding-top: 2px; }
.notify-body strong { display: block; font-size: 13px; font-weight: 700; margin-bottom: 2px; }
.notify-body p { margin: 0; font-size: 13px; line-height: 1.5; color: #344054; word-break: break-word; }
.notify-x {
  border: 0;
  background: transparent;
  color: #98a2b3;
  font-size: 18px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
}
.notify-x:hover { color: #475467; }

.notify-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.85), rgba(14, 165, 233, 0.55));
  transform-origin: left center;
  animation: notify-bar 2.8s linear forwards;
}
.notify-toast.success .notify-bar { background: linear-gradient(90deg, #059669, #34d399); animation-duration: 2.8s; }
.notify-toast.error .notify-bar { background: linear-gradient(90deg, #dc2626, #f87171); animation-duration: 4.2s; }
.notify-toast.warn .notify-bar { background: linear-gradient(90deg, #b45309, #f59e0b); animation-duration: 3.4s; }

.notify-toast-enter-active {
  transition: opacity 0.28s ease, transform 0.38s cubic-bezier(0.34, 1.45, 0.64, 1);
}
.notify-toast-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
  position: absolute;
  width: 100%;
}
.notify-toast-enter-from { opacity: 0; transform: translateX(28px) scale(0.92); }
.notify-toast-leave-to { opacity: 0; transform: translateX(18px) scale(0.96); }
.notify-toast-move { transition: transform 0.28s ease; }

.notify-mask {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.4);
}
.notify-dialog {
  position: relative;
  width: min(480px, 100%);
  border-radius: 16px;
  background: #fff;
  padding: 24px 24px 20px;
  box-shadow: 0 8px 24px rgba(30, 60, 100, 0.12);
  border: 1px solid #e8edf5;
  overflow: hidden;
  text-align: center;
}
.notify-dialog-shine { display: none; }
.notify-dialog-icon {
  position: relative;
  width: 52px;
  height: 52px;
  margin: 0 auto 12px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: var(--primary-soft);
  color: var(--primary);
  animation: notify-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.notify-dialog-icon.danger { background: var(--red-soft); color: var(--red); }
.notify-dialog-icon :deep(svg) { width: 22px; height: 22px; }
.notify-dialog h3 { position: relative; margin: 0 0 8px; font-size: 17px; font-weight: 700; color: #0f172a; }
.notify-dialog p { position: relative; margin: 0 0 18px; color: #475467; font-size: 14px; line-height: 1.65; white-space: pre-wrap; }
.notify-prompt {
  display: block;
  text-align: left;
  margin: -6px 0 16px;
}
.notify-prompt textarea {
  width: 100%;
  resize: vertical;
  min-height: 84px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font: inherit;
  color: #0f172a;
  background: #f8fafc;
}
.notify-prompt textarea:focus {
  outline: none;
  border-color: var(--primary, #2563eb);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
.notify-dialog-actions { position: relative; display: flex; justify-content: center; gap: 10px; }

.notify-dialog-enter-active, .notify-dialog-leave-active { transition: opacity 0.2s ease; }
.notify-dialog-enter-active .notify-dialog,
.notify-dialog-leave-active .notify-dialog {
  transition: transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1), opacity 0.2s ease;
}
.notify-dialog-enter-from, .notify-dialog-leave-to { opacity: 0; }
.notify-dialog-enter-from .notify-dialog { opacity: 0; transform: translateY(14px) scale(0.94); }
.notify-dialog-leave-to .notify-dialog { opacity: 0; transform: translateY(8px) scale(0.98); }

@keyframes notify-pop {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes notify-pulse {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.15); opacity: 1; }
}
@keyframes notify-bar {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}
</style>
