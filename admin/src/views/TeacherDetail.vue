<template>
  <section v-if="detail">
    <div class="page-head">
      <div>
        <p class="crumb">师资管理 / 教师资料</p>
        <h1>
          {{ detail.realName || detail.nickname }}
          <span v-if="detail.certStatus === 'approved'" class="tag green">认证教师</span>
          <span v-if="detail.contractValid" class="tag green">合同有效</span>
          <span v-else-if="detail.contractPending" class="tag amber">合同待审</span>
          <span v-else-if="detail.contractDue" class="tag amber">需重签合同</span>
        </h1>
        <p>{{ detail.phone || '未留手机号' }} · {{ detail.organization?.name || '未绑定机构' }} · {{ detail.semesterName || '未设学期' }}</p>
      </div>
      <div class="actions">
        <router-link class="btn" to="/faculty">返回列表</router-link>
        <button
          v-if="detail.contractValid || detail.contractPending"
          class="btn"
          type="button"
          @click="revokeCurrent"
        >撤销合同并要求重签</button>
        <button class="btn" type="button" @click="freeze">{{ detail.status === 1 ? '冻结账号' : '解除冻结' }}</button>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="ok-tip">{{ notice }}</p>

    <div class="tabs">
      <button v-for="item in tabs" :key="item" type="button" :class="{ on: tab === item }" @click="tab = item">{{ item }}</button>
    </div>

    <article v-if="tab === '基本资料'" class="card card-pad teacher-grid">
      <div><small>姓名</small><strong>{{ detail.realName || '—' }}</strong></div>
      <div><small>性别</small><strong>{{ detail.gender || '—' }}</strong></div>
      <div><small>手机</small><strong>{{ detail.phone || '—' }}</strong></div>
      <div><small>编号</small><strong>{{ detail.teacherNo || '—' }}</strong></div>
      <div class="span2"><small>擅长</small><strong>{{ detail.skills || '—' }}</strong></div>
      <div class="span2"><small>简介</small><strong>{{ detail.bio || '—' }}</strong></div>
    </article>

    <article v-if="tab === '认证资料'" class="card card-pad">
      <p class="muted">点击缩略图可放大预览。教师资格证非必填。身份证号与住址会自动写入劳务合同。</p>
      <div class="meta-grid" v-if="detail.idNumber || detail.address || detail.bankAccount">
        <div><small>身份证号</small><strong>{{ detail.idNumber || '—' }}</strong></div>
        <div><small>住址</small><strong>{{ detail.address || '—' }}</strong></div>
        <div><small>邮箱</small><strong>{{ detail.email || '—' }}</strong></div>
        <div><small>开户行</small><strong>{{ detail.bankName || '—' }}</strong></div>
        <div><small>账户名</small><strong>{{ detail.bankAccountName || '—' }}</strong></div>
        <div><small>账号</small><strong>{{ detail.bankAccount || '—' }}</strong></div>
      </div>
      <div class="file-grid">
        <button v-for="file in certFiles" :key="file.label" type="button" class="file-card" @click="preview = file">
          <strong>{{ file.label }}</strong>
          <img v-if="file.url && !file.pdf" :src="file.url" alt="" />
          <span v-else-if="file.url" class="muted">PDF 文件</span>
          <span v-else class="muted">未上传</span>
        </button>
      </div>
    </article>

    <article v-if="tab === '所属机构'" class="card card-pad">
      <div class="field-row">
        <label class="field pick grow">
          <span>所属机构</span>
          <select v-model="orgId">
            <option value="">不绑定</option>
            <option v-for="item in detail.orgs" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
          </select>
        </label>
        <button class="btn primary" type="button" @click="saveOrg">保存</button>
      </div>
    </article>

    <article v-if="tab === '上级关系'" class="card card-pad">
      <div class="field-row">
        <label class="field pick grow">
          <span>上级教师</span>
          <select v-model="parentId">
            <option value="">无上级</option>
            <option v-for="item in detail.teachers" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
          </select>
        </label>
        <button class="btn primary" type="button" @click="saveParent">保存</button>
      </div>
    </article>

    <article v-if="tab === '课程授权'" class="card card-pad">
      <p class="muted">预分配给未签本学期合同的老师时，课程会锁定；合同审核通过后自动解锁。</p>
      <table>
        <thead><tr><th>课程</th><th>状态</th><th>课时费</th><th>机构分佣</th><th>教师实得</th></tr></thead>
        <tbody>
          <tr v-for="item in detail.grants" :key="item.id">
            <td>{{ item.title }}</td>
            <td>
              <span v-if="item.locked" class="tag amber">未解锁</span>
              <span v-else class="tag green">已解锁</span>
            </td>
            <td>{{ moneyOf(item.quote.baseFee) }}</td>
            <td>{{ moneyOf(item.quote.commission) }}</td>
            <td>{{ moneyOf(item.quote.teacherFee) }}</td>
          </tr>
          <tr v-if="!detail.grants.length"><td colspan="5" class="empty">还没有授权课程。到「教师分配」里配置。</td></tr>
        </tbody>
      </table>
      <router-link class="btn" to="/assign">去分配课程</router-link>
    </article>

    <article v-if="tab === '合同记录'" class="card card-pad">
      <p class="muted">历史已签合同全部保留，不会覆盖删除，便于责任追溯。合同按学期生效；也可手动撤销，要求教师重签并重新审核。</p>
      <table>
        <thead><tr><th>学期</th><th>状态</th><th>签署时间</th><th>课程附件</th><th class="col-actions">操作</th></tr></thead>
        <tbody>
          <tr v-for="item in detail.contracts || []" :key="item.id">
            <td>{{ item.semester?.name || item.semesterId || '—' }}</td>
            <td>{{ contractStatusText(item.status) }}</td>
            <td>{{ formatTime(item.signedAt) }}</td>
            <td class="muted">{{ item.courseAnnex || '无' }}</td>
            <td class="col-actions">
              <div class="row-actions">
                <ActionBtn v-if="item.status === 'pending'" icon="check" tip="通过" tone="plan" @click="reviewContract(item, 'approve')" />
                <ActionBtn v-if="item.status === 'pending'" icon="x" tip="驳回" tone="danger" @click="reviewContract(item, 'reject')" />
                <ActionBtn
                  v-if="item.status === 'approved' || item.status === 'pending'"
                  icon="refresh"
                  tip="撤销重签"
                  tone="wait"
                  @click="revokeOne(item)"
                />
                <ActionBtn icon="eye" tip="预览" @click="openContract(item)" />
              </div>
            </td>
          </tr>
          <tr v-if="!(detail.contracts || []).length"><td colspan="5" class="empty">还没有合同记录</td></tr>
        </tbody>
      </table>
    </article>

    <article v-if="tab === '收入记录'" class="card">
      <table>
        <thead><tr><th>课程</th><th>日期</th><th>课程费用</th><th>机构分佣</th><th>教师实得</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="item in detail.incomes" :key="item.id">
            <td>{{ item.course.title }}</td>
            <td>{{ item.date }}</td>
            <td>{{ moneyOf(item.baseFee) }}</td>
            <td>{{ moneyOf(item.commission) }}</td>
            <td>{{ moneyOf(item.teacherFee) }}</td>
            <td>{{ item.status === 'unconfigured' ? '未配置费用' : '待结算' }}</td>
          </tr>
          <tr v-if="!detail.incomes.length"><td colspan="6" class="empty">还没有上课结算记录</td></tr>
        </tbody>
      </table>
    </article>

    <div v-if="preview" class="modal-mask" @click.self="preview = null">
      <div class="modal" role="dialog">
        <header>
          <h3>{{ preview.label }}</h3>
          <button class="modal-close" type="button" @click="preview = null">×</button>
        </header>
        <div class="form files">
          <a v-if="preview.url" :href="preview.url" target="_blank" rel="noreferrer">新窗口打开</a>
          <img v-if="preview.url && !preview.pdf" :src="preview.url" alt="" />
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
          <img v-if="contractView.signPath" class="sign-preview" :src="asset(contractView.signPath)" alt="签名" />
        </div>
      </div>
    </div>
  </section>
  <div v-else class="empty">{{ error || '加载中…' }}</div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, protectedAssetUrl } from '../api';
