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
        <thead><tr><th>机构</th><th>联系人</th><th>对公信息</th><th>教师数</th><th>承接课</th><th>默认分佣</th><th>状态</th><th class="col-actions">操作</th></tr></thead>
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
            <td>{{ item._count?.teachers || 0 }}</td>
            <td>{{ item._count?.courses || 0 }}</td>
            <td>{{ item.commissionMode === 'fixed' ? `¥${item.commissionValue}/节` : `${item.commissionValue}%` }}</td>
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
          <div><small>累计机构利润</small><strong>¥{{ Number(detail.commissionTotal || 0).toFixed(2) }}</strong></div>
          <div><small>绑定教师</small><strong>{{ detail.teachers?.length || 0 }}</strong></div>
          <div><small>承接课程</small><strong>{{ detail.courses?.length || 0 }}</strong></div>
          <div><small>默认抽成</small><strong>{{ detail.commissionMode === 'fixed' ? `¥${detail.commissionValue}/节` : `${detail.commissionValue}%` }}</strong></div>
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
        <div class="corp-card">
          <div class="row-between">
            <strong>承接课程（按课抽成）</strong>
            <button class="btn primary" type="button" @click="openAssign">分配课程</button>
          </div>
          <p class="muted" style="margin:8px 0 12px">
            校方价 − 课时费 = 平台利润；课时费 − 机构抽成 = 教师课时费。例：校方 1200、课时费 1000、机构 20%，平台 200、机构 200、教师 800。
            <template v-if="detail.settleToOrg"><br /><b>本机构设为「不看金额」：课时费整笔直接结算给机构，由机构发放给老师。</b></template>
          </p>
          <table>
            <thead>
              <tr>
                <th>课程</th>
                <th>校方价</th>
                <th>课时费</th>
                <th>机构抽成</th>
                <th>机构利润</th>
                <th>{{ detail.settleToOrg ? '结算给机构' : '教师课时费' }}</th>
                <th>平台利润</th>
                <th>老师</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in detail.courses || []" :key="item.id">
                <td>
                  <strong>{{ item.title }}</strong>
                  <div class="muted">{{ item.school || '—' }}</div>
                </td>
                <td>¥{{ Number(item.price || 0).toFixed(2) }}</td>
                <td>
                  <template v-if="item.configured">¥{{ Number(item.sessionFee || 0).toFixed(2) }}</template>
                  <span v-else class="tag red">未配置课时费</span>
                </td>
                <td>{{ item.commissionText }}</td>
                <td>{{ moneyText(item.configured && item.commission) }}</td>
                <td>{{ moneyText(item.configured && (detail.settleToOrg ? item.sessionFee : item.teacherFee)) }}</td>
                <td>{{ moneyText(item.configured && item.platformAmount) }}</td>
                <td>{{ item.teacherName }}</td>
                <td class="col-actions">
                  <div class="row-actions">
                    <ActionBtn icon="pencil" tip="改抽成" @click="openEditAssign(item)" />
                    <ActionBtn icon="x" tip="解除分配" tone="danger" @click="unassignCourse(item)" />
                  </div>
                </td>
              </tr>
              <tr v-if="!(detail.courses || []).length">
                <td colspan="9" class="empty">还没有承接课程，点右上角分配</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="corp-card">
          <div class="row-between">
            <strong>机构教师</strong>
            <button class="btn primary" type="button" @click="openBindTeachers">批量关联老师</button>
          </div>
          <p class="muted" style="margin:8px 0 12px">
            关联后跟随机构「教师课时费可见」：{{ visibilityText(detail.feeVisibility) }}。
            承接本机构的课程始终只让老师看到最终课时费。
          </p>
          <table>
            <thead><tr><th>机构教师</th><th>认证</th><th class="col-actions">操作</th></tr></thead>
            <tbody>
              <tr v-for="item in detail.teachers" :key="item.id">
                <td>{{ item.teacherCert?.realName || item.nickname }}</td>
                <td>
                  <span :class="['tag', certTone(item.teacherCert?.status)]">{{ certText(item.teacherCert?.status) }}</span>
                </td>
                <td class="col-actions">
                  <div class="row-actions">
                    <ActionBtn icon="eye" tip="查看" :to="`/faculty/${item.id}`" />
                    <ActionBtn icon="x" tip="移除" tone="danger" @click="unbind(item)" />
                  </div>
                </td>
              </tr>
              <tr v-if="!detail.teachers?.length"><td colspan="3" class="empty">还没有绑定教师，点右上角批量关联</td></tr>
            </tbody>
          </table>
        </div>
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
              <option value="percent">按课时费比例 %</option>
              <option value="fixed">固定金额 / 节</option>
            </select>
          </label>
          <label>分佣值<input v-model.number="form.commissionValue" type="number" min="0" step="0.01" /></label>
        </div>
        <p class="muted" style="grid-column:1/-1">默认抽成用于「承接课程」时的预填。承接课程后：平台利润 = 校方价 − 课时费；机构利润 = 按课时费抽成；教师课时费 = 课时费 − 机构利润。</p>
        <label>教师课时费可见
          <select v-model="form.feeVisibility">
            <option value="final">只看最终课时费（推荐）</option>
            <option value="hidden">不看金额（课时费直接结算给机构）</option>
          </select>
        </label>
        <div class="form-actions">
          <button class="btn primary" type="submit">保存</button>
          <button class="btn" type="button" @click="form = null">取消</button>
        </div>
      </form>
    </PageModal>

    <PageModal
      :open="!!assignForm"
      size="narrow"
      :title="assignForm?.editing ? '调整课程抽成' : '分配课程给机构'"
      @close="assignForm = null"
    >
      <form class="form" @submit.prevent="saveAssign">
        <p class="muted">
          未安排老师的课也可以分配。分配后关闭抢课，只能由后台安排老师；教师排到该课会自动关联本机构，且只能看到最终课时费。
          <template v-if="detail?.settleToOrg">本机构为「不看金额」，课时费直接结算给机构，结算单教师列会显示「机构结算 · {{ detail.name }}」。</template>
        </p>
        <label>课程
          <select v-model="assignForm.courseId" required :disabled="!!assignForm.editing">
            <option value="">请选择未承接课程</option>
            <option v-for="item in assignCourseOptions" :key="item.id" :value="String(item.id)">
              {{ item.title }} · 校方 ¥{{ Number(item.price || 0).toFixed(2) }} · 课时费 {{ item.sessionFee == null ? '未配置' : `¥${Number(item.sessionFee).toFixed(2)}` }}{{ item.school ? ` · ${item.school}` : '' }}
            </option>
          </select>
        </label>
        <div class="form-row">
          <label>抽成方式
            <select v-model="assignForm.commissionMode">
              <option value="fixed">固定金额 / 节</option>
              <option value="percent">按课时费比例 %</option>
            </select>
          </label>
          <label>抽成值
            <input v-model="assignForm.commissionValue" type="number" min="0" step="0.01" required />
          </label>
        </div>
        <p v-if="assignPreview" class="ok-tip">{{ assignPreview }}</p>
        <p v-if="assignError" class="error">{{ assignError }}</p>
        <div class="form-actions">
          <button class="btn primary" type="submit" :disabled="assignSaving">{{ assignSaving ? '保存中…' : '确认' }}</button>
          <button class="btn" type="button" @click="assignForm = null">取消</button>
        </div>
      </form>
    </PageModal>
    <PageModal
      :open="!!bindForm"
      size="narrow"
      title="批量关联老师"
      @close="bindForm = null"
    >
      <form class="form" @submit.prevent="saveBindTeachers">
        <p class="muted">
          只能选择已认证教师。关联后按本机构「教师课时费可见」配置展示费用（当前：{{ visibilityText(detail?.feeVisibility) }}）。
          承接本机构的课程不展示抽成过程；若配置为「不看金额」则教师端也不显示课时费。
        </p>
        <label>选择教师
          <SearchSelect
            v-model="bindForm.userIds"
            multiple
            :options="bindTeacherOptions"
            placeholder="搜索并多选教师"
            search-placeholder="姓名 / 手机号…"
          />
        </label>
        <p v-if="bindError" class="error">{{ bindError }}</p>
        <div class="form-actions">
          <button class="btn primary" type="submit" :disabled="bindSaving || !(bindForm.userIds || []).length">
            {{ bindSaving ? '关联中…' : `确认关联（${(bindForm.userIds || []).length}）` }}
          </button>
          <button class="btn" type="button" @click="bindForm = null">取消</button>
        </div>
      </form>
    </PageModal>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { parseCorp } from '../corp';
