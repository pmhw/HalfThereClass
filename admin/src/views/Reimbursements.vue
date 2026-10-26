<template>
  <section>
    <div class="page-head">
      <div>
        <h1>报销单</h1>
        <p>教师提交票据后需管理员审核；通过时选择结算月份与扣除合集，金额从该合集当月可分配利润中扣除（先扣再按比例分成）。通过后自动并入「财务打款」该月同一人的打款，打款时一起标记为已报销。后台也可直接代教师录入。</p>
      </div>
      <div class="actions">
        <button class="btn primary" type="button" @click="openCreate">新增报销单</button>
      </div>
    </div>
    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="8" @retry="load">
      <p v-if="notice" class="ok-tip">{{ notice }}</p>
      <div class="filter-bar">
      <div class="tabs">
        <button type="button" :class="{ on: tab === '' }" @click="setTab('')">全部</button>
        <button type="button" :class="{ on: tab === 'pending' }" @click="setTab('pending')">
          待审核
          <span v-if="pendingCount" class="tag amber">{{ pendingCount }}</span>
        </button>
        <button type="button" :class="{ on: tab === 'approved' }" @click="setTab('approved')">可报销</button>
        <button type="button" :class="{ on: tab === 'reimbursed' }" @click="setTab('reimbursed')">已报销</button>
        <button type="button" :class="{ on: tab === 'rejected' }" @click="setTab('rejected')">已驳回</button>
      </div>
      </div>
      <p v-if="month && deductSummary.total" class="deduct-summary">
        {{ month }} 从合集扣除：
        <span v-for="g in deductSummary.groups" :key="g.name" class="deduct-chip">{{ g.name }} <b>¥{{ g.amount.toFixed(2) }}</b></span>
        <span v-if="deductSummary.unlinked" class="deduct-chip muted-chip">未关联（平台承担） <b>¥{{ deductSummary.unlinked.toFixed(2) }}</b></span>
        <small>（仅统计已通过 / 已报销）</small>
      </p>

      <article class="card">
        <table>
          <thead>
            <tr>
              <th>教师</th>
              <th>事由</th>
              <th>类别</th>
              <th>金额</th>
              <th>结算月份 / 扣除合集</th>
              <th>状态</th>
              <th>凭证</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.id">
              <td>
                <div>{{ item.user?.teacherCert?.realName || item.user?.nickname || '—' }}</div>
                <div class="muted">{{ item.user?.phone || '' }}</div>
              </td>
              <td>
                <div>{{ item.title }}</div>
                <div v-if="item.description" class="muted">{{ item.description }}</div>
              </td>
              <td>{{ item.categoryLabel }}</td>
              <td>¥{{ Number(item.amount).toFixed(2) }}</td>
              <td>
                <div>{{ item.month || '—' }} <span class="muted inline">发生 {{ item.expenseDate }}</span></div>
                <span v-if="item.collectionName" class="tag blue">从「{{ item.collectionName }}」扣除</span>
                <span v-else-if="item.status === 'pending'" class="muted">审核通过时选择合集</span>
                <span v-else-if="item.status !== 'rejected'" class="muted">未关联合集 · 平台承担</span>
              </td>
              <td>
                <span :class="['tag', statusTone(item.status)]">{{ item.statusLabel }}</span>
                <div v-if="item.status === 'approved' && item.month" class="muted">
                  待随 <router-link :to="{ path: '/finance/payouts', query: { month: item.month } }">{{ item.month }} 财务打款</router-link>
                </div>
                <div v-if="item.rejectReason" class="muted">{{ item.rejectReason }}</div>
              </td>
              <td>
                <ActionBtn icon="image" tip="查看凭证" @click="viewing = item" />
              </td>
              <td class="col-actions">
                <div class="row-actions">
                  <template v-if="item.status === 'pending'">
                    <ActionBtn icon="check" tip="通过" tone="plan" @click="openDeduction(item, 'approve')" />
                    <ActionBtn icon="pencil" tip="修改" @click="openDeduction(item, 'edit')" />
                    <ActionBtn icon="x" tip="驳回" tone="danger" @click="openReject(item)" />
                  </template>
                  <template v-else-if="item.status === 'approved'">
                    <ActionBtn icon="pencil" tip="修改（金额 / 月份 / 合集 / 凭证）" @click="openDeduction(item, 'edit')" />
                    <ActionBtn icon="check" tip="确认已报销" tone="plan" @click="pay(item)" />
                  </template>
                  <template v-else-if="item.status === 'reimbursed'">
                    <ActionBtn icon="pencil" tip="修改（月份 / 合集 / 凭证）" @click="openDeduction(item, 'edit')" />
                    <span class="muted">{{ formatTime(item.reimbursedAt) }}</span>
                  </template>
                  <span v-else class="muted">—</span>
                </div>
              </td>
            </tr>
            <tr v-if="!list.length"><td colspan="8" class="empty">暂无报销单</td></tr>
          </tbody>
        </table>
      </article>
    </PageLoad>

    <PageModal
      :open="!!viewing"
      size="wide"
      icon="image"
      :title="viewing ? `${viewing.title} · ¥${Number(viewing.amount).toFixed(2)}` : '凭证'"
      :desc="viewing ? `${viewing.categoryLabel} · ${viewing.expenseDate}` : ''"
      @close="viewing = null"
    >
      <div v-if="viewing" class="voucher">
        <p v-if="viewing.description" class="voucher-desc">{{ viewing.description }}</p>
        <div v-if="bankLine(viewing)" class="bank">收款账户：{{ bankLine(viewing) }}</div>
        <div v-if="viewing.attachments?.length" class="voucher-files">
          <a
            v-for="(url, i) in viewing.attachments"
            :key="i"
            class="voucher-file"
            :href="asset(url)"
            target="_blank"
            rel="noopener"
          >
            <img v-if="!/\.pdf$/i.test(url)" :src="asset(url)" alt="" />
            <span v-else>PDF 凭证 {{ i + 1 }}</span>
          </a>
        </div>
        <p v-else class="muted">暂无凭证</p>
      </div>
    </PageModal>

    <PageModal :open="!!createForm" size="narrow" title="新增报销单" icon="receipt" @close="closeCreate">
      <form v-if="createForm" class="form" @submit.prevent="saveCreate">
        <label>教师
          <SearchSelect
            v-model="createForm.userId"
            :options="teacherOptions"
            placeholder="搜索并选择已认证教师"
            search-placeholder="姓名 / 手机号…"
          />
        </label>
        <label>报销事由<input v-model="createForm.title" maxlength="80" required placeholder="如：外出授课交通费" /></label>
        <div class="form-row">
          <label>类别
            <select v-model="createForm.category">
              <option v-for="item in categories" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <label>金额（元）<input v-model="createForm.amount" type="number" min="0.01" step="0.01" required /></label>
        </div>
        <div class="form-row">
          <label>发生日期<input v-model="createForm.expenseDate" type="date" required @change="syncCreateMonth" /></label>
          <label>录入后状态
            <select v-model="createForm.status">
              <option value="approved">已通过（待打款）</option>
              <option value="reimbursed">已报销（已打款）</option>
              <option value="pending">待审核</option>
            </select>
          </label>
        </div>
        <div class="form-row">
          <label>结算月份<input v-model="createForm.month" type="month" required /></label>
          <label>扣除合集
            <select v-model="createForm.splitCollectionId">
              <option value="">不扣除（平台承担）</option>
              <option v-for="c in collections" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
            </select>
          </label>
        </div>
        <label>说明<textarea v-model="createForm.description" rows="2" maxlength="500" placeholder="选填" /></label>
        <div class="upload-box">
          <div class="row-between">
            <span>票据 / 凭证（选填，最多 9 张）<small class="paste-tip">可 Ctrl+V 粘贴截图</small></span>
            <label class="btn" :class="{ disabled: uploading || createForm.attachments.length >= 9 }">
              {{ uploading ? '上传中…' : '上传' }}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                hidden
                :disabled="uploading || createForm.attachments.length >= 9"
                @change="onPickFiles($event, createForm)"
              />
            </label>
          </div>
          <div v-if="createForm.attachments.length" class="files small">
            <div v-for="(url, i) in createForm.attachments" :key="url" class="file-item">
              <img v-if="!/\.pdf$/i.test(url)" :src="asset(url)" alt="" />
              <span v-else>PDF {{ i + 1 }}</span>
              <button type="button" class="icon-btn remove" title="移除" @click="createForm.attachments.splice(i, 1)">×</button>
            </div>
          </div>
        </div>
        <p v-if="createError" class="error">{{ createError }}</p>
        <div class="form-actions">
          <button class="btn primary" type="submit" :disabled="creating || uploading">{{ creating ? '保存中…' : '保存' }}</button>
          <button class="btn" type="button" @click="closeCreate">取消</button>
        </div>
      </form>
    </PageModal>

    <PageModal
      :open="!!deduction"
      size="narrow"
      :title="deduction?.mode === 'approve' ? '通过报销单' : '修改报销单'"
      icon="layers"
      @close="closeDeduction"
    >
      <form v-if="deduction" class="form" @submit.prevent="saveDeduction">
        <p class="deduct-head">
          {{ deduction.item.user?.teacherCert?.realName || deduction.item.user?.nickname || '教师' }} · {{ deduction.item.title }}
          <b>¥{{ Number(deduction.item.amount).toFixed(2) }}</b>
        </p>
        <label>金额（元）
          <input
            v-model="deduction.amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            :disabled="deduction.item.status === 'reimbursed'"
          />
          <small v-if="deduction.item.status === 'reimbursed'" class="muted">已打款，金额不能再改</small>
        </label>
        <label>结算月份<input v-model="deduction.month" type="month" required /></label>
        <label>扣除合集
          <select v-model="deduction.splitCollectionId">
            <option value="">不扣除（平台承担）</option>
            <option v-for="c in collections" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
          </select>
        </label>
        <p class="hint">
          选择合集后，该金额计入合集 {{ deduction.month || '当月' }} 的扣除项：可分配 = 利润 − 手续费 − 报销，再按比例分给分成人员。
          <template v-if="!collections.length">还没有分成合集，可先到「分成比例」创建。</template>
        </p>
        <div class="upload-box">
          <div class="row-between">
            <span>票据 / 凭证（最多 9 张）<small class="paste-tip">可 Ctrl+V 粘贴截图</small></span>
            <label class="btn" :class="{ disabled: uploading || deduction.attachments.length >= 9 }">
              {{ uploading ? '上传中…' : '上传' }}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                hidden
                :disabled="uploading || deduction.attachments.length >= 9"
                @change="onPickFiles($event, deduction)"
              />
            </label>
          </div>
          <div v-if="deduction.attachments.length" class="files small">
            <div v-for="(url, i) in deduction.attachments" :key="url" class="file-item">
              <a :href="asset(url)" target="_blank" rel="noopener">
                <img v-if="!/\.pdf$/i.test(url)" :src="asset(url)" alt="" />
                <span v-else>PDF {{ i + 1 }}</span>
              </a>
              <button type="button" class="icon-btn remove" title="移除" @click="deduction.attachments.splice(i, 1)">×</button>
            </div>
          </div>
          <span v-else class="muted">暂无凭证</span>
        </div>
        <p v-if="deductionError" class="error">{{ deductionError }}</p>
        <div class="form-actions">
          <button class="btn primary" type="submit" :disabled="deductionSaving || uploading">
            {{ deductionSaving ? '保存中…' : deduction.mode === 'approve' ? '确认通过' : '保存' }}
          </button>
          <button class="btn" type="button" @click="closeDeduction">取消</button>
        </div>
      </form>
    </PageModal>

    <PageModal :open="!!rejecting" size="narrow" title="驳回报销单" icon="x" @close="rejecting = null">
      <textarea v-model="reason" rows="3" placeholder="请填写驳回原因" />
      <template #footer>
        <button type="button" class="btn" @click="rejecting = null">取消</button>
        <button type="button" class="btn danger-fill" @click="review(rejecting, 'reject')">确认驳回</button>
      </template>
    </PageModal>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, protectedAssetUrl } from '../api';
