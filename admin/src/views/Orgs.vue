<template>
  <section>
    <div class="page-head">
      <div><h1>机构管理</h1><p>机构不是教师账号。教师可以不绑定机构。</p></div>
      <button class="btn primary" @click="openForm()">创建机构</button>
    </div>
    <PageLoad
      :loading="loading"
      :ready="ready"
      :error="error"
      :columns="8"
      @retry="load"
    >
    <p v-if="error" class="error">{{ error }}</p>
    <article class="card">
      <table>
        <thead><tr><th>机构</th><th>联系人</th><th>对公信息</th><th>教师数</th><th>默认分佣</th><th>教师可见</th><th>状态</th><th class="col-actions">操作</th></tr></thead>
        <tbody>
          <tr v-for="item in list" :key="item.id">
            <td>{{ item.name }}</td>
            <td>{{ item.contactName || '—' }} {{ item.phone || '' }}</td>
            <td>
              <template v-if="item.bankAccount || item.corpName">
                <div>{{ item.corpName || '未填户名' }}</div>
                <div class="muted">{{ item.bankName || '未填开户行' }} {{ maskAccount(item.bankAccount) }}</div>
              </template>
              <span v-else class="muted">未录入</span>
            </td>
            <td>{{ item._count.teachers }}</td>
            <td>{{ item.commissionMode === 'fixed' ? `¥${item.commissionValue}/节` : `${item.commissionValue}%` }}</td>
            <td>{{ visibilityText(item.feeVisibility) }}</td>
            <td><span :class="['tag', item.status === 1 ? 'green' : '']">{{ item.status === 1 ? '正常' : '停用' }}</span></td>
            <td class="col-actions">
              <div class="row-actions">
                <ActionBtn icon="eye" tip="详情" @click="openDetail(item)" />
              </div>
            </td>
          </tr>
          <tr v-if="!list.length"><td colspan="8" class="empty">还没有机构</td></tr>
        </tbody>
      </table>
    </article>
    </PageLoad>

    <PageModal
      :open="!!detail"
      panel-class="org-detail"
      :body-pad="false"
      :title="detail?.name || ''"
      :desc="detail ? `负责人 ${detail.contactName || '—'} · ${detail.phone || '无电话'}` : ''"
      @close="closeDetail"
    >
      <div class="org-detail-body">
        <div class="org-stats">
          <div><small>累计分佣</small><strong>¥{{ Number(detail.commissionTotal || 0).toFixed(2) }}</strong></div>
          <div><small>绑定教师</small><strong>{{ detail.teachers?.length || 0 }}</strong></div>
          <div><small>默认分佣</small><strong>{{ detail.commissionMode === 'fixed' ? `¥${detail.commissionValue}/节` : `${detail.commissionValue}%` }}</strong></div>
        </div>
        <div class="corp-card">
          <div class="row-between">
            <strong>对公信息</strong>
            <button class="btn" type="button" @click="openForm(detail)">编辑对公信息</button>
          </div>
          <div class="kv">
            <span>户名</span><b>{{ detail.corpName || '—' }}</b>
            <span>税号</span><b>{{ detail.taxNo || '—' }}</b>
            <span>开户行</span><b>{{ detail.bankName || '—' }}</b>
            <span>账号</span><b>{{ detail.bankAccount || '—' }}</b>
            <span>地址</span><b>{{ detail.corpAddress || '—' }}</b>
            <span>电话</span><b>{{ detail.corpPhone || '—' }}</b>
          </div>
        </div>
        <table>
          <thead><tr><th>机构教师</th><th>认证</th><th class="col-actions">操作</th></tr></thead>
          <tbody>
            <tr v-for="item in detail.teachers" :key="item.id">
              <td>{{ item.teacherCert?.realName || item.nickname }}</td>
              <td>{{ item.teacherCert?.status || '未认证' }}</td>
              <td class="col-actions">
                <div class="row-actions">
                  <ActionBtn icon="eye" tip="查看" :to="`/faculty/${item.id}`" />
                  <ActionBtn icon="x" tip="移除" tone="danger" @click="unbind(item)" />
                </div>
              </td>
            </tr>
            <tr v-if="!detail.teachers?.length"><td colspan="3" class="empty">还没有绑定教师</td></tr>
          </tbody>
        </table>
      </div>
    </PageModal>

    <PageModal
      :open="!!form"
      :title="form?.id ? '编辑机构' : '创建机构'"
      @close="form = null"
    >
      <form class="form" @submit.prevent="save">
        <label>机构名称<input v-model="form.name" required /></label>
        <div class="form-row">
          <label>联系人<input v-model="form.contactName" /></label>
          <label>电话<input v-model="form.phone" /></label>
        </div>
        <label>地址<input v-model="form.address" /></label>
        <label>简介<textarea v-model="form.intro"></textarea></label>
        <div class="corp-box">
          <div class="row-between">
            <strong>对公信息</strong>
            <button class="btn" type="button" @click="pasteCorp">一键粘贴解析</button>
          </div>
          <textarea v-model="form.corpRaw" placeholder="把对公信息粘贴到这里。支持「公司名称 / 税号 / 开户行 / 账号」，也可以按行粘贴。"></textarea>
          <p v-if="corpHint" class="muted">{{ corpHint }}</p>
          <div class="form-row">
            <label>户名<input v-model="form.corpName" placeholder="公司或账户名称" /></label>
            <label>税号<input v-model="form.taxNo" placeholder="纳税人识别号" /></label>
          </div>
          <div class="form-row">
            <label>开户行<input v-model="form.bankName" placeholder="开户银行" /></label>
            <label>账号<input v-model="form.bankAccount" placeholder="银行账号" /></label>
          </div>
          <div class="form-row">
            <label>地址<input v-model="form.corpAddress" placeholder="注册或经营地址" /></label>
            <label>电话<input v-model="form.corpPhone" placeholder="对公电话" /></label>
          </div>
        </div>
        <div class="form-row">
          <label>分佣方式
            <select v-model="form.commissionMode">
              <option value="percent">按比例 %</option>
              <option value="fixed">固定金额</option>
            </select>
          </label>
          <label>分佣值<input v-model.number="form.commissionValue" type="number" min="0" step="0.01" /></label>
        </div>
        <label>教师课时费可见
          <select v-model="form.feeVisibility">
            <option value="final">只看最终课时费</option>
            <option value="full">看完整费用和分佣</option>
            <option value="hidden">不看金额</option>
          </select>
        </label>
        <div class="form-actions">
          <button class="btn primary" type="submit">保存</button>
          <button class="btn" type="button" @click="form = null">取消</button>
        </div>
      </form>
    </PageModal>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { parseCorp } from '../corp';
