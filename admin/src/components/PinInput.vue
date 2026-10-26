<template>
  <div class="pin-input" :class="{ shake, focused }" @click="focus">
    <span
      v-for="index in length"
      :key="index"
      class="pin-cell"
      :class="{ filled: modelValue.length >= index, active: focused && modelValue.length === index - 1 }"
    >
      <i v-if="modelValue.length >= index"></i>
    </span>
    <input
      ref="input"
      :value="modelValue"
      type="tel"
      inputmode="numeric"
      autocomplete="off"
      :maxlength="length"
      :disabled="disabled"
      :aria-label="label"
      @input="onInput"
      @focus="focused = true"
      @blur="focused = false"
    />
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  length: { type: Number, default: 6 },
  autofocus: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  error: { type: [String, Number, Boolean], default: '' },
  label: { type: String, default: '6 位数字密码' },
});
const emit = defineEmits(['update:modelValue', 'complete']);

const input = ref(null);
const focused = ref(false);
const shake = ref(false);

function onInput(event) {
  const value = String(event.target.value || '').replace(/\D/g, '').slice(0, props.length);
  event.target.value = value;
  emit('update:modelValue', value);
  if (value.length === props.length) emit('complete', value);
}

function focus() {
  nextTick(() => input.value?.focus());
}

watch(() => props.error, (value) => {
  if (!value) return;
  shake.value = false;
  requestAnimationFrame(() => { shake.value = true; });
  setTimeout(() => { shake.value = false; }, 420);
});

onMounted(() => {
  if (props.autofocus) focus();
});

defineExpose({ focus });
</script>

<style scoped>
.pin-input {
  position: relative;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  width: 100%;
  max-width: 324px;
  margin: 0 auto;
  border: 1px solid var(--line, #dfe3ea);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  cursor: text;
}

.pin-input.focused {
  border-color: var(--primary, #2563eb);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.pin-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  border-left: 1px solid var(--line, #dfe3ea);
}

.pin-cell:first-child {
  border-left: 0;
}

.pin-cell.active::after {
  content: '';
  width: 2px;
  height: 22px;
  background: var(--primary, #2563eb);
  animation: pin-caret 1s steps(1) infinite;
}

.pin-cell i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #111827;
}

.pin-input input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  border: 0;
  color: transparent;
  caret-color: transparent;
  font-size: 16px;
}

.pin-input.shake {
  animation: pin-shake 0.4s ease;
  border-color: #ef4444;
}

@keyframes pin-caret {
  50% { opacity: 0; }
}

@keyframes pin-shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}
</style>
