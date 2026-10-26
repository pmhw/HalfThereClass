<template>
  <section class="bank-page">
    <div class="page-head">
      <div>
        <h1>交易流水</h1>
        <p>把浦发银行「交易查询」表拖到页面任意位置，或点右上角导入。账户余额按表里的「余额」显示。归属只锁定这笔还没分出去的余额，交易金额保持原样；锁住的余额不能再分给别人。</p>
      </div>
      <div class="actions">
        <input ref="fileInput" class="file" type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" @change="onFile" />
        <button class="btn primary" type="button" :disabled="importing" @click="fileInput?.click()">{{ importing ? '导入中…' : '导入交易单' }}</button>
        <button class="btn" type="button" :disabled="loading" @click="load">刷新</button>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="8" kpis :kpi-count="4" @retry="load">
      <div class="kpi-grid">
        <article class="card kpi">
          <div class="label"><span class="flow-mark in" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 5v11M8 12l4 4 4-4" /></svg></span>收入</div>
          <div class="value in">{{ money(totals.inAmount) }}</div>
          <div class="meta"><span class="flat">{{ totals.inCount }} 笔</span></div>
        </article>
        <article class="card kpi">
          <div class="label"><span class="flow-mark out" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 19V8M8 12l4-4 4 4" /></svg></span>支出</div>
          <div class="value out">{{ money(totals.outAmount) }}</div>
          <div class="meta"><span class="flat">{{ totals.outCount }} 笔</span></div>
        </article>
        <article class="card kpi">
          <div class="label">已锁定归属</div>
          <div class="value">{{ money(totals.locked) }}</div>
          <div class="meta"><span class="flat">锁定后不能再分给其他人</span></div>
        </article>
        <article class="card kpi">
          <div class="label">当前余额</div>
          <div class="value">{{ currentBalance ? money(currentBalance.amount) : '—' }}</div>
          <div class="meta"><span class="flat">{{ currentBalance ? currentBalance.at : '还没有余额' }}</span></div>
        </article>
      </div>

      <div class="tabs remark-tabs">
        <button type="button" :class="{ on: remarkKey === null }" @click="remarkKey = null">全部<em>{{ rows.length }}</em></button>
        <button
          v-for="chip in remarkChips"
          :key="chip.key"
          type="button"
          :class="{ on: remarkKey === chip.key }"
          @click="toggleRemark(chip.key)"
        >{{ chip.label }}<em>{{ chip.count }}</em></button>
      </div>

      <article v-if="owners.length" class="card owners">
        <span v-for="owner in owners" :key="owner.name" class="owner">{{ owner.name }} {{ money(owner.amount) }}</span>
      </article>

      <article class="card">
        <div v-if="!filtered.length" class="empty">{{ rows.length ? '这个备注下没有流水' : '还没有交易流水，先导入浦发交易查询表' }}</div>
        <div v-else class="table-scroll">
          <table class="bank-table">
            <thead>
              <tr>
                <th>流水</th>
                <th class="num">余额</th>
                <th class="num">已锁定</th>
                <th class="num">未归属余额</th>
                <th>对方</th>
                <th>摘要</th>
                <th>备注</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filtered" :key="row.id" :class="{ open: openId === row.id, done: row.remain <= 0 }">
                <td>
                  <div class="flow" :class="row.direction">
                    <span class="flow-mark" :class="row.direction" aria-hidden="true">
                      <svg v-if="row.direction === 'in'" viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v11M8 12l4 4 4-4" /></svg>
                      <svg v-else viewBox="0 0 24 24" width="16" height="16"><path d="M12 19V8M8 12l4-4 4 4" /></svg>
                    </span>
                    <span class="flow-main">
                      <strong :class="row.direction">{{ row.direction === 'in' ? '+' : '−' }}{{ money(row.amount) }}</strong>
                      <small>{{ row.txnDate }} {{ row.txnTime }}</small>
                    </span>
                  </div>
                </td>
                <td class="num balance">{{ row.balance == null ? '—' : money(row.balance) }}</td>
                <td class="num">{{ money(row.assigned) }}</td>
                <td class="num" :class="{ warn: row.remain > 0 }">{{ money(row.remain) }}</td>
                <td>
                  <div class="who">{{ row.counterName || '—' }}</div>
                  <small v-if="row.counterBank">{{ row.counterBank }}</small>
                </td>
                <td>{{ row.summary || '—' }}</td>
                <td>
                  <button v-if="row.remark" class="remark" type="button" @click="toggleRemark(row.remark)">{{ row.remark }}</button>
                  <button v-else class="remark muted" type="button" @click="toggleRemark('')">无备注</button>
                </td>
                <td class="ops">
                  <button class="btn tiny" type="button" @click="openDrawer(row)">锁定</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </PageLoad>

    <Teleport to="body">
      <div v-if="active" class="bank-drawer-mask" @click.self="closeDrawer">
        <aside class="bank-drawer" role="dialog" aria-label="锁定余额">
          <header>
            <div>
              <h3>锁定余额</h3>
              <p>{{ active.txnDate }} {{ active.txnTime }} · {{ active.counterName || '无对方户名' }}</p>
            </div>
            <button class="modal-close" type="button" aria-label="关闭" @click="closeDrawer">×</button>
          </header>
          <div class="bank-drawer-body">
            <div class="drawer-facts">
              <div>
                <small>交易金额</small>
                <strong :class="active.direction">{{ active.direction === 'in' ? '+' : '−' }}{{ money(active.amount) }}</strong>
                <em>{{ active.direction === 'in' ? '收入' : '支出' }}</em>
              </div>
              <div>
                <small>账户余额</small>
                <strong>{{ active.balance == null ? '—' : money(active.balance) }}</strong>
                <em>导入原值</em>
              </div>
              <div>
                <small>未归属余额</small>
                <strong class="warn">{{ money(active.remain) }}</strong>
                <em>只能锁定这一部分</em>
              </div>
            </div>
            <p class="hint">只锁定未归属余额。交易金额和账户余额保持导入时的数字，已经锁定的余额不能再分给其他人。</p>
            <div v-if="active.allocations.length" class="allocs">
              <div v-for="item in active.allocations" :key="item.id" class="alloc">
                <strong>{{ item.name }}</strong>
                <span>{{ money(item.amount) }}</span>
                <em v-if="item.note">{{ item.note }}</em>
                <em class="lock">{{ item.locked ? '已锁定' : '未锁定' }}</em>
                <button v-if="item.locked" class="link" type="button" :disabled="busy" @click="unlock(item)">解除锁定</button>
                <button v-else class="link danger" type="button" :disabled="busy" @click="removeAlloc(active, item)">删除</button>
              </div>
            </div>
            <p v-else class="hint">这笔余额还没有归属。</p>
            <form v-if="active.remain > 0" class="alloc-form" novalidate @submit.prevent="submitAlloc(active)">
              <div class="type-switch">
                <button type="button" :class="{ on: form.mode === 'user' }" @click="form.mode = 'user'">系统人员</button>
                <button type="button" :class="{ on: form.mode === 'name' }" @click="form.mode = 'name'">手填姓名</button>
              </div>
              <SearchSelect
                v-if="form.mode === 'user'"
                :model-value="form.userId"
                :options="userOptions"
                placeholder="选择所属人员"
                search-placeholder="搜索姓名"
                @update:model-value="(id) => (form.userId = id || '')"
              />
              <input v-else v-model="form.name" maxlength="40" placeholder="资金所属人员" />
              <label class="amt">
                <span>锁定金额</span>
                <input v-model="form.amount" type="number" min="0.01" :max="active.remain" step="0.01" />
                <em>未归属余额 {{ money(active.remain) }}</em>
              </label>
              <input v-model="form.note" maxlength="80" placeholder="备注，可不填" />
              <div class="drawer-actions">
                <button class="btn primary" type="submit" :disabled="busy">锁定余额</button>
                <button v-if="active.counterName" class="link" type="button" @click="fillCounterparty(active)">按对方户名填入</button>
              </div>
            </form>
            <p v-if="active.suggested && active.remain > 0" class="hint">对方户名对应系统人员「{{ active.suggested.name }}」，选中后仍需确认锁定金额。</p>
            <p v-if="active.remain <= 0" class="hint">这笔未归属余额已经全部锁定。</p>
          </div>
        </aside>
      </div>
      <div v-if="dragging" class="bank-drop">
        <div class="bank-drop-card">
          <strong>{{ importing ? '正在导入…' : '松开即可导入交易单' }}</strong>
          <span>浦发银行交易查询表，xls 或 xlsx</span>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref } from 'vue';
