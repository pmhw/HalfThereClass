<template>
  <div class="shell">
    <router-view />
    <TabBar :selected="tab" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import TabBar from '../components/TabBar.vue';

const route = useRoute();
const tab = computed(() => Number(route.meta.tab ?? 0));
</script>
