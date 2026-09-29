<template>
  <section>
    <div class="page-head"><div><h1>订单管理</h1><p>微信支付产生的课程订单</p></div></div>
    <PageLoad
      :loading="loading"
      :ready="ready"
      :error="error"
      :columns="7"
      filters
      @retry="load"
    >
    <div class="filters">
      <button v-for="item in options" :key="item.value" class="chip" :class="{ on: status === item.value }" @click="setStatus(item.value)">{{ item.label }}</button>
    </div>
    <div class="toolbar">
      <div class="field"><input v-model="keyword" placeholder="搜索订单号、用户或课程" @keyup.enter="reload" /></div>
      <button class="btn" @click="reload">搜索</button>
    </div>
    <article class="card">
      <table>
        <thead><tr><th>订单号</th><th>用户</th><th>课程</th><th>金额</th><th>状态</th><th>支付时间</th><th class="col-actions">操作</th></tr></thead>
        <tbody>
          <tr v-for="item in result.list" :key="item.id">
            <td>{{ item.orderNo }}</td>
            <td>{{ item.user?.nickname || '—' }}</td>
            <td>{{ item.course?.title || '—' }}</td>
            <td>{{ money(item.payAmount ?? item.amount) }}</td>
            <td><span :class="['tag', statusClass(item.status)]">{{ orderStatusText[item.status] || item.status }}</span></td>
            <td>{{ dateTime(item.payTime) }}</td>
            <td class="col-actions">
              <div class="row-actions">
                <ActionBtn icon="eye" tip="查看" @click="detail = item" />
                <ActionBtn
                  v-if="item.status === 'pending' || item.status === 'cancelled'"
                  icon="play"
                  tip="标记已支付"
                  @click="markPaid(item)"
                />
                <ActionBtn
                  v-if="item.status === 'paid'"
                  icon="clock"
                  tip="退款"
                  @click="refund(item)"
                />
              </div>
            </td>
          </tr>
          <tr v-if="!result.list.length"><td colspan="7" class="empty">暂无订单</td></tr>
        </tbody>
      </table>
      <Pager :page="result.pagination.page" :total-pages="result.pagination.totalPages" :total="result.pagination.total" @change="changePage" />
    </article>
    </PageLoad>
    <PageModal
      :open="!!detail"
      size="narrow"
      :title="detail?.orderNo || '订单详情'"
      icon="receipt"
      @close="detail = null"
    >
      <div class="kv">
        <span>用户</span><div>{{ detail.user?.nickname || '—' }}</div>
        <span>课程</span><div>{{ detail.course?.title || '—' }}</div>
        <span>应付</span><div>{{ money(detail.amount) }}</div>
        <span>实付</span><div>{{ detail.payAmount == null ? '—' : money(detail.payAmount) }}</div>
        <span>方式</span><div>{{ detail.payType === 'wechat' ? '微信支付' : '—' }}</div>
        <span>交易号</span><div>{{ detail.transactionId || '—' }}</div>
        <span>下单时间</span><div>{{ dateTime(detail.createdAt) }}</div>
      </div>
    </PageModal>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import { dateTime, money, orderStatusText } from '../format';
import Pager from '../components/Pager.vue';
import ActionBtn from '../components/ActionBtn.vue';
import PageModal from '../components/PageModal.vue';
import PageLoad from '../components/PageLoad.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { notify } from '../notify';

const route = useRoute();
const keyword = ref('');
const status = ref(route.query.status || '');
const page = ref(1);
const detail = ref(null);
const { loading, ready, error, run } = usePageLoad();
const result = ref({ list: [], pagination: { page: 1, totalPages: 1, total: 0 } });
const options = [
  { label: '全部', value: '' },
  { label: '待支付', value: 'pending' },
  { label: '已支付', value: 'paid' },
  { label: '已取消', value: 'cancelled' },
  { label: '已退款', value: 'refunded' },
];

async function load() {
  await run(async () => {
    result.value = await api.orders({ page: page.value, pageSize: 8, keyword: keyword.value, status: status.value });
  });
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
async function markPaid(item) {
  const ok = await notify.confirm({
    title: '标记已支付',
    message: `确认将订单 ${item.orderNo} 标记为已支付？将按课程收益规则生成利润快照。`,
    okText: '确认标记',
    icon: 'check',
  });
  if (!ok) return;
  try {
    await api.financeMarkPaid(item.id);
    notify.success('已标记为已支付');
    await load();
  } catch (e) {
    notify.error(e.message || '操作失败');
  }
}
async function refund(item) {
  const ok = await notify.confirm({
    title: '全额退款',
    message: `确认对订单 ${item.orderNo} 全额退款？将同步冲减教师/机构/平台收益。`,
    okText: '确认退款',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.financeRefund(item.id);
    notify.success('退款成功');
    await load();
  } catch (e) {
    notify.error(e.message || '退款失败');
  }
}
watch(() => route.query.status, (value) => {
  status.value = value || '';
  reload();
});
onMounted(load);
</script>
