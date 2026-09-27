<template>
  <section>
    <div class="page-head">
      <div>
        <h1>收益概览</h1>
        <p>平台利润 = 校方价格 − 课时费 − 机构分佣。可勾选课程同步，无需先安排教师。</p>
      </div>
      <div class="actions">
        <select v-model="month" @change="load">
          <option v-for="item in monthOptions" :key="item" :value="item">{{ item }}</option>
        </select>
        <button class="btn" type="button" :disabled="syncing" @click="openSync">{{ syncing ? '同步中…' : '同步课次收益' }}</button>
        <button
          v-if="data.settlementStatus !== 'settled'"
          class="btn primary"
          type="button"
          :disabled="settling"
          @click="settle"
        >{{ settleLabel }}</button>
        <span v-else class="tag ok">已结算</span>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="4" kpis :kpi-count="4" @retry="load">
      <div class="kpi-grid">
        <article class="card kpi">
          <div class="label">本月总收入</div>
          <div class="value">{{ money(cur.totalAmount) }}</div>
          <div class="meta">
            <span :class="cur.revenueChange > 0 ? 'up' : cur.revenueChange < 0 ? 'down' : 'flat'">
              {{ cur.revenueChange > 0 ? '↑' : cur.revenueChange < 0 ? '↓' : '—' }}
              {{ Math.abs(cur.revenueChange || 0) }}%
            </span>
          </div>
        </article>
        <article class="card kpi">
          <div class="label">教师所得</div>
          <div class="value">{{ money(cur.teacherAmount) }}</div>
          <div class="meta"><span class="flat">占比 {{ cur.teacherSharePct || 0 }}%</span></div>
        </article>
        <article class="card kpi">
          <div class="label">机构所得</div>
          <div class="value">{{ money(cur.institutionAmount) }}</div>
          <div class="meta"><span class="flat">占比 {{ cur.institutionSharePct || 0 }}%</span></div>
        </article>
        <article class="card kpi">
          <div class="label">本月平台利润</div>
          <div class="value">{{ money(cur.platformAmount) }}</div>
          <div class="meta"><span class="up">利润率 {{ cur.profitRate || 0 }}%</span></div>
        </article>
      </div>

      <article class="card card-pad" style="margin-top: 16px">
        <div class="card-title">
          <h2>月度收入 / 利润趋势</h2>
          <router-link class="link" to="/finance/monthly">月度报表</router-link>
        </div>
        <svg class="chart" viewBox="0 0 640 220">
          <polyline :points="line(data.trend, 'totalAmount')" fill="none" stroke="#2563eb" stroke-width="2" />
          <polyline :points="line(data.trend, 'platformAmount')" fill="none" stroke="#16a34a" stroke-width="2" />
          <g fill="#98a2b3" font-size="11">
            <text v-for="(item, index) in data.trend" :key="item.month" :x="28 + index * Math.max(48, 560 / Math.max(data.trend.length, 1))" y="210">
              {{ item.month?.slice(5) || '' }}
            </text>
          </g>
        </svg>
        <div class="legend">
          <span><i style="background:#2563eb"></i>总收入</span>
          <span><i style="background:#16a34a"></i>平台利润</span>
        </div>
      </article>

      <div class="split" style="margin-top: 16px">
        <article class="card card-pad">
          <div class="card-title"><h2>课程利润排行</h2></div>
          <table>
            <thead><tr><th>课程</th><th>总收入</th><th>平台利润</th></tr></thead>
            <tbody>
              <tr v-for="item in data.courseRank" :key="item.courseId">
                <td>{{ item.title }}</td>
                <td>{{ money(item.totalAmount) }}</td>
                <td>{{ money(item.platformAmount) }}</td>
              </tr>
              <tr v-if="!data.courseRank?.length"><td colspan="3" class="empty">本月暂无收益，请点「同步课次收益」并勾选课程</td></tr>
            </tbody>
          </table>
        </article>
        <article class="card card-pad">
          <div class="card-title"><h2>快捷入口</h2></div>
          <div class="actions" style="flex-direction: column; align-items: stretch">
            <router-link class="btn" to="/finance/monthly">月度收益</router-link>
            <router-link class="btn" to="/finance/teachers">教师收益</router-link>
            <router-link class="btn" to="/finance/orgs">机构收益</router-link>
            <router-link class="btn" to="/finance/rules">收益规则</router-link>
          </div>
          <p class="muted" style="margin-top: 12px">结算状态：{{ statusText(data.settlementStatus) }} · 课次 {{ cur.orderCount || 0 }} 节</p>
        </article>
      </div>
    </PageLoad>

    <PageModal :open="syncOpen" size="wide" title="选择要同步的课程" icon="chart" @close="syncOpen = false">
      <p class="muted sync-tip">
        按已上 / 已到期课次计算：平台利润 = 校方价格 − 课时费 − 分佣。未安排教师时分佣按 0，仍可同步。
      </p>
      <div class="sync-toolbar">
        <label class="check">
          <input type="checkbox" :checked="allChecked" @change="toggleAll" />
          全选（{{ selectedIds.length }}/{{ syncCourses.length }}）
        </label>
        <span class="muted">可同步课次合计 {{ selectedSyncable }} 节</span>
      </div>
      <div v-if="syncLoading" class="empty">加载课程中…</div>
      <table v-else class="sync-table">
        <thead>
          <tr>
            <th style="width:40px"></th>
            <th>课程</th>
            <th>校方价格</th>
            <th>课时费</th>
            <th>教师</th>
            <th>可同步课次</th>
            <th>预估单节利润</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in syncCourses" :key="item.id">
            <td>
              <input type="checkbox" :value="item.id" v-model="selectedIds" />
            </td>
            <td>
              <strong>{{ item.title }}</strong>
              <div class="muted">{{ item.school }}</div>
            </td>
            <td>{{ money(item.price) }}</td>
            <td>{{ item.sessionFee == null ? '未配置' : money(item.sessionFee) }}</td>
            <td>{{ item.teacherName }}</td>
            <td>{{ item.syncableCount }} / {{ item.sessionTotal }}</td>
            <td>{{ money(item.preview?.platformAmount) }}</td>
          </tr>
          <tr v-if="!syncCourses.length"><td colspan="7" class="empty">暂无上架课程</td></tr>
        </tbody>
      </table>
      <div class="actions" style="margin-top: 16px; justify-content: flex-end">
        <button class="btn" type="button" @click="syncOpen = false">取消</button>
        <button class="btn primary" type="button" :disabled="syncing || !selectedIds.length" @click="doSync">
          {{ syncing ? '同步中…' : `同步所选 ${selectedIds.length} 门课` }}
        </button>
      </div>
    </PageModal>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { money } from '../format';
