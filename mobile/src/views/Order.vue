<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>我的订单</span>
    </header>
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="tab"
        :class="{ on: currentTab === tab.key }"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="!orderList.length" class="empty">暂无订单</div>
    <div v-else class="list">
      <article v-for="order in orderList" :key="order.id" class="card item" @click="goCourse(order.courseId)">
        <div class="row">
          <span class="title">{{ order.courseTitle || order.title || '课程订单' }}</span>
          <span class="status">{{ statusLabel(order.status) }}</span>
        </div>
        <div class="meta">订单号 {{ order.orderNo || order.id }}</div>
        <div v-if="order.amount != null" class="price">¥{{ order.amount }}</div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getOrders } from '../api';
import { requireLogin } from '../utils/helpers';

const router = useRouter();

const tabs = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待支付' },
  { key: 'paid', label: '已支付' },
];
const currentTab = ref('');
const orderList = ref([]);
const loading = ref(false);

onMounted(() => {
  if (requireLogin(router)) loadOrders();
});

function statusLabel(status) {
  const map = { pending: '待支付', paid: '已支付', cancelled: '已取消' };
  return map[status] || status || '—';
}

function switchTab(key) {
  currentTab.value = key;
  loadOrders();
}

async function loadOrders() {
  loading.value = true;
  try {
    const result = await getOrders({
      page: 1,
      pageSize: 20,
      status: currentTab.value || undefined,
    });
    orderList.value = result.list || [];
  } catch {
    orderList.value = [];
  } finally {
    loading.value = false;
  }
}

function goCourse(id) {
  if (!id) return;
  router.push(`/course/${id}`);
}
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); }
.nav { display: flex; align-items: center; gap: calc(16 * var(--r)); margin-bottom: calc(20 * var(--r)); font-weight: 650; }
.back { color: #2563eb; }
.tabs { display: flex; gap: calc(12 * var(--r)); margin-bottom: calc(24 * var(--r)); }
.tab {
  flex: 1;
  height: calc(64 * var(--r));
  border-radius: calc(32 * var(--r));
  background: #fff;
  color: #667085;
  font-size: calc(26 * var(--r));
}
.tab.on { background: #2563eb; color: #fff; }
.item { margin-bottom: calc(16 * var(--r)); cursor: pointer; }
.row { display: flex; justify-content: space-between; gap: calc(16 * var(--r)); }
.title { font-weight: 650; flex: 1; }
.status { color: #2563eb; font-size: calc(24 * var(--r)); flex-shrink: 0; }
.meta { margin-top: calc(8 * var(--r)); color: #98a2b3; font-size: calc(24 * var(--r)); }
.price { margin-top: calc(12 * var(--r)); color: #ee0a24; font-weight: 700; }
.empty { text-align: center; color: #98a2b3; padding: calc(60 * var(--r)); }
</style>