import ActionBtn from '../components/ActionBtn.vue';
import PageModal from '../components/PageModal.vue';
import PageLoad from '../components/PageLoad.vue';
import SearchSelect from '../components/SearchSelect.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { notify } from '../notify';

const list = ref([]);
const detail = ref(null);
const form = ref(null);
const assignForm = ref(null);
const assignableCourses = ref([]);
const assignSaving = ref(false);
const assignError = ref('');
const bindForm = ref(null);
const bindTeacherOptions = ref([]);
const bindSaving = ref(false);
const bindError = ref('');
const { loading, ready, error, run, bindLoad } = usePageLoad();
const corpHint = ref('');
const emptyCorp = { corpName: '', taxNo: '', bankName: '', bankAccount: '', corpAddress: '', corpPhone: '', corpRaw: '' };
const certMap = { pending: '审核中', approved: '已认证', rejected: '已驳回', frozen: '冻结', none: '未认证' };
function certText(value) { return certMap[value] || '未认证'; }
function certTone(value) {
  if (value === 'approved') return 'green';
  if (value === 'pending') return 'amber';
  if (value === 'rejected') return 'red';
  if (value === 'frozen') return 'gray';
  return 'blue';
}
function visibilityText(value) {
  return value === 'hidden' ? '不看金额' : '只看最终课时费';
}
function maskAccount(value) {
  const text = String(value || '');
  if (text.length < 8) return text;
  return `${text.slice(0, 4)} **** ${text.slice(-4)}`;
}

