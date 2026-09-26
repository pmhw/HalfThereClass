<template>
  <section>
    <div class="page-head">
      <div>
        <h1>用户管理</h1>
        <p>管理微信用户。认证通过后才是教师，可以冻结、绑定机构和上级。</p>
      </div>
    </div>
    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="9" kpis filters @retry="load">
    <div class="kpi-grid">
      <article class="card kpi"><div class="label">全部用户</div><div class="value">{{ stats.all }}</div></article>
      <article class="card kpi"><div class="label">微信用户</div><div class="value">{{ stats.wechat }}</div></article>
      <article class="card kpi"><div class="label">认证教师</div><div class="value">{{ stats.certified }}</div></article>
      <article class="card kpi"><div class="label">审核中</div><div class="value">{{ stats.pending }}</div></article>
      <article class="card kpi"><div class="label">已冻结</div><div class="value">{{ stats.frozen }}</div></article>
    </div>
    <div class="toolbar">
      <div class="field"><input v-model="keyword" placeholder="搜索微信昵称 / 手机号 / 姓名" @keyup.enter="reload" /></div>
      <div class="field">
        <select v-model="cert" @change="reload">
          <option value="">全部认证状态</option>
          <option value="none">未申请</option>
          <option value="pending">审核中</option>
          <option value="approved">已认证</option>
          <option value="rejected">已驳回</option>
          <option value="frozen">冻结</option>
        </select>
      </div>
      <div class="field">
        <select v-model="organizationId" @change="reload">
          <option value="">全部机构</option>
          <option value="0">未绑定机构</option>
          <option v-for="item in orgs" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
        </select>
      </div>
      <div class="field">
        <select v-model="hasParent" @change="reload">
          <option value="">上级不限</option>
          <option value="1">有上级</option>
          <option value="0">无上级</option>
        </select>
      </div>
      <div class="field">
        <select v-model="status" @change="reload">
          <option value="">全部状态</option>
          <option value="1">正常</option>
          <option value="0">冻结</option>
        </select>
      </div>
      <button class="btn" @click="reload">搜索</button>
    </div>
    <article class="card">
      <table>
        <thead><tr><th>姓名</th><th>微信昵称</th><th>手机号</th><th>身份</th><th>认证</th><th>机构</th><th>上级</th><th>状态</th><th class="col-actions">操作</th></tr></thead>
        <tbody>
          <tr v-for="item in result.list" :key="item.id">
            <td>{{ item.realName || '—' }}</td>
            <td>{{ item.nickname || '—' }}</td>
            <td>{{ item.phone || '—' }}</td>
            <td><span :class="['tag', item.certStatus === 'approved' ? 'green' : '']">{{ item.certStatus === 'approved' ? '认证教师' : '微信用户' }}</span></td>
            <td>{{ certText(item.certStatus) }}</td>
            <td>{{ item.organization?.name || '未绑定' }}</td>
            <td>{{ item.parent?.name || '无' }}</td>
            <td><span :class="['tag', item.status === 1 ? 'green' : 'red']">{{ item.status === 1 ? '正常' : '冻结' }}</span></td>
            <td class="col-actions">
              <div class="row-actions">
                <ActionBtn icon="eye" tip="详情" :to="`/faculty/${item.id}`" />
                <ActionBtn icon="building" tip="机构/上级" @click="openRelation(item)" />
                <ActionBtn
                  :icon="item.status === 1 ? 'lock' : 'unlock'"
                  :tip="item.status === 1 ? '冻结' : '解冻'"
                  @click="askFreeze(item)"
                />
              </div>
            </td>
          </tr>
          <tr v-if="!result.list.length"><td colspan="9" class="empty">没有符合条件的用户</td></tr>
        </tbody>
      </table>
      <Pager :page="result.pagination.page" :total-pages="result.pagination.totalPages" :total="result.pagination.total" @change="changePage" />
    </article>
    </PageLoad>

    <PageModal
      :open="!!editing"
      size="narrow"
      title="调整归属"
      icon="building"
      @close="editing = null"
    >
      <form class="form" @submit.prevent="saveRelation">
        <p class="muted">{{ editing.realName || editing.nickname || '未命名用户' }}</p>
        <label>所属机构
          <select v-model="orgId">
            <option value="">未绑定</option>
            <option v-for="item in orgs" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
          </select>
        </label>
        <label>上级教师
          <select v-model="parentId">
            <option value="">无上级</option>
            <option v-for="item in teachers" :key="item.id" :value="String(item.id)" :disabled="item.id === editing.id">{{ item.realName || item.nickname }}</option>
          </select>
        </label>
        <p v-if="formError" class="error">{{ formError }}</p>
        <div class="form-actions">
          <button class="btn primary" type="submit">保存</button>
          <button class="btn" type="button" @click="editing = null">取消</button>
        </div>
      </form>
    </PageModal>

    <PageModal
      :open="!!freezeTarget"
      size="narrow"
      :title="freezeTarget?.status === 1 ? '冻结账号' : '解除冻结'"
      :icon="freezeTarget?.status === 1 ? 'lock' : 'unlock'"
      @close="freezeTarget = null"
    >
      <p class="confirm-text" style="padding:0;margin:0 0 8px">确定{{ freezeTarget.status === 1 ? '冻结' : '解冻' }}「{{ freezeTarget.realName || freezeTarget.nickname || '该用户' }}」？冻结后不能登录和使用教学功能。</p>
      <template #footer>
        <button class="btn" type="button" @click="freezeTarget = null">取消</button>
        <button class="btn primary" type="button" @click="doFreeze">确认</button>
      </template>
    </PageModal>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';
