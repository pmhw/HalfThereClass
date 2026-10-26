<template>
  <section>
    <div class="home-bar">
      <div class="home-tabs" role="tablist">
        <button type="button" role="tab" :class="{ on: tab === 'map' }" @click="switchTab('map')">
          <Icon name="pin" />经营地图
        </button>
        <button type="button" role="tab" :class="{ on: tab === 'overview' }" @click="switchTab('overview')">
          <Icon name="overview" />数据概览
        </button>
      </div>
      <div class="home-hello">{{ greeting() }}，管理员 · {{ todayText() }}</div>
    </div>

    <KeepAlive>
      <SchoolValueMap v-if="tab === 'map'" />
    </KeepAlive>

    <template v-if="tab === 'overview'">
    <div class="page-head">
      <div>
        <h1>{{ greeting() }}，管理员</h1>
        <p>这是当前课程平台的运营概览</p>
      </div>
      <div>
        <div class="muted" style="text-align: right">{{ todayText() }}</div>
        <div class="actions" style="margin-top: 10px">
          <router-link v-if="can('course.list')" class="btn" to="/courses">课程</router-link>
          <router-link v-if="can('trade.order')" class="btn" to="/orders">订单</router-link>
          <router-link v-if="can('admin.account')" class="btn primary" to="/admins">管理员</router-link>
        </div>
      </div>
    </div>

    <PageLoad
      :loading="loading"
      :ready="ready"
      :error="error"
      :columns="4"
      kpis
      :kpi-count="4"
      @retry="load"
    >
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

      <article v-if="financeLocked" class="card card-pad finance-locked" style="margin-top: 16px">
        <div>
          <h2>收益概览</h2>
          <p class="muted">财务数据已加密保护，输入财务密码后查看。</p>
        </div>
        <button class="btn primary" type="button" @click="unlockFinance"><Icon name="lock" />输入财务密码</button>
      </article>
      <article v-else-if="finance" class="card card-pad" style="margin-top: 16px">
        <div class="card-title">
          <h2>收益概览 · {{ finance.month }}</h2>
          <router-link class="link" to="/finance">财务管理</router-link>
        </div>
        <div class="kpi-grid">
          <article class="card kpi">
            <div class="label">总收入</div>
            <div class="value">{{ money(finance.current?.totalAmount) }}</div>
            <div class="meta"><span class="flat">{{ finance.current?.orderCount || 0 }} 笔订单</span></div>
          </article>
          <article class="card kpi">
            <div class="label">教师所得</div>
            <div class="value">{{ money(finance.current?.teacherAmount) }}</div>
            <div class="meta"><span class="flat">{{ finance.current?.teacherSharePct || 0 }}%</span></div>
          </article>
          <article class="card kpi">
            <div class="label">机构所得</div>
            <div class="value">{{ money(finance.current?.institutionAmount) }}</div>
            <div class="meta"><span class="flat">{{ finance.current?.institutionSharePct || 0 }}%</span></div>
          </article>
          <article class="card kpi">
            <div class="label">平台利润</div>
            <div class="value">{{ money(finance.current?.platformAmount) }}</div>
            <div class="meta"><span class="up">利润率 {{ finance.current?.profitRate || 0 }}%</span></div>
          </article>
        </div>
      </article>

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
    </PageLoad>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, getProfile } from '../api';
import SchoolValueMap from '../components/SchoolValueMap.vue';
import { dateTime, greeting, money, orderStatusText, todayText } from '../format';
import PageLoad from '../components/PageLoad.vue';
import Icon from '../components/Icon.vue';
import { requireFinancePin } from '../financePin';
import { usePageLoad } from '../composables/usePageLoad';
import { allow } from '../access';

const data = ref({
  trend: { users: [], courses: [], orders: [], labels: [] },
  recentOrders: [],
  coursePreview: [],
  pendingOrderCount: 0,
  userCount: 0,
  courseCount: 0,
  orderCount: 0,
  totalRevenue: 0,
  changes: {},
});
const finance = ref(null);
const financeLocked = ref(false);
const can = (...perms) => allow(getProfile(), ...perms);
const { loading, ready, error, run, bindLoad } = usePageLoad();

const kpis = computed(() => [
  kpi('用户数量', data.value.userCount, data.value.changes.users, data.value.trend.users),
  kpi('在架课程', data.value.courseCount, data.value.changes.courses, data.value.trend.courses),
  kpi('已支付订单', data.value.orderCount, data.value.changes.orders, data.value.trend.orders),
  kpi('累计收入', money(data.value.totalRevenue), data.value.changes.revenue, data.value.trend.revenue, false),
]);

function kpi(label, value, change, series) {
  let changeText = '较前 7 日持平';
  if (change === null || change === undefined) changeText = '前 7 日无数据';
  else if (change > 0) changeText = `↑ ${change}%`;
  else if (change < 0) changeText = `↓ ${Math.abs(change)}%`;
  return { label, value, change, changeText, series: series || [0] };
}

function spark(series) {
  const list = series?.length ? series : [0];
  const max = Math.max(...list, 1);
  return list.map((value, index) => {
    const x = list.length === 1 ? 36 : (index / (list.length - 1)) * 72;
    const y = 24 - (value / max) * 20;
    return `${x},${y}`;
  }).join(' ');
}

function line(series) {
  const list = series?.length ? series : [0];
  const max = Math.max(...data.value.trend.users, ...data.value.trend.courses, ...data.value.trend.orders, 1);
  return list.map((value, index) => {
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

async function load() {
  await run(async () => {
    data.value = await api.dashboard();
    const profile = getProfile();
    if (allow(profile, 'finance.overview')) await loadFinance();
  });
}

async function loadFinance() {
  try {
    finance.value = await api.financeOverview(undefined, { noFinancePrompt: true });
    financeLocked.value = false;
  } catch (err) {
    finance.value = null;
    financeLocked.value = !!err.financeLocked;
  }
}

async function unlockFinance() {
  if (await requireFinancePin()) await loadFinance();
}

const route = useRoute();
const router = useRouter();
const tab = computed(() => (route.query.tab === 'overview' ? 'overview' : 'map'));

function switchTab(next) {
  if (next === tab.value) return;
  router.replace({ query: { ...route.query, tab: next === 'map' ? undefined : next } });
}

watch(tab, (next) => {
  if (next === 'overview' && !ready.value && !loading.value) load();
});

bindLoad(() => {
  if (tab.value === 'overview') load();
});
</script>

<style scoped>
.home-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.home-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: rgba(255, 255, 255, .92);
  border: 1px solid rgba(226, 232, 240, .9);
  box-shadow: 0 8px 24px -16px rgba(79, 70, 229, .35), inset 0 1px 0 #fff;
  backdrop-filter: blur(8px);
}

.home-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #667085;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background .2s, color .2s, box-shadow .2s;
}

.home-tabs button svg {
  width: 16px;
  height: 16px;
}

.home-tabs button:hover {
  color: #344054;
}

.home-tabs button.on {
  color: #fff;
  font-weight: 600;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  box-shadow: 0 6px 16px -8px rgba(99, 102, 241, .9);
}

.home-hello {
  font-size: 13px;
  color: var(--muted);
}

.finance-locked {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.finance-locked h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.finance-locked p {
  margin: 0;
}
</style>
