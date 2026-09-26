<template>
  <div class="page-load" :class="{ refreshing: loading && ready }">
    <div v-if="loading && !ready" class="page-load-pending">
      <slot name="skeleton">
        <TableSkeleton
          :columns="columns"
          :rows="rows"
          :kpis="kpis"
          :kpi-count="kpiCount"
          :filters="filters"
        />
      </slot>
    </div>
    <div v-else-if="error && !ready" class="page-load-error card card-pad">
      <div class="page-load-error-inner">
        <span class="page-load-spin" aria-hidden="true" />
        <strong>加载失败</strong>
        <p>{{ error }}</p>
        <button class="btn primary" type="button" @click="$emit('retry')">重新加载</button>
      </div>
    </div>
    <div v-else class="page-load-body">
      <div v-if="loading && ready" class="page-load-bar" aria-hidden="true"><i /></div>
      <p v-if="error && ready" class="error page-load-inline-error">{{ error }}</p>
      <slot />
    </div>
  </div>
</template>

<script setup>
import TableSkeleton from './TableSkeleton.vue';

defineProps({
  loading: { type: Boolean, default: false },
  ready: { type: Boolean, default: false },
  error: { type: String, default: '' },
  columns: { type: Number, default: 6 },
  rows: { type: Number, default: 8 },
  kpis: { type: Boolean, default: false },
  kpiCount: { type: Number, default: 5 },
  filters: { type: Boolean, default: false },
});

defineEmits(['retry']);
</script>