import ActionBtn from '../components/ActionBtn.vue';
import PageModal from '../components/PageModal.vue';
import PageLoad from '../components/PageLoad.vue';
import { usePageLoad } from '../composables/usePageLoad';

const list = ref([]);
const detail = ref(null);
const form = ref(null);
const { loading, ready, error, run } = usePageLoad();
const corpHint = ref('');
const emptyCorp = { corpName: '', taxNo: '', bankName: '', bankAccount: '', corpAddress: '', corpPhone: '', corpRaw: '' };
function visibilityText(value) {
  return { final: '只看实得', full: '看完整费用', hidden: '不可见' }[value] || value;
}
function maskAccount(value) {
  const text = String(value || '');
  if (text.length < 8) return text;
  return `${text.slice(0, 4)} **** ${text.slice(-4)}`;
}
async function load() {
  await run(async () => {
    list.value = await api.orgs();
  });
}
function openForm(item) {
  form.value = item
    ? { ...item }
    : { name: '', contactName: '', phone: '', address: '', intro: '', commissionMode: 'percent', commissionValue: 10, feeVisibility: 'final', status: 1, ...emptyCorp };
  corpHint.value = '';
}
async function pasteCorp() {
  let text = form.value?.corpRaw || '';
  try {
    const clip = await navigator.clipboard.readText();
    if (clip?.trim()) text = clip;
  } catch {
    // 浏览器未授权剪贴板时，使用文本框里已经粘贴的内容
  }
  const parsed = parseCorp(text);
  const count = ['corpName', 'taxNo', 'bankName', 'bankAccount', 'corpAddress', 'corpPhone'].filter((key) => parsed[key]).length;
  if (!count) {
    corpHint.value = '没有识别到对公信息。可以带上「公司名称：」「税号：」「开户行：」「账号：」，或按行粘贴。';
    return;
  }
  Object.assign(form.value, parsed);
  corpHint.value = `已识别 ${count} 项，保存后会记到这个机构。`;
}
async function openDetail(item) {
  try { detail.value = await api.org(item.id); } catch (err) { error.value = err.message; }
}
function closeDetail() {
  detail.value = null;
}
async function save() {
  try {
    const editingId = form.value.id;
    if (form.value.id) await api.updateOrg(form.value.id, form.value);
    else await api.createOrg(form.value);
    form.value = null;
    await load();
    if (detail.value?.id === editingId) await openDetail({ id: editingId });
  } catch (err) {
    error.value = err.message;
  }
}
async function unbind(item) {
  try {
    await api.setFacultyOrg(item.id, null);
    await openDetail(detail.value);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
onMounted(load);
</script>