import PageLoad from '../components/PageLoad.vue';
import SearchSelect from '../components/SearchSelect.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { api } from '../api';
import { money } from '../format';
import { notify } from '../notify';

const { loading, error, ready, run, bindLoad } = usePageLoad();
const data = ref({ txns: [], people: [] });
const remarkKey = ref(null);
const openId = ref(null);
const importing = ref(false);
const dragging = ref(false);
const busy = ref(false);
const fileInput = ref(null);
const form = reactive({ mode: 'user', userId: '', name: '', amount: '', note: '' });

const rows = computed(() => data.value.txns || []);
const remarkChips = computed(() => {
  const map = new Map();
  for (const row of rows.value) {
    const key = row.remark || '';
    const chip = map.get(key) || { key, label: key || '无备注', count: 0 };
    chip.count += 1;
    map.set(key, chip);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh'));
});
const filtered = computed(() => (
  remarkKey.value === null ? rows.value : rows.value.filter((row) => (row.remark || '') === remarkKey.value)
));
const totals = computed(() => {
  const sum = { inAmount: 0, outAmount: 0, inCount: 0, outCount: 0, locked: 0 };
  for (const row of rows.value) {
    if (row.direction === 'in') {
      sum.inAmount += row.amount;
      sum.inCount += 1;
    } else {
      sum.outAmount += row.amount;
      sum.outCount += 1;
    }
    for (const item of row.allocations) if (item.locked) sum.locked += item.amount;
  }
  return sum;
});
const currentBalance = computed(() => {
  const latest = rows.value
    .filter((row) => row.balance != null)
    .reduce((best, row) => {
      if (!best) return row;
      const byTime = row.txnDate.localeCompare(best.txnDate) || row.txnTime.localeCompare(best.txnTime);
      if (byTime > 0 || (byTime === 0 && row.id < best.id)) return row;
      return best;
    }, null);
  if (!latest) return null;
  return { amount: latest.balance, at: `${latest.txnDate} ${latest.txnTime}` };
});
const owners = computed(() => {
  const map = new Map();
  for (const row of rows.value) {
    for (const item of row.allocations) {
      if (!item.locked) continue;
      map.set(item.name, (map.get(item.name) || 0) + item.amount);
    }
  }
  return [...map.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
});
const active = computed(() => rows.value.find((row) => row.id === openId.value) || null);
const userOptions = computed(() => (data.value.people || []).map((person) => ({
  value: person.id,
  label: person.name,
  hint: [person.role === 'teacher' ? '教师' : '用户', person.phoneTail ? `尾号 ${person.phoneTail}` : ''].filter(Boolean).join(' · '),
})));

function toggleRemark(key) {
  remarkKey.value = remarkKey.value === key ? null : key;
}

function fillCounterparty(row) {
  if (row.suggested) {
    form.mode = 'user';
    form.userId = row.suggested.userId;
    form.name = row.suggested.name;
  } else {
    form.mode = 'name';
    form.userId = '';
    form.name = row.counterName;
  }
  form.amount = row.remain;
}

function closeDrawer() {
  openId.value = null;
}

function openDrawer(row) {
  openId.value = row.id;
  form.mode = row.suggested ? 'user' : 'name';
  form.userId = row.suggested?.userId || '';
  form.name = row.suggested ? '' : (row.counterName || '');
  form.amount = row.remain > 0 ? row.remain : '';
  form.note = '';
}

async function load() {
  await run(async () => {
    data.value = await api.bankTxns();
  });
}

function isWorkbook(file) {
  return /\.xlsx?$/i.test(file?.name || '');
}

async function importFile(file) {
  if (!file || importing.value) return;
  if (!isWorkbook(file)) {
    notify.error('请拖入浦发交易查询表（xls 或 xlsx）');
    return;
  }
  importing.value = true;
  try {
    const result = await api.importBankTxns(file);
    notify.success(result.inserted ? `已导入 ${result.inserted} 笔${result.skipped ? `，跳过重复 ${result.skipped} 笔` : ''}` : `没有新流水，${result.skipped} 笔已在库中`);
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '导入失败');
  } finally {
    importing.value = false;
    dragging.value = false;
  }
}

function onFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  importFile(file);
}

