<template>
  <section>
    <div class="page-head"><div><h1>教师认证</h1><p>微信用户提交后在这里审核。通过后才是认证教师。</p></div></div>
    <p v-if="error" class="error">{{ error }}</p>
    <article class="card">
      <table>
        <thead><tr><th>姓名</th><th>微信</th><th>手机号</th><th>状态</th><th>材料</th><th></th></tr></thead>
        <tbody>
          <tr v-for="item in list" :key="item.id">
            <td>{{ item.realName }}</td>
            <td>{{ item.user?.nickname || '—' }}</td>
            <td>{{ item.user?.phone || '—' }}</td>
            <td>
              <span :class="['tag', item.status === 'approved' ? 'green' : item.status === 'pending' ? 'amber' : item.status === 'rejected' ? 'red' : '']">{{ certText(item) }}</span>
              <div class="muted">{{ clearanceText(item) }}</div>
              <div class="muted">{{ contractText(item) }}</div>
            </td>
            <td>
              <button class="link" type="button" @click="viewing = item">查看材料</button>
            </td>
            <td>
              <div class="row-actions">
                <router-link class="link" :to="`/faculty/${item.userId}`">资料</router-link>
                <template v-if="item.status === 'pending'">
                  <button class="link" @click="review(item, 'approve')">通过</button>
                  <button class="link" @click="openReject(item)">驳回</button>
                </template>
                <template v-else-if="item.clearanceStatus === 'pending'">
                  <button class="link" @click="review(item, 'approveClearance')">通过无犯罪证明</button>
                  <button class="link" @click="openReject(item)">驳回</button>
                </template>
                <span v-else>{{ item.rejectReason || '—' }}</span>
              </div>
            </td>
          </tr>
          <tr v-if="!list.length"><td colspan="6" class="empty">没有认证申请</td></tr>
        </tbody>
      </table>
    </article>

    <div v-if="viewing" class="modal-mask">
      <div class="modal" role="dialog">
        <header>
          <h3>{{ viewing.realName }}的材料</h3>
          <button class="modal-close" type="button" @click="viewing = null">×</button>
        </header>
        <div class="form files">
          <p class="muted">教师资格证不是必填。无犯罪证明按当前学期审核，{{ viewing.semesterName || '未设置学期时不强制更新' }}。</p>
          <div v-for="file in filesOf(viewing)" :key="file.label" class="file-row">
            <strong>{{ file.label }}</strong>
            <a v-if="file.url" :href="file.url" target="_blank" rel="noreferrer">{{ file.pdf ? '打开 PDF' : '查看' }}</a>
            <span v-else class="muted">未上传</span>
            <img v-if="file.url && !file.pdf" :src="file.url" alt="" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="rejecting" class="modal-mask">
      <div class="modal narrow" role="dialog">
        <header>
          <h3>驳回认证</h3>
          <button class="modal-close" type="button" @click="rejecting = null">×</button>
        </header>
        <form class="form" @submit.prevent="review(rejecting, 'reject')">
          <label>驳回原因<textarea v-model="reason" required placeholder="请填写驳回原因"></textarea></label>
          <div class="form-actions">
            <button class="btn primary" type="submit">确认驳回</button>
            <button class="btn" type="button" @click="rejecting = null">取消</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';

const list = ref([]);
const error = ref('');
const rejecting = ref(null);
const reason = ref('资料不完整');
const viewing = ref(null);
const certMap = { pending: '审核中', approved: '已认证', rejected: '已驳回', frozen: '冻结' };
function certText(item) {
  if (item.status === 'approved' && item.clearanceStatus === 'pending') return '证明待审';
  return certMap[item.status] || item.status;
}
function clearanceText(item) {
  if (item.clearanceStatus === 'pending') return '无犯罪证明审核中';
  if (item.clearanceDue) return '本学期待更新';
  if (item.status === 'approved') return '本学期已更新';
  return '随认证一起审';
}
function contractText(item) {
  if (item.status !== 'approved') return '认证通过后签订合同';
  return item.contractStatus === 'signed' ? '合同已签订' : '待签合同，暂不能排课';
}
function filesOf(item) {
  const rows = [
    ['身份证人像面', item.idCard],
    ['身份证国徽面', item.idCardBack],
    ['学历证明', item.diploma],
    ['教师资格证（选填）', item.certificate],
    ['无犯罪证明', item.clearance],
    ['合同签名', item.contractSign],
  ];
  return rows.map(([label, url]) => ({ label, url, pdf: /\.pdf$/i.test(url || '') }));
}
function openReject(item) { rejecting.value = item; reason.value = '资料不完整'; }
async function load() {
  try { list.value = await api.certs(); } catch (err) { error.value = err.message; }
}
async function review(item, action) {
  if (action === 'reject' && !reason.value.trim()) return;
  try {
    await api.reviewCert(item.userId, { action, reason: reason.value });
    rejecting.value = null;
    reason.value = '资料不完整';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
onMounted(load);
</script>

<style>
.files { padding: 16px 20px 24px; overflow: auto; }
.file-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.file-row img { width: 120px; height: 80px; object-fit: cover; border-radius: 8px; }
</style>