const assignPreview = computed(() => {
  if (!assignForm.value?.courseId) return '';
  const course = assignCourseOptions.value.find((item) => String(item.id) === String(assignForm.value.courseId));
  if (!course) return '';
  const price = Number(course.price || 0);
  const fee = Number(course.sessionFee || 0);
  if (!fee) return '该课程还没有课时费，请先到「分成比例 → 课程分成规则」配置课时费';
  const raw = Number(assignForm.value.commissionValue || 0);
  if (Number.isNaN(raw)) return '';
  const round = (value) => Math.round(value * 100) / 100;
  const commission = Math.min(fee, round(assignForm.value.commissionMode === 'percent' ? fee * raw / 100 : raw));
  const teacher = round(fee - commission);
  const platform = round(price - fee);
  const tail = detail.value?.settleToOrg
    ? `课时费 ¥${fee.toFixed(2)} 整笔结算给机构（机构利润 ¥${commission.toFixed(2)}）`
    : `机构利润 ¥${commission.toFixed(2)}，教师课时费 ¥${teacher.toFixed(2)}（教师只看这一项）`;
  return `预览：校方 ¥${price.toFixed(2)} − 课时费 ¥${fee.toFixed(2)} = 平台利润 ¥${platform.toFixed(2)}；${tail}`;
});

function moneyText(value) {
  if (value === false || value == null || Number.isNaN(Number(value))) return '—';
  return `¥${Number(value).toFixed(2)}`;
}

const assignCourseOptions = computed(() => {
  if (assignForm.value?.editing) {
    const current = (detail.value?.courses || []).find((item) => String(item.id) === String(assignForm.value.courseId));
    return current ? [current] : [];
  }
  return assignableCourses.value;
});

