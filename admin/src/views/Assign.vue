<template>
  <section class="assign-page">
    <div class="page-head">
      <div>
        <h1>教师分配</h1>
        <p>
          可预分配给已实名认证的教师。预分配可随时解除；
          <strong>不等于合同已签订</strong>——本学期合同未生效时课程锁定，审核通过后自动解锁并写入合同附件。
        </p>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="4" :rows="5" @retry="load">
      <article class="card assign-card">
        <div class="sec">
          <i class="sec-dot blue"></i>
          <Icon name="list" />
          <span>基本信息</span>
        </div>

        <div class="fields">
          <label class="field-block">
            <span>课程 <em>*</em></span>
            <div class="control">
              <Icon name="book" />
              <SearchSelect
                v-model="courseId"
                :options="courseOptions"
                placeholder="请选择课程"
                search-placeholder="搜索课程名称、学校…"
                allow-empty
                empty-label="请选择课程"
                @change="onCourse"
              />
            </div>
          </label>

          <label class="field-block">
            <span>教师 <em>*</em></span>
            <div class="control">
              <Icon name="user" />
              <SearchSelect
                v-model="teacherId"
                :options="teacherOptions"
                placeholder="请选择认证教师"
                search-placeholder="搜索姓名、手机、机构…"
                allow-empty
                empty-label="请选择认证教师"
                @change="onTeacher"
              />
            </div>
          </label>
        </div>

          <div v-if="selectedTeacher && courseId" class="teacher-card">
          <span class="teacher-avatar">{{ (selectedTeacher.realName || selectedTeacher.nickname || '师').slice(0, 1) }}</span>
          <div class="teacher-info">
            <strong>{{ selectedTeacher.realName || selectedTeacher.nickname }}</strong>
            <div class="teacher-meta">
              <span>{{ selectedTeacher.organization?.name || '独立教师' }}</span>
              <em class="tag green">已实名认证</em>
              <em class="tag" :class="contractBadgeClass(selectedTeacher)">{{ contractShort(selectedTeacher) }}</em>
            </div>
          </div>
        </div>

        <div v-if="selectedTeacher && courseId" class="contract-banner" :class="contractTone(selectedTeacher)">
          <div class="banner-icon"><Icon :name="selectedTeacher.contractValid ? 'unlock' : 'lock'" /></div>
          <div>
            <strong>合同状态说明</strong>
            <p v-if="selectedTeacher.contractPending">
              合同签名已提交，等待审核。当前保存为预分配（课程锁定），审核通过后自动解锁。可随时解除分配。
            </p>
            <p v-else-if="!selectedTeacher.contractValid">
              本学期合同尚未生效（未签或往期已签不算）。保存后为预分配待解锁；签完并审核通过后自动解锁。
              <template v-if="semesterName">当前学期：{{ semesterName }}。</template>
            </p>
            <p v-else>
              本学期合同已生效，保存后课程直接解锁；仍可随时解除并改派其他教师。
            </p>
            <small v-if="!selectedTeacher.contractValid">建议：先完成预分配，再通知教师签署本学期合同。</small>
          </div>
        </div>

        <template v-if="teacherId && courseId">
          <div class="sec">
            <i class="sec-dot orange"></i>
            <Icon name="receipt" />
            <span>教师课时费</span>
          </div>

          <div class="fee-block">
            <label class="field-block">
              <span>教师课时费</span>
              <div class="control money">
                <em class="yen">¥</em>
                <input v-model="baseFee" type="number" min="0" step="0.01" placeholder="请输入金额" @input="preview" />
                <span class="unit">/ 节</span>
              </div>
              <small class="help">该金额将在教师端按授权课程展示。</small>
            </label>

            <template v-if="selectedTeacher?.organization">
              <div class="fields two">
                <label class="field-block">
                  <span>分佣方式</span>
                  <SearchSelect
                    v-model="mode"
                    :options="modeOptions"
                    placeholder="选择分佣方式"
                    search-placeholder="搜索…"
                    @change="preview"
                  />
                </label>
                <label class="field-block">
                  <span>分佣值</span>
                  <div class="control">
                    <input v-model="value" type="number" min="0" step="0.01" @input="preview" />
                  </div>
                </label>
                <label class="field-block">
                  <span>教师可见</span>
                  <SearchSelect
                    v-model="visibility"
                    :options="visibilityOptions"
                    placeholder="选择可见规则"
                    search-placeholder="搜索…"
                    @change="preview"
                  />
                </label>
                <div class="org-note">
                  <Icon name="building" />
                  <span>{{ selectedTeacher.organization.name }} · 附件金额展示跟随「教师可见」</span>
                </div>
              </div>
            </template>
            <p v-else class="helper">未绑定机构，不设置机构分佣。</p>

            <div v-if="quote && quote.configured" class="fee-flow">
              <div><small>教师课时费</small><b>¥{{ quote.teacherFee }}</b></div>
              <span>+</span>
              <div><small>机构分佣</small><b>¥{{ quote.commission || 0 }}</b></div>
              <span>=</span>
              <div><small>参考校方成本</small><b>¥{{ Number(quote.teacherFee || 0) + Number(quote.commission || 0) }}</b></div>
            </div>
            <p v-else class="helper">还没有课时费，教师端不会显示金额。</p>
          </div>
        </template>

        <div class="card-foot">
          <button class="btn" type="button" :disabled="saving" @click="resetForm">取消</button>
          <button class="btn primary" type="button" :disabled="saving || !courseId || !teacherId" @click="save">
            <Icon name="check" />
            {{ saving ? '保存中…' : '保存授权' }}
          </button>
        </div>
      </article>

      <article class="card assign-list-card">
        <div class="list-head">
          <div>
            <h2>当前预分配</h2>
            <p class="muted">共 {{ grants.length }} 条 · 解除后可改派其他教师</p>
          </div>
          <button class="btn" type="button" @click="loadGrants"><Icon name="refresh" />刷新</button>
        </div>

        <table v-if="grants.length">
          <thead>
            <tr>
              <th>课程</th>
              <th>教师</th>
              <th>状态</th>
              <th>课时费</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in grants" :key="item.id">
              <td>
                <strong>{{ item.title }}</strong>
                <div class="muted tiny">{{ item.school || '—' }}</div>
              </td>
              <td>
                <div>{{ item.teacherName }}</div>
                <div class="muted tiny">{{ item.organizationName || '独立教师' }}</div>
              </td>
              <td>
                <span class="tag" :class="item.locked ? 'warn' : 'ok'">{{ item.locked ? '预分配·待解锁' : '已解锁' }}</span>
                <span v-if="item.contractPending" class="tag">合同待审</span>
                <span v-else-if="item.contractDue" class="tag">本学期未签</span>
                <span v-else-if="item.contractValid" class="tag ok">合同有效</span>
              </td>
              <td>{{ item.baseFee == null ? '—' : `¥${item.baseFee}` }}</td>
              <td class="col-actions">
                <button class="link danger" type="button" :disabled="revoking === item.id" @click="revoke(item)">
                  {{ revoking === item.id ? '解除中…' : '解除分配' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty soft">暂无预分配记录，请在上方选择课程与教师后保存</p>
      </article>
    </PageLoad>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { notify } from '../notify';
import Icon from '../components/Icon.vue';
import PageLoad from '../components/PageLoad.vue';
import SearchSelect from '../components/SearchSelect.vue';
import { usePageLoad } from '../composables/usePageLoad';

const courses = ref([]);
const teachers = ref([]);
const grants = ref([]);
const semesterName = ref('');
const courseId = ref('');
const teacherId = ref('');
const baseFee = ref('');
const mode = ref('percent');
const value = ref(10);
const visibility = ref('final');
const quote = ref(null);
const saving = ref(false);
const revoking = ref(0);
const { loading, ready, error, run } = usePageLoad();

const modeOptions = [
  { value: 'percent', label: '按课时费比例 %' },
  { value: 'fixed', label: '固定金额 / 节' },
];
const visibilityOptions = [
  { value: 'final', label: '只看最终课时费' },
  { value: 'full', label: '看课时费和分佣' },
  { value: 'hidden', label: '不看金额' },
];

const selectedTeacher = computed(() => teachers.value.find((item) => String(item.id) === String(teacherId.value)) || null);

const courseOptions = computed(() => courses.value.map((item) => {
  const grant = grants.value.find((g) => g.courseId === item.id && g.primary);
  return {
    value: String(item.id),
    title: item.title,
    hint: grant ? `已分配给 ${grant.teacherName}` : (item.school || ''),
    search: `${item.title} ${item.school || ''} ${grant?.teacherName || ''}`,
  };
}));

const teacherOptions = computed(() => teachers.value.map((item) => ({
  value: String(item.id),
  title: item.realName || item.nickname,
  hint: `${item.organization?.name || '独立教师'} · ${contractLabel(item)}`,
  phone: item.phone || '',
  teacherNo: item.teacherNo || '',
  search: `${item.realName || ''} ${item.nickname || ''} ${item.phone || ''} ${item.organization?.name || ''} ${contractLabel(item)}`,
})));

function contractLabel(item) {
  if (!item) return '';
  if (item.contractValid) return '本学期合同有效';
  if (item.contractPending) return '合同待审核';
  return '未签合同(预分配)';
}

function contractShort(item) {
  if (!item) return '';
  if (item.contractValid) return '合同有效';
  if (item.contractPending) return '合同待审';
  return '未签合同';
}

function contractBadgeClass(item) {
  if (!item) return 'gray';
  if (item.contractValid) return 'green';
  if (item.contractPending) return 'blue';
  return 'amber';
}

function contractTone(item) {
  if (!item) return '';
  if (item.contractValid) return 'ok';
  if (item.contractPending) return 'pending';
  return 'due';
}

function resetForm() {
  courseId.value = '';
  teacherId.value = '';
  baseFee.value = '';
  quote.value = null;
}

function onCourse() {
  const grant = grants.value.find((item) => String(item.courseId) === String(courseId.value) && item.primary);
  if (grant) {
    teacherId.value = String(grant.userId);
    baseFee.value = grant.baseFee == null ? '' : String(grant.baseFee);
    onTeacher();
  } else {
    preview();
  }
}

function onTeacher() {
  const teacher = selectedTeacher.value;
  visibility.value = 'final';
  if (!teacher?.organization) {
    mode.value = 'percent';
    value.value = 0;
  }
  preview();
}

async function preview() {
  if (!teacherId.value) return;
  try {
    quote.value = await api.feePreview({
      baseFee: baseFee.value,
      hasOrg: selectedTeacher.value?.organization ? '1' : '0',
      mode: mode.value,
      value: value.value,
      visibility: visibility.value,
    });
  } catch (err) {
    notify.error(err.message || '预览失败');
  }
}

async function save() {
  if (!courseId.value || !teacherId.value) {
    notify.warn('请先选择课程和教师');
    return;
  }
  const occupied = grants.value.find(
    (item) => String(item.courseId) === String(courseId.value) && item.primary && String(item.userId) !== String(teacherId.value),
  );
  if (occupied) {
    const ok = await notify.confirm({
      title: '课程已有预分配',
      message: `「${occupied.title}」已预分配给「${occupied.teacherName}」。\n请先解除分配，再指定其他教师。`,
      okText: '去解除',
      cancelText: '知道了',
      danger: true,
      icon: 'lock',
    });
    if (ok) await revoke(occupied);
    return;
  }

  const teacher = selectedTeacher.value;
  const lockedHint = teacher?.contractValid
    ? '保存后课程将解锁。'
    : '本学期合同尚未生效，保存后为预分配（课程锁定），合同审核通过后自动解锁。';
  const ok = await notify.confirm({
    title: '确认预分配',
    message: `将课程预分配给「${teacher?.realName || teacher?.nickname}」。\n${lockedHint}\n预分配可随时解除，并不代表合同已签订。`,
    okText: '确认保存',
    icon: 'users',
  });
  if (!ok) return;

  saving.value = true;
  try {
    quote.value = await api.saveGrant(teacherId.value, {
      courseId: Number(courseId.value),
      baseFee: baseFee.value,
      mode: selectedTeacher.value?.organization ? mode.value : null,
      value: selectedTeacher.value?.organization ? value.value : null,
      visibility: selectedTeacher.value?.organization ? visibility.value : 'final',
      primary: true,
    });
    notify.success(
      quote.value?.locked
        ? '已预分配：课程待解锁，待本学期合同生效后自动解锁'
        : '已保存授权，课程已解锁',
    );
    await loadGrants();
  } catch (err) {
    notify.error(err.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function revoke(item) {
  const ok = await notify.confirm({
    title: '解除预分配',
    message: `确定解除「${item.title}」与教师「${item.teacherName}」的预分配？\n解除后可重新分配给其他教师。`,
    okText: '解除分配',
    danger: true,
    icon: 'unlock',
  });
  if (!ok) return;
  revoking.value = item.id;
  try {
    await api.revokeGrant(item.userId, item.courseId);
    notify.success(`已解除「${item.title}」的预分配`);
    if (String(courseId.value) === String(item.courseId) && String(teacherId.value) === String(item.userId)) {
      teacherId.value = '';
      quote.value = null;
    }
    await loadGrants();
  } catch (err) {
    notify.error(err.message || '解除失败');
  } finally {
    revoking.value = 0;
  }
}

async function loadGrants() {
  try {
    const data = await api.listGrants();
    grants.value = data.list || [];
    if (data.semesterName) semesterName.value = data.semesterName;
  } catch (err) {
    notify.error(err.message || '加载分配列表失败');
  }
}

async function load() {
  await run(async () => {
    const [courseData, faculty, grantData] = await Promise.all([
      api.courses({ page: 1, pageSize: 200, status: '1' }),
      api.faculty(),
      api.listGrants(),
    ]);
    courses.value = courseData.list || [];
    teachers.value = (faculty.list || []).filter((item) => item.certStatus === 'approved');
    semesterName.value = faculty.semesterName || grantData.semesterName || '';
    grants.value = grantData.list || [];
  });
}

onMounted(load);
</script>

<style scoped>
.assign-page { display: flex; flex-direction: column; gap: 14px; }
.assign-card { padding: 20px 22px 0; }
.sec {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 14px;
  color: #344054;
  font-size: 13px;
  font-weight: 700;
}
.sec :deep(svg) { width: 16px; height: 16px; color: #667085; }
.sec-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}
.sec-dot.orange {
  background: #f79009;
  box-shadow: 0 0 0 3px rgba(247, 144, 9, 0.16);
}

.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; margin-bottom: 14px; }
.fields.two { grid-template-columns: 1fr 1fr; margin: 0; }
.field-block { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.field-block > span { font-size: 13px; color: #344054; font-weight: 500; }
.field-block em { color: #ef4444; font-style: normal; }
.control {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}
.control > :deep(svg:first-child) {
  position: absolute; left: 12px; width: 16px; height: 16px; color: #98a2b3; pointer-events: none; z-index: 1;
}
.control :deep(.search-select) { flex: 1; min-width: 0; }
.control :deep(.select-search-trigger) {
  border: 0; background: transparent; box-shadow: none; height: 42px; padding-left: 36px; border-radius: 10px;
}
.control :deep(.select-search-trigger:hover),
.control :deep(.select-search-trigger:focus) {
  border: 0; background: transparent; box-shadow: none;
}
.control:focus-within {
  border-color: #93c5fd;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}
.control.money { padding-left: 36px; padding-right: 48px; }
.control .yen {
  position: absolute; left: 14px; font-style: normal; font-weight: 700; color: var(--primary); font-size: 14px;
}
.control .unit {
  position: absolute; right: 12px; color: var(--faint); font-size: 13px; pointer-events: none;
}
.control input {
  flex: 1; width: 100%; height: 42px; border: 0; outline: none; background: transparent;
  padding: 0 12px; border-radius: 10px; font: inherit; color: var(--text);
}
.control.money input { padding-left: 0; padding-right: 0; }
.help { display: block; margin-top: 6px; font-size: 12px; color: var(--muted); font-weight: 400; }

.teacher-card {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; margin: 0 0 12px;
  border: 1px solid #e8edf5; border-radius: 12px; background: #fff;
}
.teacher-avatar {
  width: 44px; height: 44px; border-radius: 12px; flex: none;
  display: grid; place-items: center;
  background: var(--primary-soft); color: var(--primary);
  font-weight: 700; font-size: 16px;
}
.teacher-info { min-width: 0; }
.teacher-info strong { display: block; font-size: 15px; font-weight: 650; color: var(--text); }
.teacher-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  margin-top: 6px; font-size: 12px; color: var(--muted);
}
.teacher-meta .tag { height: 22px; font-size: 11px; }

.contract-banner {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 14px 16px; margin: 0 0 20px;
  border-radius: 12px;
  background: #fffaf5;
  border: 1px solid #f5e6d3;
  color: #92400e;
}
.contract-banner.ok { background: #f3faf6; border-color: #d1fae5; color: #065f46; }
.contract-banner.pending { background: #f5f8ff; border-color: #dbe7ff; color: #1d4ed8; }
.banner-icon {
  width: 36px; height: 36px; border-radius: 10px; flex: none;
  display: grid; place-items: center;
  background: #fff; border: 1px solid rgba(0,0,0,.04);
}
.banner-icon :deep(svg) { width: 16px; height: 16px; }
.contract-banner strong { display: block; font-size: 13px; font-weight: 650; margin-bottom: 4px; color: inherit; }
.contract-banner p { margin: 0; font-size: 13px; line-height: 1.6; color: inherit; opacity: .92; }
.contract-banner small {
  display: block; margin-top: 6px; font-size: 12px; opacity: .8;
}

.fee-block { display: flex; flex-direction: column; gap: 12px; margin-bottom: 8px; max-width: 720px; }
.helper { margin: 0; font-size: 12px; color: #98a2b3; }
.org-note {
  grid-column: 1 / -1;
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #667085;
  padding: 8px 10px; border-radius: 10px; background: #f8fafc;
}
.org-note :deep(svg) { width: 14px; height: 14px; color: #98a2b3; }
.fee-flow {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 14px; border-radius: 12px;
  background: linear-gradient(135deg, #f8fbff, #f3f7ff);
  border: 1px solid #e0eaff;
}
.fee-flow div { display: flex; flex-direction: column; gap: 2px; min-width: 88px; }
.fee-flow small { color: #64748b; font-size: 11px; }
.fee-flow b { font-size: 15px; color: #0f172a; }
.fee-flow > span { color: #98a2b3; font-weight: 700; }

.card-foot {
  display: flex; justify-content: flex-end; gap: 8px;
  margin: 18px -22px 0; padding: 14px 22px;
  border-top: 1px solid var(--line); background: #fbfcfe;
  border-radius: 0 0 16px 16px;
}
.card-foot .btn { display: inline-flex; align-items: center; gap: 6px; }
.card-foot .btn :deep(svg) { width: 15px; height: 15px; }

.assign-list-card { padding: 18px 20px 12px; margin-top: 14px; }
.list-head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px;
}
.list-head h2 { margin: 0; font-size: 16px; }
.list-head .muted { margin-top: 4px; font-size: 12px; }
.list-head .btn { display: inline-flex; align-items: center; gap: 6px; }
.list-head .btn :deep(svg) { width: 14px; height: 14px; }
.tiny { font-size: 12px !important; }
.tag {
  display: inline-flex; margin: 0 4px 4px 0; padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 650; background: #f2f4f7; color: #475467;
}
.tag.ok { background: var(--green-soft); color: var(--green); }
.tag.warn { background: var(--amber-soft); color: var(--amber-text); }
.link.danger { color: var(--red); }
.empty.soft {
  margin: 8px 0 12px; padding: 28px 16px; text-align: center; color: #98a2b3;
  background: #fafbfc; border: 1px dashed var(--line); border-radius: 12px;
}

@media (max-width: 900px) {
  .fields, .fields.two { grid-template-columns: 1fr; }
}
</style>