function hasFiles(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files');
}

function onWindowDragEnter(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragging.value = true;
}

function onWindowDragOver(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = importing.value ? 'none' : 'copy';
}

function onWindowDragLeave(event) {
  if (event.relatedTarget) return;
  dragging.value = false;
}

function onWindowDrop(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragging.value = false;
  importFile(event.dataTransfer?.files?.[0]);
}

let dragBound = false;
function bindDrag() {
  if (dragBound) return;
  dragBound = true;
  window.addEventListener('dragenter', onWindowDragEnter);
  window.addEventListener('dragover', onWindowDragOver);
  window.addEventListener('dragleave', onWindowDragLeave);
  window.addEventListener('drop', onWindowDrop);
}

function unbindDrag() {
  if (!dragBound) return;
  dragBound = false;
  dragging.value = false;
  window.removeEventListener('dragenter', onWindowDragEnter);
  window.removeEventListener('dragover', onWindowDragOver);
  window.removeEventListener('dragleave', onWindowDragLeave);
  window.removeEventListener('drop', onWindowDrop);
}

onMounted(bindDrag);
onActivated(bindDrag);
onDeactivated(unbindDrag);
onBeforeUnmount(unbindDrag);

async function submitAlloc(row) {
  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    notify.error('请填写归属金额');
    return;
  }
  if (Math.round(amount * 100) > Math.round(row.remain * 100)) {
    notify.error(`未归属余额还剩 ${money(row.remain)}，不能超出`);
    return;
  }
  const person = (data.value.people || []).find((item) => item.id === form.userId);
  if (form.mode === 'user' && !person) {
    notify.error('请选择所属人员');
    return;
  }
  if (form.mode === 'name' && !form.name.trim()) {
    notify.error('请填写所属人员');
    return;
  }
  busy.value = true;
  try {
    await api.allocateBankTxn(row.id, {
      userId: form.mode === 'user' ? form.userId : null,
      name: form.mode === 'user' ? person.name : form.name.trim(),
      amount,
      note: form.note.trim(),
    });
    notify.success('已锁定余额');
    await load();
    const next = rows.value.find((item) => item.id === row.id);
    if (next) form.amount = next.remain > 0 ? next.remain : '';
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '归属失败');
  } finally {
    busy.value = false;
  }
}