async function load() {
  await run(async () => {
    list.value = await api.orgs();
  });
}
function openForm(item) {
  form.value = item
    ? { ...item }
    : { name: '', contactName: '', phone: '', address: '', intro: '', commissionMode: 'fixed', commissionValue: 300, feeVisibility: 'final', status: 1, ...emptyCorp };
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
  try {
    detail.value = await api.org(item.id);
  } catch (err) {
    notify.error(err.message || '加载机构详情失败');
  }
}
function closeDetail() {
  detail.value = null;
  assignForm.value = null;
  bindForm.value = null;
}
async function openAssign() {
  if (!detail.value?.id) return;
  assignError.value = '';
  assignForm.value = {
    courseId: '',
    commissionMode: detail.value.commissionMode === 'percent' ? 'percent' : 'fixed',
    commissionValue: detail.value.commissionValue ?? 300,
    editing: false,
  };
  try {
    const data = await api.courses({ page: 1, pageSize: 200, status: '1' });
    const taken = new Set((detail.value.courses || []).map((item) => item.id));
    assignableCourses.value = (data.list || []).filter((item) => !item.organizationId && !taken.has(item.id));
  } catch (err) {
    notify.error(err.message || '加载课程失败');
  }
}
function openEditAssign(item) {
  assignError.value = '';
  assignForm.value = {
    courseId: String(item.id),
    commissionMode: item.orgCommissionMode || detail.value?.commissionMode || 'fixed',
    commissionValue: item.orgCommissionValue ?? detail.value?.commissionValue ?? 300,
    editing: true,
  };
}
async function saveAssign() {
  if (!detail.value?.id || !assignForm.value?.courseId) return;
  assignSaving.value = true;
  assignError.value = '';
  try {
    const result = await api.assignOrgCourse(detail.value.id, {
      courseId: Number(assignForm.value.courseId),
      commissionMode: assignForm.value.commissionMode,
      commissionValue: assignForm.value.commissionValue,
    });
    notify.success(result.tip || '已分配课程');
    assignForm.value = null;
    await openDetail(detail.value);
    await load();
  } catch (err) {
    assignError.value = err.message || '分配失败';
  } finally {
    assignSaving.value = false;
  }
}
async function unassignCourse(item) {
  const ok = await notify.confirm({
    title: '解除课程承接',
    message: `确定解除「${item.title}」与机构「${detail.value?.name}」的承接？\n解除后不再按机构抽成结算。`,
    okText: '解除',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.unassignOrgCourse(detail.value.id, item.id);
    notify.success('已解除');
    await openDetail(detail.value);
    await load();
  } catch (err) {
    notify.error(err.message || '解除失败');
  }
}
async function openBindTeachers() {
  if (!detail.value?.id) return;
  bindError.value = '';
  bindForm.value = { userIds: [] };
  try {
    const data = await api.faculty();
    const bound = new Set((detail.value.teachers || []).map((item) => item.id));
    bindTeacherOptions.value = (data.list || [])
      .filter((item) => item.certStatus === 'approved' && !bound.has(item.id))
      .map((item) => ({
        value: String(item.id),
        label: `${item.realName || item.nickname || `教师#${item.id}`}${item.organization?.name ? ` · ${item.organization.name}` : ' · 未绑定机构'}`,
      }));
  } catch (err) {
    notify.error(err.message || '加载教师失败');
  }
}
async function saveBindTeachers() {
  if (!detail.value?.id || !bindForm.value) return;
  const userIds = (bindForm.value.userIds || []).map((id) => Number(id)).filter((id) => id > 0);
  if (!userIds.length) {
    bindError.value = '请先选择教师';
    return;
  }
  bindSaving.value = true;
  bindError.value = '';
  try {
    const result = await api.bindOrgTeachers(detail.value.id, { userIds });
    notify.success(result.tip || '已关联');
    bindForm.value = null;
    detail.value = result.detail || await api.org(detail.value.id);
    await load();
  } catch (err) {
    bindError.value = err.message || '关联失败';
  } finally {
    bindSaving.value = false;
  }
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
    notify.error(err.message || '保存失败');
  }
}
async function unbind(item) {
  try {
    await api.setFacultyOrg(item.id, null);
    await openDetail(detail.value);
    await load();
  } catch (err) {
    notify.error(err.message || '移除失败');
  }
}
bindLoad(load);
</script>
