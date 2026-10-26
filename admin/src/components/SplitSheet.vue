<template>
  <div class="split-sheet" :class="{ final: sheet.final }">
    <header class="sheet-head">
      <div>
        <h2>{{ sheet.month || month }} 月度结算单<span class="sheet-state" :class="{ final: sheet.final }">{{ sheet.final ? '最终' : '试算' }}</span></h2>
        <p v-if="sheet.final" class="badge ok">结算单已固定{{ sheet.lockedAt ? `（${dateTime(sheet.lockedAt)}）` : '' }}，以下为最终打款金额</p>
        <p v-else class="badge warn">结算单未固定，金额为试算结果，仅供核对，固定结算单后才是最终打款单</p>
      </div>
      <div class="sheet-actions no-print">
        <button class="btn" type="button" :disabled="loading" @click="load">刷新</button>
        <button class="btn" type="button" :disabled="!ready" @click="exportCsv">导出 CSV</button>
        <button class="btn primary" type="button" :disabled="!ready" @click="print">打印</button>
      </div>
    </header>

    <p v-if="error" class="error no-print">{{ error }}</p>
    <p v-else-if="loading && !ready" class="muted">正在生成…</p>

    <template v-if="ready">
      <div class="sheet-kpis">
        <div><small>实发合计</small><strong>{{ money(totals.net) }}</strong></div>
        <div><small>课时费</small><strong>{{ money(totals.teacherNet) }}</strong></div>
        <div><small>机构</small><strong>{{ money(totals.orgNet) }}</strong></div>
        <div><small>分成</small><strong>{{ money(totals.splitNet) }}</strong></div>
        <div v-if="totals.reimburseNet"><small>报销</small><strong>{{ money(totals.reimburseNet) }}</strong></div>
        <div><small>税费 / 手续费</small><strong>{{ money(totals.tax) }} / {{ money(totals.fee) }}</strong></div>
        <div v-if="sheet.final"><small>已打 / 未打</small><strong>{{ totals.paidCount }} / {{ totals.unpaidCount }} 位</strong></div>
      </div>

      <section class="sheet-section">
        <h3>一、各合集分成</h3>
        <p class="hint">分成基数按「{{ sheet.config?.basis === 'school' ? '校方金额' : '利润' }}」计算，扣除手续费与报销后得到分成池，再按比例分给成员；税率 {{ sheet.config?.taxRate ?? 0 }}%，税费留在对公账户。手续费带零头的行见表下说明，完整算法见文末「三、计算说明」。</p>
        <p v-if="!collections.length" class="muted">还没有分成合集</p>
        <div v-for="c in collections" :key="c.id" class="sheet-collection">
          <div class="collection-line">
            <b>{{ c.name }}</b>
            <span>课次 {{ c.sessionCount }}</span>
            <span>基数 {{ money(c.base) }}</span>
            <span v-if="c.teacherFeeTotal">− 课时费手续费 {{ money(c.teacherFeeTotal) }}</span>
            <span v-if="c.orgFeeTotal">− 机构手续费 {{ money(c.orgFeeTotal) }}</span>
            <span v-if="c.reimburseTotal">− 报销 {{ money(c.reimburseTotal) }}</span>
            <span class="pool">分成池 {{ money(c.pool) }}</span>
          </div>
          <table>
            <thead><tr><th>成员</th><th class="num">比例</th><th class="num">应分</th><th class="num">税费</th><th class="num">手续费</th><th class="num">实得</th></tr></thead>
            <tbody>
              <tr v-for="(m, i) in c.members" :key="i">
                <td>{{ m.name }}<sup v-if="m.note" class="mark">{{ noteMark(c, i) }}</sup></td>
                <td class="num">{{ m.ratio }}%</td>
                <td class="num">{{ money(m.gross) }}</td>
                <td class="num">{{ money(m.tax) }}</td>
                <td class="num">{{ money(m.fee) }}<sup v-if="m.note" class="mark">{{ noteMark(c, i) }}</sup></td>
                <td class="num strong">{{ money(m.net) }}</td>
              </tr>
            </tbody>
          </table>
          <ul v-if="c.members.some((m) => m.note)" class="member-notes">
            <template v-for="(m, i) in c.members" :key="i">
              <li v-if="m.note"><b>{{ noteMark(c, i) }} {{ m.name }}：</b>{{ m.note }}。</li>
            </template>
          </ul>
        </div>
      </section>

      <section class="sheet-section">
        <h3>二、全员打款单（同一人合并一笔）</h3>
        <table>
          <thead>
            <tr>
              <th>#</th><th>收款人</th><th>类型</th><th>构成</th>
              <th class="num">应发</th><th class="num">税费</th><th class="num">手续费</th><th class="num">报销</th><th class="num">实发</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in payees" :key="p.key">
              <td>{{ i + 1 }}</td>
              <td class="strong nowrap">{{ p.name }}</td>
              <td class="nowrap">{{ kindLabel[p.kind] || p.kind }}</td>
              <td>
                <div class="parts">
                  <span v-for="(part, j) in p.parts" :key="j">{{ part.label }} {{ money(part.amount) }}</span>
                </div>
                <small v-if="p.feeNote" class="fee-note">{{ p.feeNote }}。</small>
              </td>
              <td class="num">{{ money(p.gross) }}</td>
              <td class="num">{{ money(p.tax) }}</td>
              <td class="num">{{ money(p.fee) }}</td>
              <td class="num">{{ p.reimburse ? money(p.reimburse) : '—' }}</td>
              <td class="num strong">{{ money(p.net) }}</td>
              <td>
                <span v-if="p.status === 'paid'" class="state ok">已打款{{ p.changed ? '（金额有变）' : '' }}</span>
                <span v-else class="state">{{ sheet.final ? '待打款' : '试算' }}</span>
              </td>
            </tr>
            <tr v-if="!payees.length"><td colspan="10" class="muted">本月没有需要打款的人员</td></tr>
          </tbody>
          <tfoot v-if="payees.length">
            <tr>
              <td colspan="4">合计 {{ payees.length }} 位</td>
              <td class="num">{{ money(sum('gross')) }}</td>
              <td class="num">{{ money(sum('tax')) }}</td>
              <td class="num">{{ money(sum('fee')) }}</td>
              <td class="num">{{ money(sum('reimburse')) }}</td>
              <td class="num strong">{{ money(totals.net) }}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </section>

      <section v-if="notes.length" class="sheet-section">
        <h3>三、计算说明</h3>
        <ol class="calc-notes">
          <li v-for="(line, i) in notes" :key="i">{{ line }}</li>
        </ol>
      </section>

      <footer class="sheet-foot">
        <span>生成时间 {{ dateTime(sheet.generatedAt) }}</span>
        <span class="sign">制表：__________</span>
        <span class="sign">审核：__________</span>
        <span class="sign">股东确认：__________</span>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { api } from '../api';
