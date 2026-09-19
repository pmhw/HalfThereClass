<template>
  <div class="md-editor">
    <div class="md-bar">
      <button type="button" @click="heading(1)">标题</button>
      <button type="button" @click="heading(2)">小标题</button>
      <button type="button" @click="wrap('**', '**')">加粗</button>
      <button type="button" @click="wrap('*', '*')">斜体</button>
      <button type="button" @click="block('- ')">列表</button>
      <button type="button" @click="block('1. ')">编号</button>
      <button type="button" @click="block('> ')">引用</button>
      <button type="button" @click="wrap('`', '`')">代码</button>
      <button type="button" @click="link">链接</button>
    </div>
    <div class="md-split">
      <textarea ref="box" :value="modelValue" placeholder="用 Markdown 排版协议，例如 ## 标题、- 列表" @input="onInput"></textarea>
      <div class="md-preview" v-html="html"></div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import { renderMarkdown } from '../markdown';

const props = defineProps({
  modelValue: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);
const box = ref(null);
const html = computed(() => renderMarkdown(props.modelValue) || '<p class="muted">右侧预览排版</p>');

function onInput(event) {
  emit('update:modelValue', event.target.value);
}

function wrap(prefix, suffix) {
  const el = box.value;
  if (!el) return;
  const value = props.modelValue || '';
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const selected = value.slice(start, end) || '文本';
  const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
  emit('update:modelValue', next);
  nextTick(() => {
    el.focus();
    el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
  });
}

function block(token) {
  const el = box.value;
  if (!el) return;
  const value = props.modelValue || '';
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const selected = value.slice(start, end) || '文本';
  const body = selected.split('\n').map((line) => `${token}${line || '文本'}`).join('\n');
  const lead = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const next = `${value.slice(0, start)}${lead}${body}${value.slice(end)}`;
  emit('update:modelValue', next);
  nextTick(() => el.focus());
}

function heading(level) {
  block(`${'#'.repeat(level)} `);
}

function link() {
  wrap('[', '](https://)');
}
</script>
