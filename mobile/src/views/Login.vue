<template>
  <div class="page safe-bottom">
    <LoginPanel @success="onSuccess" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import LoginPanel from '../components/LoginPanel.vue';

const router = useRouter();

function onSuccess() {
  router.replace('/');
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: linear-gradient(180deg, #e7eefc 0%, #f7f8fa 40%);
}
</style>