import { dateTime, money } from '../format';
import { round2 } from '../split';
import { useFinanceLive } from '../composables/useFinanceLive';

const props = defineProps({
  month: { type: String, required: true },
});

const kindLabel = { teacher: '课时费', org: '机构', split: '分成', both: '课时费+分成', reimburse: '报销' };
const sheet = ref({});
const loading = ref(false);
const ready = ref(false);
const error = ref('');
let seq = 0;

const totals = computed(() => sheet.value.totals || {});
const collections = computed(() => sheet.value.collections || []);
const payees = computed(() => sheet.value.payees || []);
const notes = computed(() => sheet.value.notes || []);

const MARKS = '①②③④⑤⑥⑦⑧⑨⑩';
function noteMark(collection, index) {
  const order = collection.members.slice(0, index + 1).filter((m) => m.note).length;
  return MARKS[order - 1] || `(${order})`;
}

function sum(field) {
  return round2(payees.value.reduce((acc, p) => acc + Number(p[field] || 0), 0));
}

async function load() {
  if (!/^\d{4}-\d{2}$/.test(props.month)) return;
  const id = ++seq;
  loading.value = true;
  error.value = '';
  try {
    const data = await api.financeSplitSheet(props.month);
    if (id !== seq) return;
    sheet.value = data || {};
    ready.value = true;
  } catch (err) {
    if (id === seq) error.value = err.message || '生成失败';
  } finally {
    if (id === seq) loading.value = false;
  }
}