import ActionBtn from '../components/ActionBtn.vue';
import PageLoad from '../components/PageLoad.vue';
import PageModal from '../components/PageModal.vue';
import SearchSelect from '../components/SearchSelect.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { notify } from '../notify';
import { notifyFinanceChanged } from '../composables/useFinanceLive';
import { useFinanceMonth } from '../composables/useFinanceMonth';

const categories = [
  { value: 'transport', label: '交通出行' },
  { value: 'material', label: '教材教具' },
  { value: 'meal', label: '餐饮补贴' },
  { value: 'office', label: '办公耗材' },
  { value: 'other', label: '其他' },
];
const createForm = ref(null);
const teacherOptions = ref([]);
const creating = ref(false);
const uploading = ref(false);
const createError = ref('');

function todayText() {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

async function openCreate() {
  createError.value = '';
  createForm.value = {
    userId: '',
    title: '',
    category: 'transport',
    amount: '',
    expenseDate: todayText(),
    month: month.value || todayText().slice(0, 7),
    splitCollectionId: '',
    status: 'approved',
    description: '',
    attachments: [],
  };
  try {
    const rows = await api.reimbursementTeachers();
    teacherOptions.value = rows.map((item) => ({
      value: String(item.id),
      label: `${item.name}${item.phone ? ` · ${item.phone}` : ''}`,
    }));
  } catch (err) {
    notify.error(err.message || '加载教师失败');
  }
}

function syncCreateMonth() {
  if (createForm.value?.expenseDate) createForm.value.month = createForm.value.expenseDate.slice(0, 7);
}

function closeCreate() {
  if (creating.value) return;
  createForm.value = null;
}

function onPickFiles(event, form) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  return uploadFiles(files, form);
}

