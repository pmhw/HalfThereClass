<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="goBack(router, '/my')">‹ 返回</button>
      <span>报销单</span>
    </header>

    <p class="tip">提交后需管理员审核通过，方可报销打款。</p>

    <form class="form card" @submit.prevent="submit">
      <label class="field">
        <span>报销事由</span>
        <input v-model="title" maxlength="80" placeholder="例如：教研交通费" required />
      </label>
      <label class="field">
        <span>类别</span>
        <select v-model="category">
          <option v-for="item in categories" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </label>
      <label class="field">
        <span>金额（元）</span>
        <input v-model="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
      </label>
      <label class="field">
        <span>发生日期</span>
        <input v-model="expenseDate" type="date" required />
      </label>
      <label class="field">
        <span>说明</span>
        <textarea v-model="description" rows="2" maxlength="500" placeholder="选填" />
      </label>
      <div class="field">
        <span>票据凭证</span>
        <div class="shots">
          <div v-for="(url, i) in attachments" :key="url" class="shot">
            <img :src="assetUrl(url)" alt="" />
            <button type="button" class="rm" @click="attachments.splice(i, 1)">×</button>
          </div>
          <label v-if="attachments.length < 9" class="add">
            <input type="file" accept="image/*,.pdf" hidden @change="onPick" />
            +
          </label>
        </div>
      </div>
      <button class="btn btn-primary btn-block" type="submit" :disabled="saving">
        {{ saving ? '提交中…' : '提交审核' }}
      </button>
    </form>

    <h2 class="sec">我的报销单</h2>
    <div v-if="!list.length" class="empty">暂无记录</div>
    <article v-for="item in list" :key="item.id" class="card row">
      <div class="main">
        <div class="title">{{ item.title }}</div>
        <div class="meta">{{ item.categoryLabel }} · {{ item.expenseDate }}</div>
        <div class="meta">{{ item.statusLabel }}</div>
        <div v-if="item.rejectReason" class="reject">{{ item.rejectReason }}</div>
      </div>
      <div class="right">
        <div class="fee">¥{{ Number(item.amount).toFixed(2) }}</div>
        <button v-if="item.status === 'pending'" type="button" class="link" @click="cancel(item)">撤销</button>
      </div>
    </article>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  cancelReimbursement,
  createReimbursement,
  getReimbursements,
  uploadReimbursementReceipt,
} from '../api';
import { showToast } from '../api/request';
import { assetUrl } from '../store';
import { goBack, requireLogin } from '../utils/helpers';

const router = useRouter();
const categories = [
  { value: 'transport', label: '交通出行' },
  { value: 'material', label: '教材教具' },
  { value: 'meal', label: '餐饮补贴' },
  { value: 'office', label: '办公耗材' },
  { value: 'other', label: '其他' },
];

const title = ref('');
const category = ref('transport');
const amount = ref('');
const expenseDate = ref('');
const description = ref('');
const attachments = ref([]);
const list = ref([]);
const saving = ref(false);

if (requireLogin(router)) {
  onMounted(load);
}

async function load() {
  try {
    list.value = (await getReimbursements()) || [];
  } catch {
    list.value = [];
  }
}

async function onPick(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = await uploadReimbursementReceipt(file);
    if (data?.url) attachments.value.push(data.url);
  } catch (err) {
    showToast(err.message || '上传失败');
  }
}

async function submit() {
  if (!title.value.trim()) return showToast('请填写报销事由');
  if (!amount.value || Number(amount.value) <= 0) return showToast('请填写金额');
  if (!expenseDate.value) return showToast('请选择日期');
  if (!attachments.value.length) return showToast('请上传票据');
  saving.value = true;
  try {
    await createReimbursement({
      title: title.value.trim(),
      category: category.value,
      amount: Number(amount.value),
      expenseDate: expenseDate.value,
      description: description.value.trim(),
      attachments: attachments.value,
    });
    showToast('已提交，等待审核');
    title.value = '';
    amount.value = '';
    description.value = '';
    attachments.value = [];
    await load();
  } catch (err) {
    showToast(err.message || '提交失败');
  } finally {
    saving.value = false;
  }
}

async function cancel(item) {
  if (!window.confirm('撤销该待审核报销单？')) return;
  try {
    await cancelReimbursement(item.id);
    showToast('已撤销');
    await load();
  } catch (err) {
    showToast(err.message || '撤销失败');
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); }
.nav { display: flex; align-items: center; gap: calc(16 * var(--r)); margin-bottom: calc(16 * var(--r)); font-weight: 650; }
.back { color: #2563eb; }
.tip { color: #667085; font-size: calc(24 * var(--r)); margin-bottom: calc(16 * var(--r)); }
.form { display: flex; flex-direction: column; gap: calc(18 * var(--r)); margin-bottom: calc(28 * var(--r)); }
.field { display: flex; flex-direction: column; gap: calc(8 * var(--r)); }
.field span { color: #667085; font-size: calc(26 * var(--r)); }
.field select,
.field input,
.field textarea {
  width: 100%;
  padding: calc(16 * var(--r));
  border: 1px solid #e7edf5;
  border-radius: calc(12 * var(--r));
  background: #fff;
}
.shots { display: flex; flex-wrap: wrap; gap: calc(12 * var(--r)); }
.shot, .add {
  width: calc(140 * var(--r));
  height: calc(140 * var(--r));
  border-radius: calc(12 * var(--r));
  position: relative;
  overflow: hidden;
}
.shot img { width: 100%; height: 100%; object-fit: cover; }
.rm {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  line-height: 20px;
}
.add {
  display: grid;
  place-items: center;
  border: 1px dashed #cbd5e1;
  color: #94a3b8;
  font-size: calc(48 * var(--r));
  cursor: pointer;
}
.sec { font-size: calc(30 * var(--r)); margin: calc(8 * var(--r)) 0 calc(16 * var(--r)); }
.row {
  display: flex;
  justify-content: space-between;
  gap: calc(16 * var(--r));
  margin-bottom: calc(16 * var(--r));
}
.title { font-weight: 650; }
.meta { margin-top: calc(6 * var(--r)); color: #98a2b3; font-size: calc(24 * var(--r)); }
.reject { margin-top: calc(6 * var(--r)); color: #dc2626; font-size: calc(24 * var(--r)); }
.right { text-align: right; }
.fee { color: #2563eb; font-weight: 700; }
.link { margin-top: calc(8 * var(--r)); color: #dc2626; font-size: calc(24 * var(--r)); }
.empty { text-align: center; color: #98a2b3; padding: calc(40 * var(--r)); }
</style>
