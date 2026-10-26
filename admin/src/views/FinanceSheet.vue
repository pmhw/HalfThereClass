<template>
  <section>
    <div class="page-head">
      <div>
        <h1>分成打款单</h1>
        <p>每月按「分成比例」规则和月度结算单生成：结算单未固定时是试算结果，固定后即最终打款金额。此页只读，可打印或导出给各位股东核对。</p>
      </div>
    </div>
    <article class="card sheet-card">
      <SplitSheet :month="month" />
    </article>
  </section>
</template>

<script setup>
import SplitSheet from '../components/SplitSheet.vue';
import { useFinanceMonth } from '../composables/useFinanceMonth';

const month = useFinanceMonth();
</script>

<style scoped>
.sheet-card { padding: 18px; }
</style>