useFinanceLive(() => load());
watch(() => props.month, () => {
  ready.value = false;
  load();
}, { immediate: true });

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
  const title = `${sheet.value.month} 月度结算单${sheet.value.final ? '' : '（试算）'}`;
  const rows = [[title], [sheet.value.final ? '结算单已固定' : '试算（结算单未固定）', `生成时间 ${dateTime(sheet.value.generatedAt)}`], []];
  rows.push(['各合集分成']);
  rows.push(['合集', '成员', '比例%', '应分', '税费', '手续费', '实得', '分成池', '说明']);
  for (const c of collections.value) {
    for (const m of c.members) rows.push([c.name, m.name, m.ratio, m.gross, m.tax, m.fee, m.net, c.pool, m.note || '']);
  }
  rows.push([]);
  rows.push(['全员打款单']);
  rows.push(['序号', '收款人', '类型', '构成', '应发', '税费', '手续费', '报销', '实发', '状态', '说明']);
  payees.value.forEach((p, i) => {
    rows.push([
      i + 1,
      p.name,
      kindLabel[p.kind] || p.kind,
      (p.parts || []).map((part) => `${part.label} ${part.amount}`).join('；'),
      p.gross,
      p.tax,
      p.fee,
      p.reimburse || 0,
      p.net,
      p.status === 'paid' ? '已打款' : (sheet.value.final ? '待打款' : '试算'),
      p.feeNote || '',
    ]);
  });
  rows.push(['合计', '', '', '', sum('gross'), sum('tax'), sum('fee'), sum('reimburse'), totals.value.net, '', '']);
  if (notes.value.length) {
    rows.push([]);
    rows.push(['计算说明']);
    notes.value.forEach((line, i) => rows.push([`${i + 1}. ${line}`]));
  }
  const csv = `\ufeff${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function print() {
  document.body.classList.add('printing-sheet');
  const done = () => {
    document.body.classList.remove('printing-sheet');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

onBeforeUnmount(() => document.body.classList.remove('printing-sheet'));
</script>

<style scoped>
.split-sheet { display: flex; flex-direction: column; gap: 14px; }
.sheet-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.sheet-head h2 { margin: 0; font-size: 18px; }
.sheet-state {
  margin-left: 8px; padding: 2px 8px; border-radius: 999px; vertical-align: 2px;
  background: #fff7ed; color: #b45309; font-size: 12px; font-weight: 600;
}
.sheet-state.final { background: #ecfdf3; color: #067647; }
.badge { display: inline-block; margin: 6px 0 0; padding: 4px 10px; border-radius: 8px; font-size: 12px; }
.badge.ok { background: #ecfdf3; color: #027a48; }
.badge.warn { background: #fff7e6; color: #b45309; }
.sheet-actions { display: flex; gap: 8px; }
.sheet-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.sheet-kpis div { padding: 10px 12px; border: 1px solid #e7edf5; border-radius: 10px; background: #fff; }
.sheet-kpis small { display: block; color: #98a2b3; font-size: 12px; }
.sheet-kpis strong { font-size: 16px; }
.sheet-section h3 { margin: 0 0 6px; font-size: 15px; }
.hint { margin: 0 0 10px; color: #667085; font-size: 12px; }
.sheet-collection { margin-bottom: 12px; border: 1px solid #e7edf5; border-radius: 10px; overflow: hidden; }
.collection-line { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 8px 12px; background: #f8fafc; font-size: 13px; color: #475467; }
.collection-line b { color: #111827; }
.collection-line .pool { margin-left: auto; font-weight: 600; color: #1d4ed8; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 7px 10px; border-bottom: 1px solid #eef2f6; text-align: left; vertical-align: top; }
th { color: #667085; font-weight: 500; background: #fff; }
.num { text-align: right; white-space: nowrap; }
.strong { font-weight: 600; }
.parts { display: flex; flex-wrap: wrap; gap: 4px 10px; color: #475467; font-size: 12px; }
.parts span { white-space: nowrap; }
.nowrap { white-space: nowrap; }
.fee-note { display: block; margin-top: 4px; color: #98a2b3; font-size: 11px; line-height: 1.6; }
.mark { margin-left: 2px; color: #b45309; font-size: 10px; }
.member-notes { margin: 0; padding: 8px 12px 10px; list-style: none; background: #fffcf5; border-top: 1px solid #f2ead8; }
.member-notes li { color: #667085; font-size: 11px; line-height: 1.7; }
.member-notes b { color: #475467; font-weight: 600; }
.calc-notes { margin: 0; padding-left: 18px; color: #667085; font-size: 12px; line-height: 1.8; }
tfoot td { font-weight: 600; background: #f8fafc; }
.state { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f2f4f7; color: #475467; font-size: 12px; white-space: nowrap; }
.state.ok { background: #ecfdf3; color: #027a48; }
.sheet-foot { display: flex; flex-wrap: wrap; gap: 8px 28px; color: #667085; font-size: 12px; }
.sheet-foot .sign { display: none; }
</style>

<style>
@media print {
  body.printing-sheet * { visibility: hidden !important; }
  body.printing-sheet .split-sheet,
  body.printing-sheet .split-sheet * { visibility: visible !important; }
  body.printing-sheet .split-sheet { position: absolute; left: 0; top: 0; width: 100%; padding: 0 8mm; }
  body.printing-sheet .split-sheet .no-print { display: none !important; }
  body.printing-sheet .split-sheet .sheet-foot .sign { display: inline; }
  body.printing-sheet .split-sheet .sheet-collection,
  body.printing-sheet .split-sheet tr,
  body.printing-sheet .split-sheet .calc-notes li { break-inside: avoid; }
  body.printing-sheet .split-sheet .fee-note,
  body.printing-sheet .split-sheet .member-notes li,
  body.printing-sheet .split-sheet .calc-notes { color: #475467; }
}
</style>
