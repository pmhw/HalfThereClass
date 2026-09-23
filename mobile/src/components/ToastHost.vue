<template>
  <div v-if="text" class="toast-wrap">{{ text }}</div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { installToast } from '../api/request';

const text = ref('');
let timer = null;

function show(message) {
  text.value = message || '';
  clearTimeout(timer);
  timer = setTimeout(() => {
    text.value = '';
  }, 2200);
}

onMounted(() => installToast(show));
onUnmounted(() => {
  clearTimeout(timer);
  installToast(null);
});
</script>
