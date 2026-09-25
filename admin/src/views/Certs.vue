<template>
  <section>
    <div class="page-head">
      <div>
        <h1>教师认证</h1>
        <p>实名材料、无犯罪证明与每学期合同审核。合同按学期生效，历史签名全部保留。</p>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="ok-tip">{{ notice }}</p>

    <div class="tabs">
      <button type="button" :class="{ on: tab === 'certs' }" @click="tab = 'certs'">认证材料</button>
      <button type="button" :class="{ on: tab === 'contracts' }" @click="tab = 'contracts'">
        合同审核
        <span v-if="pendingContracts.length" class="tag amber">{{ pendingContracts.length }}</span>
      </button>
    </div>

    <article v-if="tab === 'certs'" class="card">
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

    <article v-else class="card">
      <p class="card-pad muted">每学期需重新签订；通过后预分配课程自动解锁。驳回后教师可重签，历史记录不删除。</p>
      <table>
        <thead><tr><th>教师</th><th>学期</th><th>状态</th><th>签署时间</th><th>课程附件</th><th></th></tr></thead>
        <tbody>
          <tr v-for="item in contracts" :key="item.id">
            <td>{{ item.user?.teacherCert?.realName || item.user?.nickname || '—' }}</td>
            <td>{{ item.semester?.name || '—' }}</td>
            <td>{{ contractStatusText(item.status) }}</td>
            <td>{{ formatTime(item.signedAt) }}</td>
            <td class="muted">{{ item.courseAnnex || '无' }}</td>
            <td>
              <div class="row-actions">
                <button class="link" type="button" @click="contractView = item">预览</button>
                <template v-if="item.status === 'pending'">
                  <button class="link" type="button" @click="reviewContract(item, 'approve')">通过</button>
                  <button class="link" type="button" @click="reviewContract(item, 'reject')">驳回</button>
                </template>
                <button
                  v-if="item.status === 'approved' || item.status === 'pending'"
                  class="link"
                  type="button"
                  @click="revokeContract(item)"
                >撤销重签</button>
              </div>
            </td>
          </tr>
          <tr v-if="!contracts.length"><td colspan="6" class="empty">还没有合同记录</td></tr>
        </tbody>
      </table>
    </article>

    <div v-if="viewing" class="modal-mask" @click.self="viewing = null">
      <div class="modal" role="dialog">
        <header>
          <h3>{{ viewing.realName }}的材料</h3>
          <button class="modal-close" type="button" @click="viewing = null">×</button>
        </header>
        <div class="form files">
          <p class="muted">教师资格证不是必填。无犯罪证明按当前学期审核，{{ viewing.semesterName || '未设置学期时不强制更新' }}。</p>
          <div class="file-grid">
            <button v-for="file in filesOf(viewing)" :key="file.label" type="button" class="file-card" @click="previewFile = file">
              <strong>{{ file.label }}</strong>
              <img v-if="file.url && !file.pdf" :src="file.url" alt="" />
              <span v-else-if="file.url" class="muted">PDF 文件 · 点击预览</span>
              <span v-else class="muted">未上传</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="previewFile" class="modal-mask" @click.self="previewFile = null">
      <div class="modal" role="dialog">
        <header>
          <h3>{{ previewFile.label }}</h3>
          <button class="modal-close" type="button" @click="previewFile = null">×</button>
        </header>
        <div class="form files">
          <a v-if="previewFile.url" :href="previewFile.url" target="_blank" rel="noreferrer">新窗口打开</a>
          <img v-if="previewFile.url && !previewFile.pdf" :src="previewFile.url" alt="" />
        </div>
      </div>
    </div>

    <div v-if="contractView" class="modal-mask" @click.self="contractView = null">
      <div class="modal" role="dialog">
        <header>
          <h3>{{ contractView.title }}</h3>
          <button class="modal-close" type="button" @click="contractView = null">×</button>
        </header>
        <div class="form">
          <pre class="contract-body">{{ contractView.body }}</pre>
          <div v-if="contractView.courseAnnex" class="muted">附件课程：{{ contractView.courseAnnex }}</div>
          <div v-if="contractView.rejectReason" class="muted">备注：{{ contractView.rejectReason }}</div>
          <img v-if="contractView.signPath" class="sign-preview" :src="protectedAssetUrl(contractView.signPath)" alt="签名" />
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
import { computed, onMounted, ref } from 'vue';
import { api, protectedAssetUrl } from '../api';

