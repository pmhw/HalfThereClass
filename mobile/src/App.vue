<template>
  <router-view v-slot="{ Component }">
    <keep-alive :include="['Certify']">
      <component :is="Component" />
    </keep-alive>
  </router-view>
  <ToastHost />
</template>

<script setup>
import ToastHost from './components/ToastHost.vue';
</script>