function onPaste(event) {
  const form = deduction.value || createForm.value;
  if (!form) return;
  const files = [...(event.clipboardData?.files || [])]
    .filter((file) => /^image\/(jpeg|png|webp)$/.test(file.type) || file.type === 'application/pdf');
  if (!files.length) return;
  event.preventDefault();
  if (uploading.value) {
    notify.warn('正在上传，请稍后再粘贴');
    return;
  }
  uploadFiles(files, form);
}

onMounted(() => window.addEventListener('paste', onPaste));
onBeforeUnmount(() => window.removeEventListener('paste', onPaste));

async function uploadFiles(files, form) {
  if (!files.length || !form) return;
  const room = 9 - form.attachments.length;
  if (room <= 0) {
    notify.warn('最多 9 张凭证');
    return;
  }
  if (files.length > room) notify.warn(`最多 9 张，只上传前 ${room} 个`);
  uploading.value = true;
  try {
    for (const file of files.slice(0, room)) {
      const { url } = await api.uploadReimbursementReceipt(file);
      form.attachments.push(url);
    }
  } catch (err) {
    notify.error(err.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}

async function saveCreate() {
  const form = createForm.value;
  if (!form) return;
  if (!form.userId) {
    createError.value = '请选择教师';
    return;
  }
  creating.value = true;
  createError.value = '';
  try {
    await api.createReimbursement({
      ...form,
      userId: Number(form.userId),
      amount: Number(form.amount),
      splitCollectionId: form.splitCollectionId ? Number(form.splitCollectionId) : null,
    });
    notify.success('报销单已录入');
    createForm.value = null;
    tab.value = form.status === 'pending' ? 'pending' : form.status;
    if (form.splitCollectionId && form.status !== 'pending') notifyFinanceChanged('reimbursement');
    await load();
  } catch (err) {
    createError.value = err.message || '保存失败';
  } finally {
    creating.value = false;
  }
}

const list = ref([]);
const tab = ref('pending');
const notice = ref('');
const viewing = ref(null);
const rejecting = ref(null);
const reason = ref('票据不清晰或不符');
const { loading, ready, error, run, bindLoad } = usePageLoad();

const pendingCount = computed(() => list.value.filter((item) => item.status === 'pending').length);
const collections = ref([]);
const month = useFinanceMonth(() => load(), { allowAll: true, defaultAll: true });
const deductSummary = computed(() => {
  const groups = new Map();
  let unlinked = 0;
  for (const item of list.value) {
    if (!['approved', 'reimbursed'].includes(item.status)) continue;
    const amount = Number(item.amount) || 0;
    if (!item.collectionName) {
      unlinked += amount;
      continue;
    }
    groups.set(item.collectionName, (groups.get(item.collectionName) || 0) + amount);
  }
  const list2 = [...groups.entries()].map(([name, amount]) => ({ name, amount }));
  return { groups: list2, unlinked, total: list2.length + (unlinked ? 1 : 0) };
});
const deduction = ref(null);
const deductionSaving = ref(false);
const deductionError = ref('');

function openDeduction(item, mode) {
  deductionError.value = '';
  deduction.value = {
    item,
    mode,
    month: item.month || String(item.expenseDate || '').slice(0, 7),
    splitCollectionId: item.splitCollectionId ? String(item.splitCollectionId) : '',
    amount: Number(item.amount),
    attachments: [...(item.attachments || [])],
  };
}

function closeDeduction() {
  if (deductionSaving.value || uploading.value) return;
  deduction.value = null;
}

async function saveDeduction() {
  const form = deduction.value;
  if (!form) return;
  const body = { month: form.month, splitCollectionId: form.splitCollectionId ? Number(form.splitCollectionId) : null };
  const attachmentsChanged = form.attachments.join('\n') !== (form.item.attachments || []).join('\n');
  const amount = Number(form.amount);
  const amountChanged = form.item.status !== 'reimbursed' && amount !== Number(form.item.amount);
  if (amountChanged && !(amount > 0)) {
    deductionError.value = '请填写有效金额';
    return;
  }
  deductionSaving.value = true;
  deductionError.value = '';
  try {
    if (form.mode === 'approve') {
      if (attachmentsChanged || amountChanged) {
        await api.updateReimbursementDeduction(form.item.id, {
          ...(attachmentsChanged ? { attachments: form.attachments } : {}),
          ...(amountChanged ? { amount } : {}),
        });
      }
      await api.reviewReimbursement(form.item.id, { action: 'approve', ...body });
      notice.value = '已通过，可进行报销打款';
    } else {
      await api.updateReimbursementDeduction(form.item.id, {
        ...body,
        attachments: form.attachments,
        ...(amountChanged ? { amount } : {}),
      });
      notify.success('报销单已更新');
    }
    deduction.value = null;
    notifyFinanceChanged('reimbursement');
    await load();
  } catch (err) {
    deductionError.value = err.message || '保存失败';
  } finally {
    deductionSaving.value = false;
  }
}

function setTab(value) {
  tab.value = value;
  load();
}

function statusTone(status) {
  return ({ pending: 'amber', approved: 'green', rejected: 'red', reimbursed: '' })[status] || '';
}

function asset(url) {
  return protectedAssetUrl(url);
}

function bankLine(item) {
  const cert = item?.user?.teacherCert;
  if (!cert?.bankAccount) return '';
  const name = cert.bankAccountName || '';
  const bank = cert.bankName || '';
  return [bank, name, cert.bankAccount].filter(Boolean).join(' · ');
}

function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

function openReject(item) {
  rejecting.value = item;
  reason.value = '票据不清晰或不符';
}

async function load() {
  await run(async () => {
    const [rows, cols] = await Promise.all([
      api.reimbursements({ ...(tab.value ? { status: tab.value } : {}), ...(month.value ? { month: month.value } : {}) }),
      api.reimbursementCollections().catch(() => collections.value),
    ]);
    list.value = rows;
    collections.value = Array.isArray(cols) ? cols : [];
  });
}

async function review(item, action) {
  if (action === 'reject' && !reason.value.trim()) return;
  try {
    await api.reviewReimbursement(item.id, { action, reason: reason.value });
    if (action === 'approve') notifyFinanceChanged('reimbursement');
    rejecting.value = null;
    notice.value = action === 'approve' ? '已通过，可进行报销打款' : '已驳回';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

async function pay(item) {
  const name = item.user?.teacherCert?.realName || item.user?.nickname || '教师';
  const ok = await notify.confirm({
    title: '确认打款',
    message: `确认已单独向「${name}」打款 ¥${Number(item.amount).toFixed(2)}？标记后这笔报销不再并入「财务打款」${item.month || ''} 的合并打款，请勿重复转账。`,
    okText: '已打款',
    icon: 'check',
  });
  if (!ok) return;
  try {
    await api.markReimbursementPaid(item.id);
    notify.success('已标记为已报销');
    notifyFinanceChanged('reimbursement');
    await load();
  } catch (err) {
    notify.error(err.message || '操作失败');
  }
}

bindLoad(load);
</script>

<style scoped>
.filter-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.filter-bar .tabs { margin-bottom: 0; }
.month-select { width: auto; min-width: 150px; }
.deduct-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: -4px 0 14px; font-size: 13px; color: #475467; }
.deduct-summary small { color: #98a2b3; }
.deduct-chip { padding: 3px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; }
.deduct-chip.muted-chip { background: #f2f4f7; color: #475467; }
.muted.inline { display: inline; margin-left: 4px; }
.deduct-head { margin: 0 0 4px; color: #344054; }
.deduct-head b { margin-left: 6px; color: #0f172a; }
.hint { margin: 0; color: #667085; font-size: 12px; line-height: 1.6; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.tabs button {
  border: 1px solid var(--line, #e5e7eb);
  background: #fff;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
}
.tabs button.on { border-color: var(--brand, #2563eb); color: var(--brand, #2563eb); background: #eff6ff; }
.ok-tip { color: #15803d; margin-bottom: 10px; }
.muted { color: #98a2b3; font-size: 12px; margin-top: 2px; }
.page-head .actions { margin-top: 0; }
.voucher { display: grid; gap: 12px; padding-bottom: 12px; }
.voucher-desc { margin: 0; color: #344054; font-size: 14px; line-height: 1.6; }
.bank { margin: 0; padding: 10px 12px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #344054; }
.voucher-files { display: grid; gap: 12px; }
.voucher-file {
  display: grid;
  place-items: center;
  min-height: 160px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  background: #f8fafc;
  color: #2563eb;
  text-decoration: none;
}
.voucher-file img { display: block; width: 100%; max-height: min(62vh, 560px); object-fit: contain; background: #f8fafc; }
.voucher-file span { padding: 28px 16px; }
.upload-box { display: grid; gap: 10px; padding: 12px; border: 1px dashed var(--line, #e5e7eb); border-radius: 10px; font-size: 13px; color: #475467; }
.upload-box .btn.disabled { opacity: 0.5; pointer-events: none; }
.paste-tip { margin-left: 8px; color: #98a2b3; font-size: 12px; }
.files.small { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 10px; }
.file-item { position: relative; display: grid; place-items: center; height: 88px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; color: #2563eb; }
.file-item img { width: 100%; height: 100%; object-fit: cover; }
.file-item > a { display: grid; place-items: center; width: 100%; height: 100%; color: inherit; text-decoration: none; }
.file-item .remove {
  position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; border-radius: 50%;
  background: rgba(15, 23, 42, 0.6); color: #fff; border: 0; cursor: pointer; padding: 0; line-height: 1;
}
textarea {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  resize: vertical;
}
</style>