const list = ref([]);
const contracts = ref([]);
const error = ref('');
const notice = ref('');
const rejecting = ref(null);
const reason = ref('资料不完整');
const viewing = ref(null);
const previewFile = ref(null);
const contractView = ref(null);
const tab = ref('certs');
const certMap = { pending: '审核中', approved: '已认证', rejected: '已驳回', frozen: '冻结' };

const pendingContracts = computed(() => contracts.value.filter((item) => item.status === 'pending'));

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
  if (item.contractPending) return '合同待审核';
  if (item.contractValid) return `合同有效（${item.semesterName || '本学期'}），学期结束需重签`;
  if (item.contractDue) return '需重签本学期合同（可后台撤销强制重签）';
  return '待签合同';
}
function contractStatusText(status) {
  return ({ pending: '待审核', approved: '已生效', rejected: '已驳回', superseded: '已归档', revoked: '已撤销' })[status] || status;
}
function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
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
  return rows.map(([label, url]) => ({
    label,
    url: protectedAssetUrl(url),
    pdf: /\.pdf$/i.test(url || ''),
  }));
}
function openReject(item) { rejecting.value = item; reason.value = '资料不完整'; }
async function load() {
  try {
    const [certs, rows] = await Promise.all([api.certs(), api.contracts()]);
    list.value = certs;
    contracts.value = rows;
    if (pendingContracts.value.length) tab.value = tab.value || 'contracts';
  } catch (err) {
    error.value = err.message;
  }
}
async function review(item, action) {
  if (action === 'reject' && !reason.value.trim()) return;
  try {
    await api.reviewCert(item.userId, { action, reason: reason.value });
    rejecting.value = null;
    reason.value = '资料不完整';
    notice.value = '已处理';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
async function reviewContract(item, action) {
  const rejectReason = action === 'reject' ? window.prompt('请填写驳回原因') : '';
  if (action === 'reject' && !rejectReason) return;
  try {
    await api.reviewContract(item.id, { action, reason: rejectReason });
    notice.value = action === 'approve' ? '合同已通过，预分配课程已解锁' : '合同已驳回';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
async function revokeContract(item) {
  const reason = window.prompt('撤销原因（将提示给教师）', '请重新签订本学期合同');
  if (reason === null) return;
  if (!window.confirm('确定撤销该合同？历史保留，教师需重新签字审核，课程将重新锁定。')) return;
  try {
    await api.revokeContract(item.id, { reason });
    notice.value = '合同已撤销，教师需重新签字';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
onMounted(load);
</script>

<style scoped>
.files { padding: 16px 20px 24px; overflow: auto; }
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.file-card {
  border: 1px solid #e7edf5;
  border-radius: 12px;
  padding: 10px;
  background: #fff;
  text-align: left;
}
.file-card img {
  display: block;
  width: 100%;
  height: 110px;
  object-fit: cover;
  margin-top: 8px;
  border-radius: 8px;
  background: #f8fafc;
}
.contract-body {
  white-space: pre-wrap;
  font-family: inherit;
  line-height: 1.7;
  max-height: 360px;
  overflow: auto;
  background: #f8fafc;
  padding: 12px;
  border-radius: 8px;
}
.sign-preview {
  margin-top: 12px;
  max-width: 240px;
  border: 1px solid #e7edf5;
  background: #fff;
}
</style>
