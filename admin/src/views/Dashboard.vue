<template>
  <section v-if="data">
    <div class="page-head">
      <div>
        <h1>{{ greeting() }}，管理员</h1>
        <p>这是当前课程平台的运营概览</p>
      </div>
      <div>
        <div class="muted" style="text-align: right">{{ todayText() }}</div>
        <div class="actions" style="margin-top: 10px">
          <router-link class="btn" to="/courses">课程</router-link>
          <router-link class="btn" to="/orders">订单</router-link>
          <router-link class="btn primary" to="/admins">管理员</router-link>
        </div>
      </div>
    </div>

    <div class="kpi-grid">
      <article v-for="item in kpis" :key="item.label" class="card kpi">
        <div class="label">{{ item.label }}</div>
        <div class="value">{{ item.value }}</div>
        <div class="meta">
          <span :class="item.change > 0 ? 'up' : item.change < 0 ? 'down' : 'flat'">
            {{ item.changeText }}
          </span>
          <svg width="72" height="28" viewBox="0 0 72 28">
            <polyline :points="spark(item.series)" fill="none" stroke="#2563eb" stroke-width="1.6" />
          </svg>
        </div>
      </article>
    </div>

    <article class="card card-pad" style="margin-top: 16px">
        <div class="card-title">
          <h2>近 7 日新增</h2>
          <div class="legend">
            <span><i style="background:#2563eb"></i>用户</span>
            <span><i style="background:#0891b2"></i>课程</span>
            <span><i style="background:#7c3aed"></i>已支付订单</span>
          </div>
        </div>
        <svg class="chart" viewBox="0 0 640 220">
          <polyline :points="line(data.trend.users)" fill="none" stroke="#2563eb" stroke-width="2" />
          <polyline :points="line(data.trend.courses)" fill="none" stroke="#0891b2" stroke-width="2" />
          <polyline :points="line(data.trend.orders)" fill="none" stroke="#7c3aed" stroke-width="2" />
          <g fill="#98a2b3" font-size="11">
            <text v-for="(label, index) in data.trend.labels" :key="label" :x="32 + index * 96" y="210">{{ label }}</text>
          </g>
        </svg>
      </article>

    <div class="split">
      <article class="card card-pad">
        <div class="card-title"><h2>最近订单</h2><router-link class="link" to="/orders">全部</router-link></div>
        <div v-if="!data.recentOrders.length" class="empty">还没有订单</div>
        <div v-else class="timeline">
          <div v-for="item in data.recentOrders" :key="item.id" class="time-item">
            <time>{{ dateTime(item.createdAt) }}</time>
            <div>
              <strong>{{ item.course.title }}</strong>
              <p>{{ item.user.nickname || '未命名用户' }} · {{ money(item.payAmount ?? item.amount) }}</p>
            </div>
            <span :class="['tag', statusClass(item.status)]">{{ orderStatusText[item.status] }}</span>
          </div>
        </div>
      </article>
      <article class="card task">
        <div>
          <div class="muted">待支付订单</div>
          <strong>{{ data.pendingOrderCount }}</strong>
          <p class="muted">学员已下单、尚未完成微信支付</p>
        </div>
        <router-link class="btn primary" to="/orders?status=pending">去处理</router-link>
      </article>
    </div>

    <article class="card" style="margin-top: 16px">
      <div class="card-title" style="padding: 18px 16px 0">
        <h2>课程</h2>
        <router-link class="link" to="/courses">查看全部</router-link>
      </div>
      <table>
        <thead>
          <tr><th>课程</th><th>分类</th><th>校方价格</th><th>学员</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in data.coursePreview" :key="item.id">
            <td>{{ item.title }}</td>
            <td>{{ item.category?.name || '—' }}</td>
            <td>{{ item.isFree ? '免费' : money(item.price) }}</td>
            <td>{{ item.studentCount }}</td>
            <td><span :class="['tag', item.status === 1 ? 'green' : '']">{{ item.status === 1 ? '上架' : '下架' }}</span></td>
          </tr>
        </tbody>
      </table>
    </article>
  </section>
  <div v-else class="empty">加载中…</div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { dateTime, greeting, money, orderStatusText, todayText } from '../format';

const data = ref(null);
const kpis = computed(() => {
  if (!data.value) return [];
  return [
    kpi('用户数量', data.value.userCount, data.value.changes.users, data.value.trend.users),
    kpi('在架课程', data.value.courseCount, data.value.changes.courses, data.value.trend.courses),
    kpi('已支付订单', data.value.orderCount, data.value.changes.orders, data.value.trend.orders),
    kpi('累计收入', money(data.value.totalRevenue), data.value.changes.revenue, data.value.trend.revenue, false),
  ];
});

function kpi(label, value, change, series) {
  let changeText = '较前 7 日持平';
  if (change === null) changeText = '前 7 日无数据';
  else if (change > 0) changeText = `↑ ${change}%`;
  else if (change < 0) changeText = `↓ ${Math.abs(change)}%`;
  return { label, value, change, changeText, series };
}

function spark(series) {
  const max = Math.max(...series, 1);
  return series.map((value, index) => {
    const x = series.length === 1 ? 36 : (index / (series.length - 1)) * 72;
    const y = 24 - (value / max) * 20;
    return `${x},${y}`;
  }).join(' ');
}

function line(series) {
  const max = Math.max(...data.value.trend.users, ...data.value.trend.courses, ...data.value.trend.orders, 1);
  return series.map((value, index) => {
    const x = 32 + index * 96;
    const y = 180 - (value / max) * 150;
    return `${x},${y}`;
  }).join(' ');
}

function statusClass(status) {
  if (status === 'paid') return 'green';
  if (status === 'pending') return 'amber';
  if (status === 'refunded') return 'red';
  return '';
}

onMounted(async () => {
  data.value = await api.dashboard();
});
</script>
