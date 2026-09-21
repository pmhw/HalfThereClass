<template>
  <div class="md-editor">
    <div class="md-bar">
      <button v-for="item in tools" :key="item.name" type="button" :title="item.title" @click="item.run">
        <Icon :name="item.name" />
        <span>{{ item.title }}</span>
      </button>
    </div>
    <div class="md-split">
      <label class="md-pane">
        <span>编写</span>
        <textarea ref="box" :value="modelValue" placeholder="用 Markdown 排版，例如 ## 标题、- 列表" @input="onInput"></textarea>
      </label>
      <div class="md-pane">
        <span>预览</span>
        <div class="md-preview" v-html="html"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import { renderMarkdown } from '../markdown';
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);
const box = ref(null);
const html = computed(() => renderMarkdown(props.modelValue) || '<p class="muted">右侧会显示排版结果</p>');
const tools = [
  { name: 'type', title: '标题', run: () => heading(2) },
  { name: 'bold', title: '加粗', run: () => wrap('**', '**') },
  { name: 'italic', title: '斜体', run: () => wrap('*', '*') },
  { name: 'list', title: '列表', run: () => block('- ') },
  { name: 'quote', title: '引用', run: () => block('> ') },
  { name: 'code', title: '代码', run: () => wrap('`', '`') },
  { name: 'link', title: '链接', run: () => wrap('[', '](https://)') },
];

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
</script>

<style scoped>
.md-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
  overflow: hidden;
}
.md-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  background: #f8fafc;
}
.md-bar button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e7edf5;
  border-radius: 10px;
  background: #fff;
  color: #344054;
  font-size: 13px;
}
.md-bar button:hover { border-color: #bfd0f5; color: #1d4ed8; background: #eef4ff; }
.md-split {
  flex: 1;
  min-height: 420px;
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.md-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.md-pane + .md-pane { border-left: 1px solid var(--line); }
.md-pane > span {
  padding: 10px 16px 0;
  color: #98a2b3;
  font-size: 12px;
  font-weight: 650;
}
.md-pane textarea,
.md-preview {
  flex: 1;
  min-height: 380px;
  margin: 0;
  padding: 12px 16px 20px;
  border: 0;
  background: transparent;
  font-size: 14px;
  line-height: 1.7;
  color: #111827;
}
.md-pane textarea { resize: none; outline: none; font-family: inherit; }
.md-preview { overflow: auto; }
.md-preview :deep(h1),
.md-preview :deep(h2),
.md-preview :deep(h3) { margin: 0.6em 0 0.3em; line-height: 1.35; }
.md-preview :deep(p) { margin: 0.4em 0; }
.md-preview :deep(ul),
.md-preview :deep(ol) { margin: 0.4em 0; padding-left: 1.3em; }
.md-preview :deep(blockquote) {
  margin: 0.6em 0;
  padding: 8px 12px;
  border-left: 3px solid #bfdbfe;
  background: #f8fbff;
  color: #475467;
}
.md-preview :deep(code) {
  padding: 1px 5px;
  border-radius: 6px;
  background: #f2f4f7;
  font-size: 0.92em;
}
.md-preview :deep(a) { color: #2563eb; }
.md-preview :deep(.muted) { color: #98a2b3; }
@media (max-width: 860px) {
  .md-split { grid-template-columns: 1fr; }
  .md-pane + .md-pane { border-left: 0; border-top: 1px solid var(--line); }
}
</style>