import PageLoad from '../components/PageLoad.vue';
import PageModal from '../components/PageModal.vue';
import { usePageLoad } from '../composables/usePageLoad';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const month = ref(currentMonth());
const monthOptions = computed(() => {
  const list = [];
  const now = new Date();
  for (let i = 0; i < 18; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return list;
});

const data = ref({ current: {}, previous: {}, trend: [], courseRank: [], settlementStatus: 'open' });
const cur = computed(() => data.value.current || {});
const { loading, ready, error, run } = usePageLoad();
const syncing = ref(false);
const settling = ref(false);
const syncOpen = ref(false);
const syncLoading = ref(false);
const syncCourses = ref([]);
const selectedIds = ref([]);

const allChecked = computed(() => syncCourses.value.length > 0 && selectedIds.value.length === syncCourses.value.length);
const selectedSyncable = computed(() => {
  const set = new Set(selectedIds.value);
  return syncCourses.value.filter((item) => set.has(item.id)).reduce((sum, item) => sum + (item.syncableCount || 0), 0);
});

const settleLabel = computed(() => {
  if (data.value.settlementStatus === 'pending') return settling.value ? '结算中…' : '确认月度结算';
  return settling.value ? '结算中…' : '提前结算本月';
});

function statusText(s) {
  return ({ open: '进行中', pending: '待结算', settled: '已结算' })[s] || s || '—';
}

function line(rows, key) {
  const list = rows || [];
  if (!list.length) return '';
  const values = list.map((item) => Number(item[key] || 0));
  const max = Math.max(...values, 1);
  const step = list.length > 1 ? 560 / (list.length - 1) : 0;
  return values.map((v, i) => `${40 + i * step},${180 - (v / max) * 150}`).join(' ');
}

function toggleAll(event) {
  selectedIds.value = event.target.checked ? syncCourses.value.map((item) => item.id) : [];
}

async function load() {
  await run(async () => {
    data.value = await api.financeOverview({ month: month.value });
  });
}

async function openSync() {
  syncOpen.value = true;
  syncLoading.value = true;
  try {
    syncCourses.value = await api.financeSyncCourses();
    // 默认勾选有可同步课次的课程
    selectedIds.value = syncCourses.value.filter((item) => item.syncableCount > 0).map((item) => item.id);
    if (!selectedIds.value.length) selectedIds.value = syncCourses.value.map((item) => item.id);
  } catch (e) {
    alert(e.message || '加载课程失败');
    syncOpen.value = false;
  } finally {
    syncLoading.value = false;
  }
}

async function doSync() {
  if (!selectedIds.value.length) {
    alert('请先勾选课程');
    return;
  }
  syncing.value = true;
  try {
    const res = await api.financeSync({ courseIds: selectedIds.value });
    const lines = [
      `已同步 ${res.synced || 0} 节（${res.courseCount || 0} 门课）`,
      `新完课 ${res.completedDue || 0}`,
      `有教师 ${res.withTeacher || 0} · 无教师 ${res.withoutTeacher || 0}`,
    ];
    if (res.skippedNoFee) lines.push(`未配课时费跳过 ${res.skippedNoFee}`);
    if (res.skippedError) lines.push(`失败 ${res.skippedError}`);
    if (res.byMonth?.length) {
      lines.push('按月：' + res.byMonth.map((m) => `${m.month} ${m.count}节`).join('，'));
    }
    alert(lines.join('\n'));
    syncOpen.value = false;
    await load();
  } catch (e) {
    alert(e.message || '同步失败');
  } finally {
    syncing.value = false;
  }
}

async function settle() {
  if (!confirm(`确认将 ${month.value} 标记为已结算？结算后该月收益快照锁定。`)) return;
  settling.value = true;
  try {
    await api.financeSettle(month.value);
    alert('月度已结算');
    await load();
  } catch (e) {
    alert(e.message || '结算失败');
  } finally {
    settling.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.legend { display: flex; gap: 16px; margin-top: 8px; color: #667085; font-size: 12px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
.chart { width: 100%; height: 220px; }
.tag.ok { background: #dcfce7; color: #166534; padding: 6px 10px; border-radius: 8px; }
.sync-tip { margin: 0 0 12px; }
.sync-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 12px; }
.sync-toolbar .check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.sync-table { width: 100%; }
.sync-table th, .sync-table td { font-size: 13px; }
</style>