import Pager from '../components/Pager.vue';
import ActionBtn from '../components/ActionBtn.vue';
import PageModal from '../components/PageModal.vue';
import PageLoad from '../components/PageLoad.vue';
import { usePageLoad } from '../composables/usePageLoad';

const keyword = ref('');
const cert = ref('');
const organizationId = ref('');
const hasParent = ref('');
const status = ref('');
const page = ref(1);
const { loading, ready, error, run } = usePageLoad();
const formError = ref('');
const orgs = ref([]);
const teachers = ref([]);
const editing = ref(null);
const orgId = ref('');
const parentId = ref('');
const freezeTarget = ref(null);
const stats = ref({ all: 0, wechat: 0, certified: 0, pending: 0, frozen: 0 });
const result = ref({ list: [], pagination: { page: 1, totalPages: 1, total: 0 } });
const certMap = { none: '未申请', pending: '审核中', approved: '已认证', rejected: '已驳回', frozen: '冻结' };
function certText(value) { return certMap[value] || value; }

async function load() {
  await run(async () => {
    const data = await api.people({
      keyword: keyword.value,
      cert: cert.value,
      organizationId: organizationId.value,
      hasParent: hasParent.value,
      status: status.value,
      page: page.value,
      pageSize: 10,
    });
    result.value = { list: data.list, pagination: data.pagination };
    stats.value = data.stats;
  });
}
function reload() { page.value = 1; load(); }
function changePage(next) { page.value = next; load(); }
function openRelation(item) {
  formError.value = '';
  editing.value = item;
  orgId.value = item.organization?.id ? String(item.organization.id) : '';
  parentId.value = item.parent?.id ? String(item.parent.id) : '';
}
async function saveRelation() {
  formError.value = '';
  try {
    await api.setFacultyOrg(editing.value.id, orgId.value ? Number(orgId.value) : null);
    await api.setFacultyParent(editing.value.id, parentId.value ? Number(parentId.value) : null);
    editing.value = null;
    await load();
  } catch (err) {
    formError.value = err.message;
  }
}
function askFreeze(item) { freezeTarget.value = item; }
async function doFreeze() {
  const item = freezeTarget.value;
  freezeTarget.value = null;
  if (!item) return;
  try {
    await api.freezeFaculty(item.id, item.status === 1);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
onMounted(async () => {
  try {
    const [orgList, faculty] = await Promise.all([api.orgs(), api.faculty()]);
    orgs.value = orgList;
    teachers.value = (faculty.list || []).filter((item) => item.certStatus === 'approved');
  } catch {
    /* filter options can load empty; list load still proceeds */
  }
  await load();
});
</script>
