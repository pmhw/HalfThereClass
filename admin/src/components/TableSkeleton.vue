<template>
  <div class="skel" aria-hidden="true" aria-busy="true">
    <div v-if="kpis" class="skel-kpis">
      <div v-for="n in kpiCount" :key="`k${n}`" class="skel-kpi card">
        <i class="skel-block skel-icon" />
        <div class="skel-kpi-copy">
          <i class="skel-block skel-line w40" />
          <i class="skel-block skel-line w70" />
        </div>
      </div>
    </div>
    <div v-if="filters" class="skel-filters">
      <i v-for="n in 4" :key="`f${n}`" class="skel-block skel-filter" />
    </div>
    <article class="card skel-table-card">
      <div class="skel-table">
        <div class="skel-tr head">
          <i v-for="n in columns" :key="`h${n}`" class="skel-block skel-th" />
        </div>
        <div v-for="r in rows" :key="`r${r}`" class="skel-tr">
          <i v-for="n in columns" :key="`c${r}-${n}`" class="skel-block skel-td" :class="cellClass(n)" />
        </div>
      </div>
    </article>
  </div>
</template>

<script setup>
const props = defineProps({
  columns: { type: Number, default: 6 },
  rows: { type: Number, default: 8 },
  kpis: { type: Boolean, default: false },
  kpiCount: { type: Number, default: 5 },
  filters: { type: Boolean, default: false },
});

function cellClass(n) {
  if (n === 1) return 'w60';
  if (n === props.columns) return 'w30';
  return n % 2 ? 'w50' : 'w40';
}
</script>
