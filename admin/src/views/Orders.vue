<template>
  <section>
    <div class="page-head"><div><h1>订单管理</h1><p>微信支付产生的课程订单</p></div></div>
    <div class="filters">
      <button v-for="item in options" :key="item.value" class="chip" :class="{ on: status === item.value }" @click="setStatus(item.value)">{{ item.label }}</button>
    </div>
    <div class="toolbar">
      <div class="field"><input v-model="keyword" placeholder="搜索订单号、用户或课程" @keyup.enter="reload" /></div>
      <button class="btn" @click="reload">搜索</button>
    </div>
    <article class="card">
      <table>
        <thead><tr><th>订单号</th><th>用户</th><th>课程</th><th>金额</th><th>状态</th><th>支付时间</th><th></th></tr></thead>
        <tbody>
          <tr v-for="item in result.list" :key="item.id">
            <td>{{ item.orderNo }}</td>
            <td>{{ item.user?.nickname || '—' }}</td>
            <td>{{ item.course?.title || '—' }}</td>
            <td>{{ money(item.payAmount ?? item.amount) }}</td>
            <td><span :class="['tag', statusClass(item.status)]">{{ orderStatusText[item.status] || item.status }}</span></td>
            <td>{{ dateTime(item.payTime) }}</td>
            <td><button class="link" @click="detail = item">查看</button></td>
          </tr>
          <tr v-if="!result.list.length"><td colspan="7" class="empty">暂无订单</td></tr>
        </tbody>
      </table>
      <Pager :page="result.pagination.page" :total-pages="result.pagination.totalPages" :total="result.pagination.total" @change="changePage" />
    </article>
    <div v-if="detail" class="modal-mask">
      <div class="modal narrow" role="dialog">
        <header>
          <h3>{{ detail.orderNo }}</h3>
          <button class="modal-close" type="button" @click="detail = null">×</button>
        </header>
        <div class="kv">
          <span>用户</span><div>{{ detail.user?.nickname || '—' }}</div>
          <span>课程</span><div>{{ detail.course?.title || '—' }}</div>
          <span>应付</span><div>{{ money(detail.amount) }}</div>
          <span>实付</span><div>{{ detail.payAmount == null ? '—' : money(detail.payAmount) }}</div>
          <span>方式</span><div>{{ detail.payType === 'wechat' ? '微信支付' : '—' }}</div>
          <span>交易号</span><div>{{ detail.transactionId || '—' }}</div>
          <span>下单时间</span><div>{{ dateTime(detail.createdAt) }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import { dateTime, money, orderStatusText } from '../format';
import Pager from '../components/Pager.vue';

const route = useRoute();
const keyword = ref('');
const status = ref(route.query.status || '');
const page = ref(1);
const detail = ref(null);
const result = ref({ list: [], pagination: { page: 1, totalPages: 1, total: 0 } });
const options = [
  { label: '全部', value: '' },
  { label: '待支付', value: 'pending' },
  { label: '已支付', value: 'paid' },
  { label: '已取消', value: 'cancelled' },
  { label: '已退款', value: 'refunded' },
];

async function load() {
  result.value = await api.orders({ page: page.value, pageSize: 8, keyword: keyword.value, status: status.value });
}
function reload() { page.value = 1; load(); }
function setStatus(value) { status.value = value; reload(); }
function changePage(next) { page.value = next; load(); }
function statusClass(value) {
  if (value === 'paid') return 'green';
  if (value === 'pending') return 'amber';
  if (value === 'refunded') return 'red';
  return '';
}
watch(() => route.query.status, (value) => {
  status.value = value || '';
  reload();
});
onMounted(load);
</script>
