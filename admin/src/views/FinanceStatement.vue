<template>
  <section class="stmt-page">
    <div class="page-head">
      <div>
        <h1>月度结算单</h1>
        <p>按月汇总已同步课次。确认后点「固定」，各收益报表才统计该月。机构标签与机构费按当前课程承接机构 / 教师绑定机构刷新（已固定月份仍用结算快照）。</p>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="11" kpis :kpi-count="3" @retry="load">
      <section class="lock-bar" :class="data.locked ? 'is-locked' : rows.length ? 'is-pending' : 'is-empty'">
        <span class="lock-icon"><Icon :name="data.locked ? 'check' : 'lock'" /></span>
        <div class="lock-text">
          <strong>
            {{ month }} 结算单
            <em>{{ data.locked ? '已固定' : rows.length ? '待确认固定' : '暂无课次' }}</em>
          </strong>
          <p v-if="data.locked">
            {{ lockedAtText ? `${lockedAtText} 固定，` : '' }}已计入教师收益 / 月度收益 / 收入记录 / 机构利润明细，金额不再变动。需要调整时先解除固定。
          </p>
          <p v-else-if="rows.length">
            共 {{ data.total?.sessionCount || 0 }} 节 · 校方 {{ money(data.total?.schoolAmount) }} · 利润 {{ money(data.total?.profitAmount) }}。
            核对下表无误后点右侧按钮固定，固定后才计入各收益报表。
          </p>
          <p v-else>该月还没有已上课次，课次收益会按上课日期自动同步进来。</p>
        </div>
        <button
          v-if="!data.locked"
          class="lock-btn"
          type="button"
          :disabled="lockSaving || !rows.length"
          @click="lock"
        >
          <Icon name="lock" />
          {{ lockSaving ? '固定中…' : `确认并固定 ${month}` }}
        </button>
        <button v-else class="unlock-btn" type="button" :disabled="lockSaving" @click="unlock">
          <Icon name="unlock" />
          {{ lockSaving ? '处理中…' : '解除固定' }}
        </button>
      </section>

      <div class="kpi-grid">
        <article class="card kpi">
          <div class="label">校方合计<CalcTip name="statement.school" /></div>
          <div class="value">{{ money(data.total?.schoolAmount) }}</div>
          <div class="meta"><span class="flat">{{ data.total?.sessionCount || 0 }} 节</span></div>
        </article>
        <article class="card kpi">
          <div class="label">成本合计（教师费 + 机构费）<CalcTip name="statement.cost" /></div>
          <div class="value">{{ money(data.total?.costAmount) }}</div>
          <div class="meta"><span class="flat">教师费 {{ money(data.total?.teacherAmount) }} · 机构费 {{ money(data.total?.institutionAmount) }}</span></div>
        </article>
        <article class="card kpi">
          <div class="label">利润<CalcTip name="statement.profit" /></div>
          <div class="value">{{ money(data.total?.profitAmount) }}</div>
          <div class="meta">
            <span class="flat">状态：{{ data.locked ? '已固定' : '未固定' }}</span>
          </div>
        </article>
      </div>

      <article class="card stmt-card">
        <div class="stmt-scroll">
          <table class="stmt-table">
            <thead>
              <tr>
                <th>学校</th>
                <th>课程</th>
                <th class="num">上课数量</th>
                <th class="teacher-col">
                  <select v-model="teacherFilter" class="teacher-filter" aria-label="按教师筛选">
                    <option value="">全部教师</option>
                    <option v-for="teacher in teacherOptions" :key="teacher.value" :value="teacher.value">{{ teacher.label }}</option>
                  </select>
                  <span class="teacher-col-label">教师</span>
                </th>
                <th class="num">校方价格</th>
                <th class="num">课时费<CalcTip name="statement.sessionFee" /></th>
                <th class="num">机构费<CalcTip name="statement.orgFee" /></th>
                <th class="num">教师费<CalcTip name="statement.teacherFee" /></th>
                <th class="num">校方合计<CalcTip name="statement.school" /></th>
                <th class="num">成本合计<CalcTip name="statement.cost" /></th>
                <th class="num">利润<CalcTip name="statement.profit" /></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="school in schoolGroups" :key="school.key">
                <tr
                  v-for="(item, idx) in school.items"
                  :key="`${item.courseId}-${item.teacherName}-${idx}`"
                  class="data-row"
                >
                  <td class="cell-school">{{ idx === 0 ? item.school : '' }}</td>
                  <td class="cell-course">
                    <div class="course-title">{{ item.courseTitle }}</div>
                    <div v-if="item.organizationName" class="org-tag">{{ item.organizationName }}</div>
                    <div v-if="item.sessionDates?.length" class="session-dates">{{ item.sessionDates.map((d) => String(d).slice(5)).join('、') }}</div>
                  </td>
                  <td class="num">{{ item.sessionCount }}</td>
                  <td>{{ item.teacherName }}</td>
                  <td class="num">{{ money(item.schoolPrice) }}</td>
                  <td class="num">{{ money(item.sessionFee) }}</td>
                  <td class="num" :class="{ faint: !Number(item.institutionAmount) }">
                    {{ Number(item.institutionAmount) ? money(item.institutionAmount) : '—' }}
                  </td>
                  <td class="num">{{ money(item.teacherAmount) }}</td>
                  <td class="num">{{ money(item.schoolAmount) }}</td>
                  <td class="num">{{ money(item.costAmount) }}</td>
                  <td class="num profit">{{ money(item.profitAmount) }}</td>
                </tr>
                <tr v-if="school.sub" class="subtotal">
                  <td colspan="2"><strong>{{ school.sub.school }} 小计</strong></td>
                  <td class="num">{{ school.sub.sessionCount }}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td class="num">{{ Number(school.sub.institutionAmount) ? money(school.sub.institutionAmount) : '—' }}</td>
                  <td class="num">{{ money(school.sub.teacherAmount) }}</td>
                  <td class="num">{{ money(school.sub.schoolAmount) }}</td>
                  <td class="num">{{ money(school.sub.costAmount) }}</td>
                  <td class="num profit">{{ money(school.sub.profitAmount) }}</td>
                </tr>
              </template>
              <tr v-if="!visibleRows.length">
                <td colspan="11" class="empty">
                  {{ rows.length ? '该教师本月没有课次' : `${month} 暂无已同步课次。请先到「收益概览」同步，或切换其它月份查看。` }}
                </td>
              </tr>
            </tbody>
            <tfoot v-if="visibleRows.length">
              <tr class="total-row">
                <td colspan="2"><strong>底部合计</strong></td>
                <td class="num">{{ displayTotal.sessionCount }}</td>
                <td></td>
                <td></td>
                <td></td>
                <td class="num">{{ Number(displayTotal.institutionAmount) ? money(displayTotal.institutionAmount) : '—' }}</td>
                <td class="num">{{ money(displayTotal.teacherAmount) }}</td>
                <td class="num">{{ money(displayTotal.schoolAmount) }}</td>
                <td class="num">{{ money(displayTotal.costAmount) }}</td>
                <td class="num profit">{{ money(displayTotal.profitAmount) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </article>
    </PageLoad>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { money } from '../format';
import PageLoad from '../components/PageLoad.vue';
import CalcTip from '../components/CalcTip.vue';
import Icon from '../components/Icon.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { useFinanceLive } from '../composables/useFinanceLive';
import { refreshSetupStatus } from '../composables/useSetupStatus';
import { notify } from '../notify';
import { useFinanceMonth } from '../composables/useFinanceMonth';

const route = useRoute();
const router = useRouter();
const month = useFinanceMonth(() => load());

const data = ref({ list: [], total: {}, schoolTotals: [], locked: false });
const teacherFilter = ref('');
const lockSaving = ref(false);
const { loading, ready, error, run, bindLoad } = usePageLoad();
const live = useFinanceLive(() => load());

const rows = computed(() => (Array.isArray(data.value?.list) ? data.value.list : []));

function teacherKey(item) {
  if (item?.teacherId != null && item.teacherId !== '') return `id:${item.teacherId}`;
  return `name:${item?.teacherName || '—'}`;
}

const teacherOptions = computed(() => {
  const map = new Map();
  for (const item of rows.value) {
    const value = teacherKey(item);
    if (!map.has(value)) map.set(value, item.teacherName || '—');
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh'));
});

const visibleRows = computed(() => {
  if (!teacherFilter.value) return rows.value;
  return rows.value.filter((item) => teacherKey(item) === teacherFilter.value);
});

function sumRows(items, school = '') {
  const sub = {
    school,
    sessionCount: 0,
    institutionAmount: 0,
    teacherAmount: 0,
    schoolAmount: 0,
    costAmount: 0,
    profitAmount: 0,
  };
  for (const item of items) {
    sub.sessionCount += Number(item.sessionCount) || 0;
    sub.institutionAmount += Number(item.institutionAmount) || 0;
    sub.teacherAmount += Number(item.teacherAmount) || 0;
    sub.schoolAmount += Number(item.schoolAmount) || 0;
    sub.costAmount += Number(item.costAmount) || 0;
    sub.profitAmount += Number(item.profitAmount) || 0;
  }
  return sub;
}

const displayTotal = computed(() => {
  if (!teacherFilter.value) return data.value.total || {};
  return sumRows(visibleRows.value);
});
const lockedAtText = computed(() => {
  if (!data.value.lockedAt) return '';
  const d = new Date(data.value.lockedAt);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

const schoolGroups = computed(() => {
  const items = visibleRows.value;
  const groups = [];
  let index = 0;
  while (index < items.length) {
    const school = items[index].school || '—';
    const next = items.findIndex((item, i) => i > index && (item.school || '—') !== school);
    const end = next === -1 ? items.length : next;
    const groupItems = items.slice(index, end);
    const sub = teacherFilter.value
      ? sumRows(groupItems, school)
      : (data.value.schoolTotals || []).find((s) => s.school === school);
    groups.push({
      key: `${school}-${index}`,
      items: groupItems,
      sub,
    });
    index = end;
  }
  return groups;
});

watch(month, () => {
  teacherFilter.value = '';
});

watch(teacherOptions, (list) => {
  if (teacherFilter.value && !list.some((item) => item.value === teacherFilter.value)) {
    teacherFilter.value = '';
  }
});

async function load() {
  await run(async () => {
    const result = await api.financeStatement(month.value);
    data.value = {
      list: Array.isArray(result?.list) ? result.list : [],
      total: result?.total || {},
      schoolTotals: Array.isArray(result?.schoolTotals) ? result.schoolTotals : [],
      locked: !!result?.locked,
      lockedAt: result?.lockedAt || null,
      month: result?.month || month.value,
    };
  });
}


async function lock() {
  const missing = await refreshSetupStatus(true).then((s) => s?.top || []).catch(() => []);
  const warn = missing.length
    ? `注意：还有 ${missing.length} 项关键配置缺失（${missing.slice(0, 3).join('、')}${missing.length > 3 ? ' 等' : ''}），固定后金额可能不准确，建议先到「配置检查」处理。\n\n`
    : '';
  const ok = await notify.confirm({
    title: `固定 ${month.value} 结算单`,
    message: `${warn}固定后该月收益将计入 教师收益 / 月度收益 / 收入记录 / 机构利润明细，并锁定不可再改。确认固定？`,
    okText: '确认固定',
    icon: 'lock',
  });
  if (!ok) return;
  lockSaving.value = true;
  try {
    await api.financeLockMonth(month.value);
    notify.success(`${month.value} 已固定`);
    live.notify('statement-lock');
    await load();
  } catch (err) {
    notify.error(err.message || '固定失败');
  } finally {
    lockSaving.value = false;
  }
}

async function unlock() {
  const ok = await notify.confirm({
    title: `解除 ${month.value} 固定`,
    message: '解除后可调整课程费用并重新同步课次收益，之后需再次固定。解除？',
    okText: '解除固定',
    danger: true,
  });
  if (!ok) return;
  lockSaving.value = true;
  try {
    await api.financeUnlockMonth(month.value);
    notify.success('已解除固定');
    live.notify('statement-unlock');
    await load();
  } catch (err) {
    notify.error(err.message || '解除失败');
  } finally {
    lockSaving.value = false;
  }
}


bindLoad(load);
</script>

<style scoped>
.lock-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 16px 20px;
  border: 1px solid;
  border-radius: 14px;
}
.lock-bar.is-pending { background: linear-gradient(90deg, #fffbeb, #fff7ed); border-color: #fcd9a1; }
.lock-bar.is-locked { background: linear-gradient(90deg, #ecfdf3, #f0fdf4); border-color: #a6e9c3; }
.lock-bar.is-empty { background: #f8fafc; border-color: #e4e7ec; }
.lock-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  font-size: 22px;
}
.lock-icon :deep(svg) { width: 22px; height: 22px; stroke-width: 2; }
.is-pending .lock-icon { background: #fef0c7; color: #b54708; }
.is-locked .lock-icon { background: #d1fadf; color: #027a48; }
.is-empty .lock-icon { background: #eef2f6; color: #98a2b3; }
.lock-text { flex: 1; min-width: 0; }
.lock-text strong { display: flex; align-items: center; gap: 8px; color: #101828; font-size: 16px; }
.lock-text em {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
}
.is-pending .lock-text em { background: #f79009; color: #fff; }
.is-locked .lock-text em { background: #12b76a; color: #fff; }
.is-empty .lock-text em { background: #e4e7ec; color: #475467; }
.lock-text p { margin: 4px 0 0; color: #475467; font-size: 13px; line-height: 1.6; }
.lock-btn,
.unlock-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
.lock-btn {
  padding: 12px 22px;
  border: 0;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-size: 15px;
  box-shadow: 0 6px 16px -6px rgba(37, 99, 235, 0.6);
}
.lock-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 22px -8px rgba(37, 99, 235, 0.7); }
.lock-btn:disabled { background: #cbd5e1; box-shadow: none; cursor: not-allowed; }
.unlock-btn {
  padding: 9px 16px;
  border: 1px solid #fda29b;
  background: #fff;
  color: #b42318;
  font-size: 13px;
}
.unlock-btn:hover:not(:disabled) { background: #fef3f2; }
.unlock-btn:disabled { opacity: 0.6; cursor: not-allowed; }
@media (max-width: 760px) {
  .lock-bar { flex-wrap: wrap; }
  .lock-btn, .unlock-btn { width: 100%; justify-content: center; }
}

/* 覆盖全局 .card:has(table){overflow-x:auto}，否则 sticky 无法相对页面滚动生效 */
.stmt-page :deep(.stmt-card.card) {
  margin-top: 16px;
  padding: 0;
  overflow: visible;
}

.stmt-scroll {
  width: 100%;
  overflow: visible;
}

.stmt-table {
  width: 100%;
  min-width: 1100px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  background: #fff;
}

/* 页面向下滚动时，列头吸顶固定在顶栏+标签栏下方 */
.stmt-table thead th {
  position: sticky;
  top: var(--chrome-h, var(--header-h));
  z-index: 20;
  background: #f8fafc;
  color: #344054;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-align: left;
  white-space: nowrap;
  padding: 12px 14px;
  border-bottom: 1px solid #e4e7ec;
  box-shadow: 0 1px 0 #e4e7ec, 0 6px 12px -8px rgba(15, 23, 42, 0.18);
}

.stmt-table tbody td,
.stmt-table tfoot td {
  padding: 12px 14px;
  border-bottom: 1px solid #f2f4f7;
  color: #1f2937;
  vertical-align: middle;
  background: #fff;
}

.stmt-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.stmt-table thead th.num { text-align: right; }

.teacher-col { min-width: 132px; vertical-align: bottom; }
.teacher-filter {
  display: block;
  width: 100%;
  max-width: 148px;
  margin-bottom: 6px;
  padding: 4px 8px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  background: #fff;
  color: #101828;
  font-size: 12px;
  font-weight: 600;
}
.teacher-col-label { display: block; }

.cell-school { color: #667085; min-width: 96px; }
.cell-course { min-width: 168px; }
.course-title { font-weight: 600; color: #0f172a; line-height: 1.35; }
.session-dates { margin-top: 4px; color: #667085; font-size: 12px; line-height: 1.4; word-break: break-all; }
.org-tag {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 500;
}

.data-row:hover td { background: #f8fafc; }
.profit { color: #067647; font-weight: 700; }
.faint { color: #98a2b3; }

.subtotal td {
  background: #f9fafb !important;
  color: #344054;
  font-weight: 600;
  border-top: 1px dashed #e4e7ec;
}

.total-row td {
  background: #eaf2ff !important;
  color: #0f172a;
  font-weight: 700;
  border-top: 2px solid #84b0f5;
  border-bottom: 0;
  padding-top: 14px;
  padding-bottom: 14px;
}
.total-row .profit { color: #067647; font-weight: 800; }

.empty {
  text-align: center;
  color: #98a2b3;
  padding: 40px 16px !important;
  background: #fff !important;
}
</style>
