<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>我的收入</span>
    </header>
    <div v-if="total" class="summary card">
      <div class="label">可展示课时费合计</div>
      <div class="amount">¥{{ total }}</div>
      <div class="sub">共 {{ count }} 条记录</div>
    </div>
    <div v-if="!list.length" class="empty">暂无收入记录</div>
    <article v-for="item in list" :key="item.id" class="card row">
      <div>
        <div class="title">{{ item.title || item.courseTitle || '授课' }}</div>
        <div class="meta">{{ item.date || item.teachDate || '' }}</div>
      </div>
      <div v-if="item.showFee" class="fee">+¥{{ item.teacherFee }}</div>
      <div v-else class="off">未开放</div>
    </article>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getTeacherIncomes } from '../api';

const router = useRouter();
const list = ref([]);
const total = ref('');
const count = ref(0);

onMounted(async () => {
  try {
    const rows = (await getTeacherIncomes()) || [];
    list.value = rows;
    count.value = rows.length;
    const shown = rows.filter((item) => item.showFee);
    const sum = shown.reduce((acc, item) => acc + Number(item.teacherFee || 0), 0);
    total.value = shown.length ? sum.toFixed(2) : '';
  } catch {
    list.value = [];
  }
});
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); }
.nav { display: flex; align-items: center; gap: calc(16 * var(--r)); margin-bottom: calc(24 * var(--r)); font-weight: 650; }
.back { color: #2563eb; }
.summary { text-align: center; margin-bottom: calc(24 * var(--r)); }
.label { color: #667085; font-size: calc(26 * var(--r)); }
.amount { font-size: calc(56 * var(--r)); font-weight: 750; color: #2563eb; margin: calc(8 * var(--r)) 0; }
.sub { color: #98a2b3; font-size: calc(24 * var(--r)); }
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(16 * var(--r));
}
.title { font-weight: 650; }
.meta { margin-top: calc(6 * var(--r)); color: #98a2b3; font-size: calc(24 * var(--r)); }
.fee { color: #16a34a; font-weight: 700; font-size: calc(32 * var(--r)); }
.off { color: #98a2b3; font-size: calc(24 * var(--r)); }
.empty { text-align: center; color: #98a2b3; padding: calc(60 * var(--r)); }
</style>
