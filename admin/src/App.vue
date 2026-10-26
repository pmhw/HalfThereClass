<template>
  <router-view />
  <NotifyHost />
  <FinancePinDialog />
</template>

<script setup>
import NotifyHost from './components/NotifyHost.vue';
import FinancePinDialog from './components/FinancePinDialog.vue';
</script>
