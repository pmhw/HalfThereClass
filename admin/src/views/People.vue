<template>
  <section>
    <div class="page-head">
      <div>
        <h1>用户管理</h1>
        <p>管理微信用户。认证通过后才是教师，可以冻结、绑定机构和上级。同一个人有小程序和手机网页两个账号时，可用「合并账号」并成一个。</p>
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
            <td>
              <div>{{ item.realName || '—' }}</div>
              <span v-if="item.duplicateName" class="tag amber dup-tag" title="有其他账号使用同一个真实姓名">同名账号</span>
            </td>
            <td>
              <div>{{ item.nickname || '—' }}</div>
              <div class="muted">ID {{ item.id }} · {{ item.wechat ? '微信登录' : '手机号登录' }}</div>
            </td>
            <td>{{ item.phone || '—' }}</td>
            <td><span :class="['tag', item.certStatus === 'approved' ? 'green' : 'gray']">{{ item.certStatus === 'approved' ? '认证教师' : '微信用户' }}</span></td>
            <td><span :class="['tag', certTone(item.certStatus)]">{{ certText(item.certStatus) }}</span></td>
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
                <ActionBtn icon="link" tip="合并账号" @click="openMerge(item)" />
                <ActionBtn icon="trash" tip="删除账号" tone="danger" @click="askDelete(item)" />
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

    <PageModal
      :open="!!merging"
      size="wide"
      title="合并账号"
      icon="link"
      desc="同一个人的两个账号（如小程序微信账号和手机网页账号）合并成一个：数据全部并入保留的账号，另一个账号删除，合并后微信和手机号都能登录。"
      @close="closeMerge"
    >
      <div v-if="merging" class="form merge-form">
        <label>和哪个账号合并
          <SearchSelect
            v-model="mergeOtherId"
            :options="mergeOptions"
            placeholder="搜索姓名 / 昵称 / 手机号，同名账号排在前面"
            search-placeholder="姓名 / 昵称 / 手机号 / ID…"
            @change="loadMergePreview"
          />
        </label>
        <p v-if="mergeLoading" class="muted">正在读取两个账号的数据…</p>
        <template v-if="mergePreview">
          <div class="merge-cards">
            <label
              v-for="acc in mergePreview.accounts"
              :key="acc.id"
              class="merge-card"
              :class="{ on: mergeKeeperId === acc.id, disabled: !!mergePreview.blocked }"
            >
              <div class="merge-card-head">
                <input v-model="mergeKeeperId" type="radio" :value="acc.id" :disabled="!!mergePreview.blocked" />
                <strong>{{ acc.realName || acc.nickname || '未命名' }}</strong>
                <span class="muted">ID {{ acc.id }}</span>
                <span v-if="mergeKeeperId === acc.id" class="tag green">保留</span>
                <span v-else class="tag gray">并入后删除</span>
              </div>
              <div class="merge-line">登录：{{ acc.wechat ? '微信' : '手机号网页' }}{{ acc.phone ? ` · ${acc.phone}` : ' · 未绑手机号' }}</div>
              <div class="merge-line">昵称：{{ acc.nickname || '—' }} · 认证：{{ certText(acc.certStatus) }} · 合同：{{ contractText(acc.contractStatus) }}</div>
              <div class="merge-line muted">注册 {{ day(acc.createdAt) }} · 最近登录 {{ day(acc.lastLoginAt) }}</div>
              <div class="merge-chips">
                <span v-for="f in acc.footprint.items" :key="f.key" class="merge-chip">{{ f.label }} {{ f.count }}</span>
                <span v-if="!acc.footprint.items.length" class="muted">没有业务数据</span>
              </div>
            </label>
          </div>
          <p v-if="mergePreview.blocked" class="error">{{ mergePreview.blocked }}</p>
          <p v-else class="merge-result">
            合并后保留 <b>ID {{ mergeKeeperId }}</b>：{{ mergeResultText }}。另一个账号的认证、合同、课程、收入、报销、分成和打款记录全部并入，然后删除。此操作不可撤销。
          </p>
        </template>
        <p v-if="mergeError" class="error">{{ mergeError }}</p>
      </div>
      <template #footer>
        <button class="btn" type="button" :disabled="mergeSaving" @click="closeMerge">取消</button>
        <button
          class="btn primary"
          type="button"
          :disabled="!mergePreview || !!mergePreview.blocked || !mergeKeeperId || mergeSaving"
          @click="doMerge"
        >{{ mergeSaving ? '合并中…' : '确认合并' }}</button>
      </template>
    </PageModal>
  </section>
</template>

<script setup>
import { computed, onActivated, onMounted, ref } from 'vue';
import { api } from '../api';
import Pager from '../components/Pager.vue';
import ActionBtn from '../components/ActionBtn.vue';
import PageModal from '../components/PageModal.vue';
import PageLoad from '../components/PageLoad.vue';
import SearchSelect from '../components/SearchSelect.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { notify } from '../notify';

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
function certText(value) { return certMap[value] || value || '未申请'; }
function certTone(value) {
  if (value === 'approved') return 'green';
  if (value === 'pending') return 'amber';
  if (value === 'rejected') return 'red';
  if (value === 'frozen') return 'gray';
  return 'blue';
}

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

