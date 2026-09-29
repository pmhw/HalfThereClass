<template>
  <section>
    <div class="page-head">
      <div>
        <h1>报销单</h1>
        <p>教师提交票据后需管理员审核；仅审核通过后可标记报销打款。</p>
      </div>
    </div>
    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="8" @retry="load">
      <p v-if="notice" class="ok-tip">{{ notice }}</p>
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

      <article class="card">
        <table>
          <thead>
            <tr>
              <th>教师</th>
              <th>事由</th>
              <th>类别</th>
              <th>金额</th>
              <th>发生日</th>
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
              <td>{{ item.expenseDate }}</td>
              <td>
                <span :class="['tag', statusTone(item.status)]">{{ item.statusLabel }}</span>
                <div v-if="item.rejectReason" class="muted">{{ item.rejectReason }}</div>
              </td>
              <td>
                <ActionBtn icon="image" tip="查看凭证" @click="viewing = item" />
              </td>
              <td class="col-actions">
                <div class="row-actions">
                  <template v-if="item.status === 'pending'">
                    <ActionBtn icon="check" tip="通过" tone="plan" @click="review(item, 'approve')" />
                    <ActionBtn icon="x" tip="驳回" tone="danger" @click="openReject(item)" />
                  </template>
                  <template v-else-if="item.status === 'approved'">
                    <ActionBtn icon="check" tip="确认已报销" tone="plan" @click="pay(item)" />
                  </template>
                  <span v-else class="muted">{{ item.status === 'reimbursed' ? formatTime(item.reimbursedAt) : '—' }}</span>
                </div>
              </td>
            </tr>
            <tr v-if="!list.length"><td colspan="8" class="empty">暂无报销单</td></tr>
          </tbody>
        </table>
      </article>
    </PageLoad>

    <div v-if="viewing" class="modal" @click.self="viewing = null">
      <div class="panel">
        <header>
          <strong>{{ viewing.title }} · ¥{{ Number(viewing.amount).toFixed(2) }}</strong>
          <button type="button" class="icon-btn" @click="viewing = null">×</button>
        </header>
        <p class="muted">{{ viewing.categoryLabel }} · {{ viewing.expenseDate }}</p>
        <p v-if="viewing.description">{{ viewing.description }}</p>
        <div v-if="bankLine(viewing)" class="bank">收款账户：{{ bankLine(viewing) }}</div>
        <div class="files">
          <a
            v-for="(url, i) in (viewing.attachments || [])"
            :key="i"
            :href="asset(url)"
            target="_blank"
            rel="noopener"
          >
            <img v-if="!/\.pdf$/i.test(url)" :src="asset(url)" alt="" />
            <span v-else>PDF 凭证 {{ i + 1 }}</span>
          </a>
        </div>
      </div>
    </div>

    <div v-if="rejecting" class="modal" @click.self="rejecting = null">
      <div class="panel narrow">
        <header>
          <strong>驳回报销单</strong>
          <button type="button" class="icon-btn" @click="rejecting = null">×</button>
        </header>
        <textarea v-model="reason" rows="3" placeholder="请填写驳回原因" />
        <div class="actions">
          <button type="button" class="btn" @click="rejecting = null">取消</button>
          <button type="button" class="btn btn-danger" @click="review(rejecting, 'reject')">确认驳回</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api, protectedAssetUrl } from '../api';
import ActionBtn from '../components/ActionBtn.vue';
import PageLoad from '../components/PageLoad.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { notify } from '../notify';

const list = ref([]);
const tab = ref('pending');
const notice = ref('');
const viewing = ref(null);
const rejecting = ref(null);
const reason = ref('票据不清晰或不符');
const { loading, ready, error, run } = usePageLoad();

const pendingCount = computed(() => list.value.filter((item) => item.status === 'pending').length);

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
    list.value = await api.reimbursements(tab.value ? { status: tab.value } : {});
  });
}

async function review(item, action) {
  if (action === 'reject' && !reason.value.trim()) return;
  try {
    await api.reviewReimbursement(item.id, { action, reason: reason.value });
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
    message: `确认已向「${name}」打款 ¥${Number(item.amount).toFixed(2)}？`,
    okText: '已打款',
    icon: 'check',
  });
  if (!ok) return;
  try {
    await api.markReimbursementPaid(item.id);
    notify.success('已标记为已报销');
    await load();
  } catch (err) {
    notify.error(err.message || '操作失败');
  }
}

onMounted(load);
</script>

<style scoped>
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
.modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 80;
  padding: 24px;
}
.panel {
  width: min(720px, 100%);
  background: #fff;
  border-radius: 14px;
  padding: 18px 20px;
  max-height: 86vh;
  overflow: auto;
}
.panel.narrow { width: min(420px, 100%); }
.panel header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.bank { margin: 10px 0; padding: 10px 12px; background: #f8fafc; border-radius: 8px; font-size: 13px; }
.files { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
.files a {
  display: grid;
  place-items: center;
  min-height: 120px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  color: #2563eb;
  text-decoration: none;
}
.files img { width: 100%; height: 140px; object-fit: cover; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
textarea {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  resize: vertical;
}
</style>
