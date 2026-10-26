<template>
  <section class="payout-page">
    <div class="page-head">
      <div>
        <h1>财务打款</h1>
        <p>汇总当月要打的款：教师课时费（每位教师所有课程合计一笔）、机构费（每个机构合计一笔）与分成收款人（同一用户或同名虚拟人员跨合集合并一笔，扣税费与转账手续费）；既授课又参与分成的用户，课时费与分成合并为一笔、手续费只扣一次；当月已通过的报销也并入同一人的这笔打款。打款后标记「已打款」，系统保存当时金额，所含报销单同时变为「已报销」。</p>
      </div>
      <div class="actions">
        <router-link class="btn" to="/finance/split">分成规则</router-link>
        <button class="btn" type="button" :disabled="loading" @click="load">刷新</button>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="8" kpis :kpi-count="4" @retry="load">
      <div class="kpi-grid">
        <article class="card kpi">
          <div class="label">应发合计（实发）<CalcTip name="payout.net" /></div>
          <div class="value">{{ money(data.totals.net) }}</div>
          <div class="meta"><span class="flat">课时费 {{ money(data.totals.teacherNet) }} · 机构 {{ money(data.totals.orgNet) }} · 分成 {{ money(data.totals.splitNet) }}<template v-if="data.totals.reimburseNet"> · 报销 {{ money(data.totals.reimburseNet) }}</template></span></div>
        </article>
        <article class="card kpi">
          <div class="label">未打款<CalcTip name="payout.status" /></div>
          <div class="value warn">{{ money(data.totals.unpaid) }}</div>
          <div class="meta"><span class="flat">{{ data.totals.unpaidCount }} 位</span></div>
        </article>
        <article class="card kpi">
          <div class="label">已打款<CalcTip name="payout.status" /></div>
          <div class="value ok">{{ money(data.totals.paid) }}</div>
          <div class="meta"><span class="flat">{{ data.totals.paidCount }} 位</span></div>
        </article>
        <article class="card kpi">
          <div class="label">税费 / 转账手续费<CalcTip name="payout.fee" /></div>
          <div class="value">{{ money(data.totals.tax) }}</div>
          <div class="meta"><span class="flat">手续费 {{ money(data.totals.fee) }}</span></div>
        </article>
      </div>

      <p class="live-line">
        <i class="live-dot" />金额随「月度结算单」与「分成比例」配置实时计算，变动后自动刷新<span v-if="updatedAt"> · 更新于 {{ updatedAt }}</span>
      </p>
      <p v-if="!data.locked && rows.length" class="tip warn-tip">
        {{ month }} 月度结算单尚未固定，金额可能还会变动，暂不能修改打款状态。请先确认并固定结算单后再打款。
        <router-link :to="{ path: '/finance/statement', query: { month } }">去固定结算单 →</router-link>
      </p>

      <article class="card payout-card">
        <div class="toolbar">
          <div class="filters">
            <div class="tabs">
              <button v-for="t in kindTabs" :key="t.key" type="button" :class="{ on: kind === t.key }" @click="kind = t.key">
                {{ t.label }}<em>{{ t.count }}</em>
              </button>
            </div>
            <div class="tabs">
              <button v-for="t in tabs" :key="t.key" type="button" :class="{ on: tab === t.key }" @click="tab = t.key">
                {{ t.label }}<em>{{ t.count }}</em>
              </button>
            </div>
          </div>
          <div class="batch" :title="data.locked ? '' : lockHint">
            <span v-if="selected.length" class="sel-info">已选 {{ selected.length }} 位 · 实发 {{ money(selectedNet) }}</span>
            <button class="btn primary tiny" type="button" :disabled="!selectedUnpaid.length || busy" @click="mark(selectedUnpaid, 'paid')">
              标记已打款{{ selectedUnpaid.length ? `（${selectedUnpaid.length}）` : '' }}
            </button>
            <button class="btn tiny" type="button" :disabled="!selectedPaid.length || busy" @click="mark(selectedPaid, 'unpaid')">
              改为未打款{{ selectedPaid.length ? `（${selectedPaid.length}）` : '' }}
            </button>
          </div>
        </div>

        <div class="table-scroll">
        <table class="payout-table">
          <thead>
            <tr>
              <th class="check"><input type="checkbox" :checked="allChecked" :disabled="!selectable.length" @change="toggleAll" /></th>
              <th class="payee-col">收款人</th>
              <th class="bank-col">卡</th>
              <th>来源<CalcTip name="payout.kinds" /></th>
              <th class="num">应分<CalcTip name="payout.gross" /></th>
              <th class="num">税费<CalcTip name="split.tax" :ctx="data.config" /></th>
              <th class="num">转账手续费<CalcTip name="payout.transferFee" :ctx="data.config" /></th>
              <th class="num">实发<CalcTip name="payout.netCol" /></th>
              <th>状态</th>
              <th class="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in visibleRows" :key="row.key">
              <tr :class="{ paid: row.status === 'paid' }">
                <td class="check">
                  <input type="checkbox" :checked="checked.has(row.key)" :disabled="!canSelect(row)" @change="toggle(row.key)" />
                </td>
                <td>
                  <div class="payee">
                    <span class="kind-tag" :class="row.kind">{{ kindLabel[row.kind] }}</span>
                    <strong>{{ row.name }}</strong>
                    <span v-if="row.kind === 'split'" class="who-tag" :class="{ user: row.userId }">{{ row.userId ? '用户' : '虚拟' }}</span>
                  </div>
                  <small v-if="row.kind === 'both'" class="merged">课时费 + {{ row.items.length }} 个合集分成合并为一笔</small>
                  <small v-else-if="row.kind === 'split' && row.items.length > 1" class="merged">{{ row.items.length }} 个合集合并为一笔</small>
                  <small v-if="row.reimburse && row.kind !== 'reimburse'" class="merged reimb">含报销 {{ money(row.reimburse.total) }}（{{ row.reimburse.items.length }} 笔），合并为一笔打款</small>
                  <small v-if="row.priorTeacherPaid != null" class="changed">课时费此前已单独打款 {{ money(row.priorTeacherPaid) }}，注意勿重复打款</small>
                </td>
                <td class="bank-cell">
                  <BankCopyTip
                    :title="row.name"
                    :bank-name="row.bankName"
                    :bank-account-name="row.bankAccountName"
                    :bank-account="row.bankAccount"
                  />
                </td>
                <td>
                  <button class="link source" type="button" @click="toggleOpen(row.key)">
                    {{ sourceText(row) }}
                    <span class="caret">{{ opened.has(row.key) ? '收起' : '明细' }}</span>
                  </button>
                </td>
                <td class="num">
                  {{ row.kind === 'reimburse' ? '—' : money(row.gross) }}
                  <small v-if="row.reimburse" class="fee-note reimb-note">+ 报销 {{ money(row.reimburse.total) }}</small>
                </td>
                <td class="num minus">{{ row.tax ? `−${money(row.tax)}` : '—' }}</td>
                <td v-if="(row.kind === 'both' && row.teacherPart) || row.reimburse" class="num">
                  <span :class="{ minus: payeeFee(row) }">{{ payeeFee(row) ? `−${money(payeeFee(row))}` : '—' }}</span>
                  <small class="fee-note">{{ row.kind === 'reimburse' ? '转账' : '合并一笔' }}共 {{ money(row.transferFee) }}<template v-if="row.platformFee">，平台承担 {{ money(row.platformFee) }}</template></small>
                </td>
                <td v-else-if="row.feeBy === 'platform'" class="num">
                  <span class="platform-fee">{{ money(row.fee) }}</span>
                  <small class="fee-note">平台承担</small>
                </td>
                <td v-else class="num minus">{{ row.fee ? `−${money(row.fee)}` : '—' }}</td>
                <td class="num net">{{ money(row.net) }}</td>
                <td>
                  <span v-if="row.status === 'paid'" class="status paid">已打款</span>
                  <span v-else class="status unpaid">未打款</span>
                  <small v-if="row.status === 'paid' && row.paidAt" class="paid-at">{{ dateTime(row.paidAt) }}</small>
                  <small v-if="row.changed" class="changed">
                    打款时 {{ money(row.paidNet) }}，现应发 {{ money(row.net) }}
                  </small>
                </td>
                <td class="ops" :title="data.locked ? '' : lockHint">
                  <span v-if="!data.locked" class="lock-note">待固定结算单</span>
                  <button
                    v-else-if="row.status !== 'paid'"
                    class="btn tiny primary"
                    type="button"
                    :disabled="busy || !data.locked || !(row.net > 0)"
                    @click="mark([row.key], 'paid')"
                  >已打款</button>
                  <template v-else>
                    <button v-if="row.changed && row.net > 0" class="btn tiny" type="button" :disabled="busy || !data.locked" @click="mark([row.key], 'paid')">按现金额更新</button>
                    <button class="btn tiny" type="button" :disabled="busy || !data.locked" @click="mark([row.key], 'unpaid')">撤销</button>
                  </template>
                </td>
              </tr>
              <tr v-if="opened.has(row.key)" class="detail-row">
                <td></td>
                <td colspan="9">
                  <div v-if="row.kind === 'both' && row.teacherPart" class="part-sum">
                    <span>课时费 {{ money(row.teacherPart.gross) }}<template v-if="row.teacherPart.fee"> − 手续费 {{ money(row.teacherPart.fee) }}</template> = {{ money(row.teacherPart.net) }}</span>
                    <span>分成 {{ money(row.splitPart.gross) }} − 税费 {{ money(row.splitPart.tax) }} − 手续费 {{ money(row.splitPart.fee) }} = {{ money(row.splitPart.net) }}</span>
                    <span>手续费按合计 {{ money(row.teacherPart.gross + row.splitPart.gross - row.splitPart.tax) }} 分档只收一次（{{ money(row.transferFee) }}）</span>
                  </div>
                  <div v-if="row.reimburse && row.kind !== 'reimburse'" class="part-sum">
                    <span>报销 {{ money(row.reimburse.total) }} 全额到账，不扣税费和手续费；合并一笔按 {{ money(row.gross - row.tax + row.reimburse.total) }} 分档收手续费（{{ money(row.transferFee) }}）</span>
                  </div>
                  <table v-if="row.kind !== 'split' && row.kind !== 'reimburse' && (row.kind === 'both' ? row.courses : row.items)?.length" class="detail-table">
                    <thead>
                      <tr>
                        <th>课程</th>
                        <th>学校</th>
                        <th v-if="row.kind === 'org'">授课教师</th>
                        <th class="num">课次</th>
                        <th>上课日期</th>
                        <th class="num">{{ row.kind === 'org' ? '机构费' : '课时费' }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(item, idx) in (row.kind === 'both' ? row.courses : row.items)" :key="`${item.courseId}-${idx}`">
                        <td>{{ item.courseTitle }}</td>
                        <td>{{ item.school || '—' }}</td>
                        <td v-if="row.kind === 'org'">{{ item.teacherName || '—' }}</td>
                        <td class="num">{{ item.sessionCount }}</td>
                        <td class="session-dates">{{ formatSessionDates(item.sessionDates) }}</td>
                        <td class="num">{{ money(item.amount) }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <table v-if="(row.kind === 'split' || row.kind === 'both') && row.items.length" class="detail-table" :class="{ stacked: row.kind === 'both' }">
                    <thead>
                      <tr>
                        <th>合集</th>
                        <th class="num">比例</th>
                        <th class="num">应分</th>
                        <th class="num">税费</th>
                        <th class="num">手续费（分摊）</th>
                        <th class="num">实发</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in row.items" :key="item.collectionId">
                        <td>{{ item.collectionName }}</td>
                        <td class="num">{{ plain(item.ratio) }}%</td>
                        <td class="num">{{ money(item.gross) }}</td>
                        <td class="num">{{ money(item.tax) }}</td>
                        <td class="num">{{ money(item.fee) }}</td>
                        <td class="num">{{ money(item.net) }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <table v-if="row.reimburse" class="detail-table stacked">
                    <thead>
                      <tr>
                        <th>报销事由</th>
                        <th>发生日期</th>
                        <th>扣除合集</th>
                        <th>状态</th>
                        <th class="num">金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in row.reimburse.items" :key="item.id">
                        <td>{{ item.title }}</td>
                        <td>{{ item.expenseDate || '—' }}</td>
                        <td>{{ item.collectionName || '未关联（平台承担）' }}</td>
                        <td>{{ item.status === 'reimbursed' ? '已报销' : '已通过' }}</td>
                        <td class="num">{{ money(item.amount) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
            <tr v-if="!visibleRows.length">
              <td colspan="10" class="empty-cell">
                {{ rows.length ? '当前筛选下没有收款人' : `${month} 暂无需要打款的教师课时费、机构费、分成或报销。` }}
              </td>
            </tr>
          </tbody>
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
import { dateTime, money } from '../format';
import PageLoad from '../components/PageLoad.vue';
import CalcTip from '../components/CalcTip.vue';
import BankCopyTip from '../components/BankCopyTip.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { useFinanceLive } from '../composables/useFinanceLive';
import { notify } from '../notify';
import { round2 } from '../split';
import { useFinanceMonth } from '../composables/useFinanceMonth';

function plain(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(round2(n));
}

const route = useRoute();
const router = useRouter();
const month = useFinanceMonth(onMonthChange);

const emptyTotals = { net: 0, tax: 0, fee: 0, teacherNet: 0, orgNet: 0, splitNet: 0, reimburseNet: 0, paid: 0, unpaid: 0, paidCount: 0, unpaidCount: 0 };
const data = ref({ list: [], totals: { ...emptyTotals }, locked: false });
const tab = ref('all');
const checked = ref(new Set());
const opened = ref(new Set());
const busy = ref(false);
const updatedAt = ref('');
const { loading, ready, error, run, bindLoad } = usePageLoad();
const live = useFinanceLive(() => load());

const kind = ref('all');
const kindLabel = { teacher: '课时费', org: '机构', split: '分成', both: '课时费+分成', reimburse: '报销' };
const rows = computed(() => data.value.list || []);
const kindFilters = {
  teacher: (r) => r.kind === 'teacher' || r.kind === 'both',
  org: (r) => r.kind === 'org',
  split: (r) => r.kind === 'split' || r.kind === 'both',
  reimburse: (r) => !!r.reimburse || r.kind === 'reimburse',
};
const kindTabs = computed(() => [
  { key: 'all', label: '全部类型', count: rows.value.length },
  { key: 'teacher', label: '教师课时费', count: rows.value.filter(kindFilters.teacher).length },
  { key: 'org', label: '机构', count: rows.value.filter(kindFilters.org).length },
  { key: 'split', label: '分成', count: rows.value.filter(kindFilters.split).length },
  { key: 'reimburse', label: '含报销', count: rows.value.filter(kindFilters.reimburse).length },
]);
const kindRows = computed(() => (kindFilters[kind.value] ? rows.value.filter(kindFilters[kind.value]) : rows.value));
const tabs = computed(() => [
  { key: 'all', label: '全部', count: kindRows.value.length },
  { key: 'unpaid', label: '未打款', count: kindRows.value.filter((r) => r.status !== 'paid').length },
  { key: 'paid', label: '已打款', count: kindRows.value.filter((r) => r.status === 'paid').length },
]);
const visibleRows = computed(() => {
  if (tab.value === 'paid') return kindRows.value.filter((r) => r.status === 'paid');
  if (tab.value === 'unpaid') return kindRows.value.filter((r) => r.status !== 'paid');
  return kindRows.value;
});

function sourceText(row) {
  const reimb = row.reimburse?.items || [];
  if (row.kind === 'reimburse') {
    const titles = reimb.map((i) => i.title);
    if (!titles.length) return '报销';
    return titles.length > 2 ? `报销：${titles.slice(0, 2).join('、')} 等 ${titles.length} 笔` : `报销：${titles.join('、')}`;
  }
  const extra = reimb.length ? ` + 报销 ${reimb.length} 笔` : '';
  if (row.kind === 'both') return `${(row.courses || []).length} 门课课时费 + ${row.items.length} 个合集${extra}`;
  const names = row.kind === 'teacher' || row.kind === 'org'
    ? row.items.map((i) => i.courseTitle)
    : row.items.map((i) => i.collectionName);
  if (!names.length) return extra ? extra.slice(3) : '—';
  return (names.length > 2 ? `${names.slice(0, 2).join('、')} 等 ${names.length} 项` : names.join('、')) + extra;
}

const lockHint = '月度结算单固定后才能修改打款状态';

function payeeFee(row) {
  return row.feeBy === 'payee' ? Number(row.fee || 0) : 0;
}
function formatSessionDates(dates) {
  const list = Array.isArray(dates) ? dates.filter(Boolean) : [];
  if (!list.length) return '—';
  return list.map((d) => String(d).slice(5)).join('、');
}

function canSelect(row) {
  if (!data.value.locked) return false;
  return row.status === 'paid' || row.net > 0;
}
const selectable = computed(() => visibleRows.value.filter(canSelect));
const selected = computed(() => rows.value.filter((r) => checked.value.has(r.key)));
const selectedUnpaid = computed(() => selected.value.filter((r) => r.status !== 'paid' && r.net > 0).map((r) => r.key));
const selectedPaid = computed(() => selected.value.filter((r) => r.status === 'paid').map((r) => r.key));
const selectedNet = computed(() => round2(selected.value.reduce((acc, r) => acc + Number(r.net || 0), 0)));
const allChecked = computed(() => selectable.value.length > 0 && selectable.value.every((r) => checked.value.has(r.key)));

function toggle(key) {
  const next = new Set(checked.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  checked.value = next;
}

function toggleAll() {
  const next = new Set(checked.value);
  if (allChecked.value) selectable.value.forEach((r) => next.delete(r.key));
  else selectable.value.forEach((r) => next.add(r.key));
  checked.value = next;
}

function toggleOpen(key) {
  const next = new Set(opened.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  opened.value = next;
}

async function load() {
  await run(async () => {
    const result = await api.financePayouts(month.value);
    data.value = {
      list: Array.isArray(result?.list) ? result.list : [],
      totals: { ...emptyTotals, ...(result?.totals || {}) },
      locked: !!result?.locked,
      config: result?.config || {},
    };
    const keys = new Set(data.value.locked ? data.value.list.map((r) => r.key) : []);
    checked.value = new Set([...checked.value].filter((k) => keys.has(k)));
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  });
}

function onMonthChange() {
  checked.value = new Set();
  opened.value = new Set();
  load();
}

async function mark(keys, status) {
  if (!keys.length) return;
  if (!data.value.locked) {
    notify.error(lockHint);
    return;
  }
  const list = rows.value.filter((r) => keys.includes(r.key));
  const total = round2(list.reduce((acc, r) => acc + Number(r.net || 0), 0));
  const names = list.slice(0, 3).map((r) => r.name).join('、') + (list.length > 3 ? ` 等 ${list.length} 位` : '');
  const reimbCount = list.reduce((acc, r) => acc + (r.reimburse?.items.length || 0), 0);
  const reimbTotal = round2(list.reduce((acc, r) => acc + Number(r.reimburse?.total || 0), 0));
  const ok = await notify.confirm(status === 'paid'
    ? {
      title: '确认已打款',
      message: `确认已向 ${names} 打款，合计实发 ${money(total)}？系统将保存当前金额。${reimbCount ? `其中含报销 ${money(reimbTotal)}（${reimbCount} 笔），这些报销单会同时标记为「已报销」。` : ''}`,
      okText: '已打款',
    }
    : {
      title: '改为未打款',
      message: `将 ${names} 的 ${month.value} 打款状态改为未打款？${reimbCount ? '随这笔打款报销的单据会退回「已通过」。' : ''}`,
      okText: '改为未打款',
      danger: true,
    });
  if (!ok) return;
  busy.value = true;
  try {
    const result = await api.financeMarkPayouts(month.value, { keys, status });
    notify.success(status === 'paid' ? `已标记 ${result.count} 位已打款` : `已改为未打款 ${result.count} 位`);
    checked.value = new Set();
    live.notify('payout');
    await load();
  } catch (err) {
    notify.error(err.message || '操作失败');
  } finally {
    busy.value = false;
  }
}

watch([kind, tab], () => {
  checked.value = new Set();
});


bindLoad(load);
</script>

<style scoped>
.live-line { margin: 12px 0 0; display: flex; align-items: center; gap: 6px; color: #667085; font-size: 12px; }
.live-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #12b76a; box-shadow: 0 0 0 3px rgba(18, 183, 106, .18);
}
.value.warn { color: #b54708; }
.value.ok { color: #067647; }
.warn-tip {
  margin: 16px 0 0; padding: 10px 14px; border-radius: 10px;
  background: #fffaeb; color: #b54708; font-size: 13px; border: 1px solid #fedf89;
}
.warn-tip a { margin-left: 6px; color: #b54708; font-weight: 600; white-space: nowrap; }
.payout-card { margin-top: 16px; padding: 0; overflow: hidden; }
.toolbar {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  margin: 0; padding: 12px 16px; border: 0; border-bottom: 1px solid #f2f4f7; border-radius: 0; box-shadow: none;
}
.filters { display: flex; gap: 10px; flex-wrap: wrap; margin: 0; }
.filters .tabs { margin: 0; }
.kind-tag, .who-tag {
  flex: none; display: inline-flex; align-items: center; height: 20px; padding: 0 6px;
  border-radius: 4px; font-size: 11px; line-height: 1; white-space: nowrap;
}
.kind-tag { font-weight: 600; }
.kind-tag.teacher { background: #eff8ff; color: #175cd3; }
.kind-tag.split { background: #ecfdf3; color: #067647; }
.kind-tag.both { background: #f4f3ff; color: #5925dc; }
.kind-tag.org { background: #fff6ed; color: #c4320a; }
.kind-tag.reimburse { background: #fdf2fa; color: #c11574; }
.merged.reimb { color: #c11574; }
.reimb-note { color: #c11574; }
.part-sum { display: flex; flex-direction: column; gap: 2px; margin: 4px 0 8px; color: #475467; font-size: 12px; }
.detail-table.stacked { margin-top: 10px; }
.source { text-align: left; }
.platform-fee { color: #667085; }
.fee-note { display: block; margin-top: 2px; color: #98a2b3; font-size: 11px; }
.tabs { display: inline-flex; gap: 4px; background: #f2f4f7; padding: 3px; border-radius: 10px; }
.tabs button {
  border: 0; background: transparent; padding: 6px 12px; border-radius: 8px; font-size: 13px; color: #475467; cursor: pointer;
}
.tabs button em { font-style: normal; margin-left: 6px; color: #98a2b3; font-size: 12px; }
.tabs button.on { background: #fff; color: #0f172a; font-weight: 600; box-shadow: 0 1px 2px rgba(16, 24, 40, .08); }
.batch { display: flex; align-items: center; gap: 8px; }
.sel-info { font-size: 12px; color: #475467; }

.table-scroll { overflow-x: auto; }
.payout-table { width: 100%; min-width: 1120px; border-collapse: collapse; font-size: 13px; }
.payout-table .payee-col { min-width: 180px; }
.payout-table .bank-col { width: 52px; }
.bank-cell { white-space: nowrap; }
.payout-table > thead th {
  background: #f8fafc; color: #475467; font-size: 12px; font-weight: 700; text-align: left;
  padding: 10px 14px; border-bottom: 1px solid #e4e7ec; white-space: nowrap;
}
.payout-table > tbody > tr > td { padding: 12px 14px; border-bottom: 1px solid #f2f4f7; vertical-align: top; }
.payout-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.payout-table th.num { text-align: right; }
.payout-table .check { width: 36px; }
.payout-table .check input { width: 15px; height: 15px; accent-color: var(--primary); }
.payout-table .ops { white-space: nowrap; text-align: right; }
.payout-table .ops .btn + .btn { margin-left: 6px; }
.lock-note { color: #98a2b3; font-size: 12px; }
.payout-table tr.paid > td { background: #fcfdfc; }
.payee { display: flex; align-items: center; gap: 6px; }
.payee strong { min-width: 0; color: #0f172a; word-break: break-all; }
.who-tag { background: #f2f4f7; color: #667085; }
.who-tag.user { background: #f4f3ff; color: #5925dc; }
.merged { display: block; margin-top: 4px; color: #b54708; font-size: 12px; }
.caret { margin-left: 6px; font-size: 12px; color: #98a2b3; }
.minus { color: #b42318; }
.net { color: #067647; font-weight: 700; }
.status { display: inline-block; white-space: nowrap; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.status.paid { background: #ecfdf3; color: #067647; }
.status.unpaid { background: #fffaeb; color: #b54708; }
.paid-at { display: block; margin-top: 4px; color: #98a2b3; font-size: 12px; }
.changed { display: block; margin-top: 4px; color: #b42318; font-size: 12px; }
.detail-row > td { background: #f9fafb; padding-top: 4px !important; }
.detail-table { width: 100%; max-width: 920px; border-collapse: collapse; font-size: 12px; }
.detail-table th, .detail-table td { padding: 6px 10px; border-bottom: 1px solid #eaecf0; text-align: left; }
.detail-table th { color: #667085; font-weight: 600; }
.detail-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.detail-table .session-dates { color: #475467; max-width: 360px; word-break: break-all; line-height: 1.45; }
.empty-cell { text-align: center; color: #98a2b3; padding: 40px 16px !important; }
</style>
