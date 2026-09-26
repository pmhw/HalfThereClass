<template>
  <span class="load-spinner" :class="[size]" :aria-label="label" role="status">
    <i />
    <em v-if="text">{{ text }}</em>
  </span>
</template>

<script setup>
defineProps({
  size: { type: String, default: 'md' }, // sm | md | lg
  text: { type: String, default: '' },
  label: { type: String, default: '加载中' },
});
</script>