async function unlock(item) {
  if (!window.confirm(`解除「${item.name}」¥${Number(item.amount).toFixed(2)} 的锁定？解除后这笔金额可以删除并重新归属。`)) return;
  busy.value = true;
  try {
    await api.lockBankAlloc(item.id, false);
    await load();
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '解除失败');
  } finally {
    busy.value = false;
  }
}

async function removeAlloc(row, item) {
  if (!window.confirm(`删除「${item.name}」的 ¥${Number(item.amount).toFixed(2)} 归属？删除后金额回到未归属。`)) return;
  busy.value = true;
  try {
    await api.removeBankAlloc(item.id);
    await load();
    const next = rows.value.find((itemRow) => itemRow.id === row.id);
    if (next) form.amount = next.remain;
  } catch (err) {
    if (!err?.financeLocked) notify.error(err?.message || '删除失败');
  } finally {
    busy.value = false;
  }
}

bindLoad(load);
</script>

<style scoped>
.file { display: none; }
.remark-tabs { margin-top: 4px; }
.remark-tabs em { margin-left: 6px; font-style: normal; color: #98a2b3; }
.owners { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; padding: 12px 14px; }
.owner { background: #f4f7fb; border-radius: 999px; padding: 4px 10px; color: #344054; }
.bank-table { width: 100%; border-collapse: collapse; }
.bank-table th, .bank-table td { padding: 10px 8px; border-bottom: 1px solid #eef2f6; text-align: left; vertical-align: top; }
.bank-table th { color: #667085; font-weight: 600; font-size: 13px; }
.bank-table .num { text-align: right; white-space: nowrap; }
.bank-table .num.warn { color: #b54708; }
.bank-table tr.done td:not(:first-child) { color: #667085; }
.bank-table tr.open { background: #f5f8ff; }
.num.balance { font-weight: 650; }
.who + small { display: block; color: #98a2b3; }
.flow { display: flex; align-items: flex-start; gap: 10px; }
.flow-mark {
  width: 32px; height: 32px; border-radius: 10px; flex: none;
  display: grid; place-items: center;
}
.flow-mark svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.flow-mark.in { background: #e7f6ee; color: #067647; }
.flow-mark.out { background: #fff1e8; color: #c2410c; }
.flow-main { display: flex; flex-direction: column; min-width: 0; }
.flow-main strong { font-size: 16px; font-weight: 720; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.2; }
.flow-main strong.in { color: #067647; }
.flow-main strong.out { color: #c2410c; }
.flow-main small { margin-top: 3px; color: #98a2b3; font-size: 12px; line-height: 1.3; }
.kpi .label .flow-mark { width: 22px; height: 22px; border-radius: 7px; }
.kpi .value.in { color: #067647; }
.kpi .value.out { color: #c2410c; }
.drawer-facts strong.in { color: #067647; }
.drawer-facts strong.out { color: #c2410c; }
.remark { border: 0; background: #eef4ff; color: #175cd3; border-radius: 999px; padding: 2px 8px; cursor: pointer; }
.remark.muted { background: #f2f4f7; color: #667085; }
.ops { white-space: nowrap; }
.detail td { background: #f8fafc; }
.allocs { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.alloc { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.alloc .lock { color: #067647; font-style: normal; }
.alloc-form { display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
.alloc-form input { height: 34px; border: 1px solid #d0d5dd; border-radius: 8px; padding: 0 10px; }
.amt span { color: #667085; font-size: 13px; }
.drawer-actions { display: flex; align-items: center; gap: 12px; }
.bank-drawer-mask { position: fixed; inset: 0; z-index: 60; background: rgba(15, 23, 42, 0.28); }
.bank-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100%);
  background: #fff; box-shadow: -12px 0 40px rgba(16, 24, 40, 0.12);
  display: flex; flex-direction: column;
}
.bank-drawer header { display: flex; justify-content: space-between; gap: 12px; padding: 18px 18px 14px; border-bottom: 1px solid #eef2f6; }
.bank-drawer h3 { margin: 0; font-size: 18px; }
.bank-drawer header p { margin: 4px 0 0; color: #667085; font-size: 13px; }
.bank-drawer-body { padding: 16px 18px 28px; overflow: auto; }
.drawer-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.drawer-facts div { background: #f8fafc; border-radius: 10px; padding: 10px; }
.drawer-facts small, .drawer-facts em { display: block; color: #98a2b3; font-style: normal; font-size: 12px; }
.drawer-facts strong { display: block; margin: 4px 0; font-size: 15px; }
.drawer-facts .warn { color: #b54708; }
.amt { display: flex; flex-direction: column; }
.amt em { font-style: normal; color: #98a2b3; font-size: 12px; }
.hint { color: #667085; margin: 0 0 8px; }
.link { border: 0; background: transparent; color: #175cd3; cursor: pointer; padding: 0; }
.link.danger { color: #b42318; }
.empty { padding: 28px 8px; color: #667085; }
.type-switch { display: flex; gap: 4px; }
.type-switch button { height: 34px; border: 0; border-radius: 8px; background: #fff; padding: 0 10px; color: #667085; }
.type-switch button.on { background: var(--primary-soft); color: var(--primary); }
.bank-drop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(23, 92, 211, 0.16);
  pointer-events: none;
}
.bank-drop-card {
  min-width: 280px;
  padding: 28px 32px;
  border: 2px dashed #175cd3;
  border-radius: 16px;
  background: #fff;
  text-align: center;
  box-shadow: 0 12px 40px rgba(16, 24, 40, 0.12);
}
.bank-drop-card strong { display: block; font-size: 18px; color: #175cd3; }
.bank-drop-card span { display: block; margin-top: 8px; color: #667085; }
</style>