const contractMap = { none: '未签', pending_review: '待审核', signed: '已签' };
function contractText(value) { return contractMap[value] || value || '未签'; }
function day(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

const merging = ref(null);
const mergeCandidates = ref([]);
const mergeOtherId = ref('');
const mergePreview = ref(null);
const mergeKeeperId = ref(null);
const mergeLoading = ref(false);
const mergeSaving = ref(false);
const mergeError = ref('');
const mergeOptions = computed(() => mergeCandidates.value.map((item) => ({
  value: String(item.id),
  title: item.realName || item.nickname || `用户 #${item.id}`,
  label: [item.nickname, item.phone].filter(Boolean).join(' · ') || '—',
  hint: `ID ${item.id} · ${item.wechat ? '微信' : '手机号'}${item.sameName ? ' · 同名' : ''}`,
})));
const mergeResultText = computed(() => {
  const list = mergePreview.value?.accounts || [];
  const wechat = list.some((acc) => acc.wechat);
  const phone = list.find((acc) => acc.phone)?.phone || '';
  return [wechat ? '小程序微信可登录' : '', phone ? `手机号 ${phone} 可登录手机网页` : ''].filter(Boolean).join('，') || '登录方式不变';
});

async function openMerge(item) {
  merging.value = item;
  mergeOtherId.value = '';
  mergePreview.value = null;
  mergeKeeperId.value = null;
  mergeError.value = '';
  try {
    mergeCandidates.value = await api.mergeCandidates(item.id);
  } catch (err) {
    mergeError.value = err.message || '加载账号失败';
  }
}
function closeMerge() {
  if (mergeSaving.value) return;
  merging.value = null;
}
async function loadMergePreview() {
  mergePreview.value = null;
  mergeError.value = '';
  if (!merging.value || !mergeOtherId.value) return;
  mergeLoading.value = true;
  try {
    const data = await api.mergePreview(merging.value.id, Number(mergeOtherId.value));
    mergePreview.value = data;
    mergeKeeperId.value = data.suggestedKeeperId;
  } catch (err) {
    mergeError.value = err.message || '读取失败';
  } finally {
    mergeLoading.value = false;
  }
}
async function doMerge() {
  const preview = mergePreview.value;
  if (!preview || preview.blocked || !mergeKeeperId.value) return;
  const keeper = preview.accounts.find((acc) => acc.id === mergeKeeperId.value);
  const donor = preview.accounts.find((acc) => acc.id !== mergeKeeperId.value);
  const ok = await notify.confirm({
    title: '确认合并账号',
    message: `把「${donor.realName || donor.nickname || donor.id}」（ID ${donor.id}）的全部数据并入「${keeper.realName || keeper.nickname || keeper.id}」（ID ${keeper.id}），并删除 ID ${donor.id}。不可撤销，确定吗？`,
    okText: '合并',
    danger: true,
    icon: 'link',
  });
  if (!ok) return;
  mergeSaving.value = true;
  mergeError.value = '';
  try {
    await api.mergePeople({ keeperId: keeper.id, donorId: donor.id });
    notify.success(`已合并到 ID ${keeper.id}`);
    mergeSaving.value = false;
    merging.value = null;
    await load();
  } catch (err) {
    mergeError.value = err.message || '合并失败';
  } finally {
    mergeSaving.value = false;
  }
}

async function askDelete(item) {
  const name = item.realName || item.nickname || `用户 #${item.id}`;
  const ok = await notify.confirm({
    title: '删除账号',
    message: `确定删除「${name}」（ID ${item.id}）？只能删除没有课程、收入、合同、订单等数据的空账号；有数据的重复账号请用「合并账号」。`,
    okText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deletePerson(item.id);
    notify.success('账号已删除');
    await load();
  } catch (err) {
    notify.error(err.message || '删除失败');
  }
}
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
let peopleActivated = false;
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
onActivated(() => {
  if (!peopleActivated) {
    peopleActivated = true;
    return;
  }
  if (ready.value) load();
});
</script>

<style scoped>
.dup-tag { margin-top: 4px; }
.merge-form { gap: 14px; }
.merge-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.merge-card {
  display: grid; gap: 6px; padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 12px;
  cursor: pointer; font-size: 13px; color: #344054; background: #fff;
}
.merge-card.on { border-color: var(--primary, #2563eb); background: #f5f8ff; box-shadow: 0 0 0 1px var(--primary, #2563eb) inset; }
.merge-card.disabled { cursor: default; }
.merge-card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.merge-card-head strong { font-size: 15px; color: #0f172a; }
.merge-card-head .tag { margin-left: auto; }
.merge-line { line-height: 1.5; }
.merge-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.merge-chip { padding: 2px 8px; border-radius: 999px; background: #f2f4f7; color: #475467; font-size: 12px; }
.merge-result { margin: 0; padding: 10px 12px; border-radius: 10px; background: #fffbeb; color: #92400e; font-size: 13px; line-height: 1.6; }
@media (max-width: 760px) { .merge-cards { grid-template-columns: 1fr; } }
</style>