import ActionBtn from '../components/ActionBtn.vue';

const route = useRoute();
const detail = ref(null);
const error = ref('');
const notice = ref('');
const tab = ref('基本资料');
const tabs = ['基本资料', '认证资料', '合同记录', '所属机构', '上级关系', '课程授权', '收入记录'];
const orgId = ref('');
const parentId = ref('');
const preview = ref(null);
const contractView = ref(null);

const certFiles = computed(() => {
  const d = detail.value || {};
  return [
    { label: '身份证人像面', url: asset(d.idCard), pdf: /\.pdf$/i.test(d.idCard || '') },
    { label: '身份证国徽面', url: asset(d.idCardBack), pdf: /\.pdf$/i.test(d.idCardBack || '') },
    { label: '学历证明', url: asset(d.diploma), pdf: /\.pdf$/i.test(d.diploma || '') },
    { label: '无犯罪证明', url: asset(d.clearance), pdf: /\.pdf$/i.test(d.clearance || '') },
    { label: '教师资格证', url: asset(d.certificate), pdf: /\.pdf$/i.test(d.certificate || '') },
    { label: '最新签名', url: asset(d.contractSign), pdf: false },
  ];
});

function asset(path) {
  return path ? protectedAssetUrl(path) : '';
}
function moneyOf(value) {
  return value == null ? '未配置' : `¥${Number(value).toFixed(2)}`;
}
function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}
function contractStatusText(status) {
  return ({
    pending: '待审核',
    approved: '已生效',
    rejected: '已驳回',
    superseded: '已归档',
    revoked: '已撤销',
  })[status] || status;
}
async function load() {
  error.value = '';
  try {
    detail.value = await api.facultyDetail(route.params.id);
    orgId.value = detail.value.organization ? String(detail.value.organization.id) : '';
    parentId.value = detail.value.parent ? String(detail.value.parent.id) : '';
  } catch (err) {
    error.value = err.message;
  }
}
async function saveOrg() {
  try {
    detail.value = await api.setFacultyOrg(detail.value.id, orgId.value ? Number(orgId.value) : null);
    notice.value = '机构已保存';
  } catch (err) {
    error.value = err.message;
  }
}
async function saveParent() {
  try {
    await api.setFacultyParent(detail.value.id, parentId.value ? Number(parentId.value) : null);
    await load();
    notice.value = '上级已保存';
  } catch (err) {
    error.value = err.message;
  }
}
async function freeze() {
  try {
    await api.freezeFaculty(detail.value.id, detail.value.status === 1);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
async function reviewContract(item, action) {
  const reason = action === 'reject' ? window.prompt('请填写驳回原因') : '';
  if (action === 'reject' && !reason) return;
  try {
    await api.reviewContract(item.id, { action, reason });
    notice.value = action === 'approve' ? '合同已通过，课程已解锁' : '合同已驳回';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
async function revokeOne(item) {
  const reason = window.prompt('撤销原因（将提示给教师）', '请重新签订本学期合同');
  if (reason === null) return;
  if (!window.confirm('确定撤销该合同？历史记录会保留，教师需重新签字并审核，课程将重新锁定。')) return;
  try {
    await api.revokeContract(item.id, { reason });
    notice.value = '合同已撤销，教师需重新签字';
    tab.value = '合同记录';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
async function revokeCurrent() {
  const reason = window.prompt('撤销原因（将提示给教师）', '请重新签订本学期合同');
  if (reason === null) return;
  if (!window.confirm('确定撤销当前合同并要求教师重签？历史保留，课程将重新锁定。')) return;
  try {
    await api.revokeFacultyContract(detail.value.id, { reason });
    notice.value = '合同已撤销，教师需重新签字';
    tab.value = '合同记录';
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
function openContract(item) {
  contractView.value = item;
}
onMounted(load);
</script>

<style scoped>
.teacher-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
}
.teacher-grid .span2 { grid-column: 1 / -1; }
.teacher-grid small { display: block; color: #667085; margin-bottom: 4px; }
.field-row { display: flex; gap: 12px; align-items: end; }
.field-row .grow { flex: 1; }
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0;
}
.meta-grid > div {
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
}
.meta-grid small { display: block; color: #98a2b3; font-size: 12px; }
.meta-grid strong { display: block; margin-top: 4px; font-size: 13px; word-break: break-all; }
@media (max-width: 860px) {
  .meta-grid { grid-template-columns: 1fr; }
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
  height: 120px;
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
