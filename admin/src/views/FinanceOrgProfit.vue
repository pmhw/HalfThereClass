<template>
  <section>
    <div class="page-head">
      <div>
        <p>校方价格 − 课时费 = 平台利润；课时费 − 机构利润 = 教师所得。机构设为「不看金额」时课时费整笔结算给机构。</p>
      </div>
      <div class="actions">
        <select v-model="organizationId" @change="load">
          <option value="">全部机构</option>
          <option v-for="item in orgs" :key="item.id" :value="String(item.id)">
            {{ item.name }}{{ item.settleToOrg ? '（结算给机构）' : '' }}{{ item.status === 1 ? '' : '（已停用）' }}
          </option>
        </select>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="10" kpis :kpi-count="4" @retry="load">
      <div class="kpi-grid">
        <article class="card kpi">
          <div class="label">校方价格合计<CalcTip name="orgProfit.school" /></div>
          <div class="value">{{ money(total.schoolAmount) }}</div>
          <div class="meta"><span class="flat">课次 {{ total.sessionCount || 0 }} 节</span></div>
        </article>
        <article class="card kpi">
          <div class="label">课时费合计<CalcTip name="orgProfit.sessionFee" /></div>
          <div class="value">{{ money(total.sessionFeeAmount) }}</div>
          <div class="meta"><span class="flat">教师所得 {{ money(total.teacherAmount) }}</span></div>
        </article>
        <article class="card kpi">
          <div class="label">机构利润<CalcTip name="orgProfit.institution" /></div>
          <div class="value">{{ money(total.institutionAmount) }}</div>
          <div class="meta"><span class="flat">结算给机构 {{ money(total.orgSettleAmount) }}</span></div>
        </article>
        <article class="card kpi">
          <div class="label">平台利润<CalcTip name="orgProfit.platform" /></div>
          <div class="value">{{ money(total.platformAmount) }}</div>
          <div class="meta"><span class="up">利润率 {{ pct(total.platformAmount, total.schoolAmount) }}%</span></div>
        </article>
      </div>

      <article class="card" style="margin-top: 16px">
        <table>
          <thead>
            <tr>
              <th>机构</th>
              <th>课程</th>
              <th>结算方式<CalcTip name="orgProfit.mode" /></th>
              <th>课次</th>
              <th>校方价格</th>
              <th>课时费</th>
              <th>机构利润<CalcTip name="orgProfit.institution" /></th>
              <th>教师所得<CalcTip name="orgProfit.sessionFee" /></th>
              <th>结算给机构<CalcTip name="orgProfit.settle" /></th>
              <th>平台利润<CalcTip name="orgProfit.platform" /></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.key">
              <td>{{ item.organizationName }}</td>
              <td>
                <strong>{{ item.courseTitle }}</strong>
                <div class="muted">{{ item.school }} · {{ item.teacherNames }}</div>
              </td>
              <td>
                <span :class="['tag', item.settleTo === 'org' ? 'amber' : 'blue']">
                  {{ item.settleTo === 'org' ? '结算给机构' : '结算给教师' }}
                </span>
              </td>
              <td>{{ item.sessionCount }}</td>
              <td>
                {{ money(item.schoolAmount) }}
                <div class="muted">单节 {{ money(item.unitSchoolPrice) }}</div>
              </td>
              <td>
                {{ money(item.sessionFeeAmount) }}
                <div class="muted">单节 {{ money(item.unitSessionFee) }}</div>
              </td>
              <td>{{ money(item.institutionAmount) }}</td>
              <td>{{ item.settleTo === 'org' ? '由机构发放' : money(item.teacherAmount) }}</td>
              <td>{{ money(item.orgSettleAmount) }}</td>
              <td>{{ money(item.platformAmount) }}</td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="10" class="empty">暂无机构课次收益（仅统计已固定的月份）</td>
            </tr>
          </tbody>
          <tfoot v-if="list.length">
            <tr class="total-row">
              <td colspan="3"><strong>合计</strong></td>
              <td>{{ total.sessionCount }}</td>
              <td>{{ money(total.schoolAmount) }}</td>
              <td>{{ money(total.sessionFeeAmount) }}</td>
              <td>{{ money(total.institutionAmount) }}</td>
              <td>{{ money(total.teacherAmount) }}</td>
              <td>{{ money(total.orgSettleAmount) }}</td>
              <td>{{ money(total.platformAmount) }}</td>
            </tr>
          </tfoot>
        </table>
      </article>
    </PageLoad>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import { money } from '../format';
import PageLoad from '../components/PageLoad.vue';
import CalcTip from '../components/CalcTip.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { useFinanceMonth } from '../composables/useFinanceMonth';

const route = useRoute();
const month = useFinanceMonth(() => load(), { allowAll: true });
const organizationId = ref(route.query.organizationId ? String(route.query.organizationId) : '');

const list = ref([]);
const total = ref({});
const orgs = ref([]);
const { loading, ready, error, run, bindLoad } = usePageLoad();

function pct(part, whole) {
  if (!Number(whole)) return 0;
  return Math.round((Number(part || 0) / Number(whole)) * 10000) / 100;
}

async function load() {
  await run(async () => {
    const data = await api.financeOrgProfit({
      month: month.value || undefined,
      organizationId: organizationId.value || undefined,
    });
    list.value = data.list || [];
    total.value = data.total || {};
    orgs.value = data.orgs || [];
  });
}

bindLoad(load);
</script>

<style scoped>
.total-row td { background: #f8fafc; font-weight: 600; }
</style>
