<template>
  <section class="assign-page">
    <div class="page-head">
      <div>
        <h1>预先排课</h1>
        <p>
          可预先把课程排给已实名认证的教师。预排可随时解除；
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
          <label class="field-block course-field">
            <span>课程 <em>*</em>（可多选）</span>
            <div class="control">
              <Icon name="book" />
              <SearchSelect
                v-model="courseIds"
                multiple
                :options="courseOptions"
                placeholder="请选择课程（可多选）"
                search-placeholder="搜索课程名称、学校、上课时间…"
                @change="onCourse"
              />
            </div>
            <ul v-if="selectedCourses.length" class="picked-courses">
              <li v-for="item in selectedCourses" :key="item.id">
                <div>
                  <strong>{{ item.title }}</strong>
                  <div class="muted tiny">{{ courseMetaText(item) }}</div>
                </div>
                <button type="button" class="link danger" @click="removeCourse(item.id)">移除</button>
              </li>
            </ul>
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

          <div v-if="selectedTeacher && selectedCourses.length" class="teacher-card">
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

        <div v-if="selectedTeacher && selectedCourses.length" class="contract-banner" :class="contractTone(selectedTeacher)">
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

        <template v-if="teacherId && selectedCourses.length">
          <div class="sec">
            <i class="sec-dot orange"></i>
            <Icon name="receipt" />
            <span>教师课时费</span>
          </div>

          <div class="fee-block">
            <div v-if="courseOrgBound" class="org-note">
              <Icon name="building" />
              <span>
                所选课程已承接机构：按「课时费 − 机构抽成 = 教师课时费」结算（校方价 − 课时费 为平台利润）；保存后教师会自动关联该机构，且只能看到最终课时费。
              </span>
            </div>

            <label class="field-block">
              <span>教师课时费{{ selectedCourses.length > 1 ? '（统一应用到所选课程）' : '' }}</span>
              <div class="control money">
                <em class="yen">¥</em>
                <input
                  v-model="baseFee"
                  type="number"
                  min="0"
                  step="0.01"
                  :readonly="courseOrgBound"
                  :placeholder="courseOrgBound ? '由课时费与机构抽成自动计算' : '请输入金额'"
                  @input="preview"
                />
                <span class="unit">/ 节</span>
              </div>
              <small class="help">
                <template v-if="courseOrgBound">
                  承接机构课程不在此改抽成；请到机构详情调整单课抽成。教师端只显示本课时费。
                </template>
                <template v-else>
                  默认取自课程设置的课时费；多选时若各课费用不同可在此统一填写，留空则每门课沿用各自课时费。
                </template>
              </small>
            </label>

            <template v-if="selectedTeacher?.organization && !courseOrgBound">
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
                  <small class="help">{{ modeHelp }}</small>
                </label>
                <label class="field-block">
                  <span>分佣值</span>
                  <div class="control">
                    <input v-model="value" type="number" min="0" step="0.01" @input="preview" />
                  </div>
                  <small class="help">{{ mode === 'fixed' ? '每节课机构固定分得的金额（元）' : '按教师课时费的百分比另计机构分佣，不从教师课时费里扣除' }}</small>
                </label>
                <label class="field-block vis-field">
                  <span>教师端金额可见</span>
                  <SearchSelect
                    v-model="visibility"
                    :options="visibilityOptions"
                    placeholder="选择教师能看到哪些金额"
                    search-placeholder="搜索可见规则…"
                    @change="preview"
                  />
                  <small class="help">{{ visibilityHelp }}</small>
                </label>
                <div class="org-note">
                  <Icon name="building" />
                  <span>{{ selectedTeacher.organization.name }} · 教师端课程/合同附件按上方规则展示金额</span>
                </div>
              </div>
            </template>
            <p v-else-if="!courseOrgBound" class="helper">未绑定机构，不设置机构分佣。</p>

            <div v-if="quote && quote.configured" class="fee-flow">
              <template v-if="quote.splitMode === 'course_org' || courseOrgBound">
                <div><small>课时费</small><b>¥{{ quote.baseFee ?? '—' }}</b></div>
                <span>−</span>
                <div><small>机构抽成</small><b>¥{{ quote.commission || 0 }}</b></div>
                <span>=</span>
                <div><small>教师课时费</small><b>¥{{ quote.teacherFee }}</b></div>
                <div><small>平台利润</small><b>¥{{ quote.platformAmount ?? '—' }}</b></div>
              </template>
              <template v-else>
                <div><small>教师课时费</small><b>¥{{ quote.teacherFee }}</b></div>
                <span>+</span>
                <div><small>机构分佣</small><b>¥{{ quote.commission || 0 }}</b></div>
                <span>=</span>
                <div><small>参考校方成本</small><b>¥{{ Number(quote.teacherFee || 0) + Number(quote.commission || 0) }}</b></div>
              </template>
            </div>
            <p v-else class="helper">还没有课时费，教师端不会显示金额。</p>
          </div>
        </template>

        <div class="card-foot">
          <button class="btn" type="button" :disabled="saving" @click="resetForm">取消</button>
          <button class="btn primary" type="button" :disabled="saving || !selectedCourses.length || !teacherId" @click="save">
            <Icon name="check" />
            {{ saving ? '保存中…' : (selectedCourses.length > 1 ? `保存授权（${selectedCourses.length} 门）` : '保存授权') }}
          </button>
        </div>
      </article>

      <article class="card assign-list-card">
        <div class="list-head">
          <div>
            <h2>当前预分配</h2>
            <p class="muted">
              {{ grantGroups.length }} 位教师 · {{ grants.length }} 门课 · 解除后可改派；合同链接需该教师本人登录后打开
            </p>
          </div>
          <button class="btn" type="button" @click="loadGrants"><Icon name="refresh" />刷新</button>
        </div>

        <div v-if="grantGroups.length" class="teacher-grant-list">
          <article v-for="group in grantGroups" :key="group.userId" class="teacher-grant">
            <div class="tg-head">
              <div class="tg-who">
                <span class="teacher-avatar sm">{{ (group.teacherName || '师').slice(0, 1) }}</span>
                <div>
                  <strong>{{ group.teacherName }}</strong>
                  <div class="muted tiny">{{ group.organizationName || '独立教师' }} · {{ group.courses.length }} 门课</div>
                </div>
              </div>
              <div class="tg-actions">
                <span v-if="group.contractPending" class="tag">合同待审</span>
                <span v-else-if="group.contractValid" class="tag ok">合同有效</span>
                <span v-else class="tag warn">本学期未签</span>
                <button
                  class="btn"
                  type="button"
                  :title="'复制后发给该教师，需其本人登录后才能签订'"
                  @click="copyContractLink(group)"
                >
                  <Icon name="link" />
                  {{ group.contractValid ? '复制合同页' : '复制签订链接' }}
                </button>
                <router-link class="btn ghost" :to="`/faculty/${group.userId}`">资料</router-link>
              </div>
            </div>

            <ul class="tg-courses">
              <li v-for="item in group.courses" :key="item.id">
                <div class="tg-course-main">
                  <strong>{{ item.title }}</strong>
                  <div class="muted tiny">{{ item.school || '—' }}</div>
                </div>
                <div class="tg-course-meta">
                  <span class="tag" :class="item.locked ? 'warn' : 'ok'">{{ item.locked ? '待解锁' : '已解锁' }}</span>
                  <span class="fee">{{ item.baseFee == null ? '课时费 —' : `¥${item.baseFee}/节` }}</span>
                  <button class="link danger" type="button" :disabled="revoking === item.id" @click="revoke(item)">
                    {{ revoking === item.id ? '解除中…' : '解除' }}
                  </button>
                </div>
              </li>
            </ul>
          </article>
        </div>
        <p v-else class="empty soft">暂无预分配记录，请在上方选择课程与教师后保存</p>
      </article>
    </PageLoad>
    <TeacherChangeDialog
      :open="!!teacherChange"
      :items="teacherChange?.items || []"
      :note="teacherChange?.note || ''"
      :error="teacherChange?.error || ''"
      :saving="saving || !!revoking"
      @close="teacherChange = null"
      @confirm="confirmTeacherChange"
    />
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { api } from '../api';
import { notify } from '../notify';
import Icon from '../components/Icon.vue';
import PageLoad from '../components/PageLoad.vue';
import SearchSelect from '../components/SearchSelect.vue';
import TeacherChangeDialog from '../components/TeacherChangeDialog.vue';
import { usePageLoad } from '../composables/usePageLoad';

const courses = ref([]);
const teachers = ref([]);
const grants = ref([]);
const semesterName = ref('');
const courseIds = ref([]);
const teacherId = ref('');
const teacherChange = ref(null);
const baseFee = ref('');
const mode = ref('percent');
const value = ref(10);
const visibility = ref('final');
const quote = ref(null);
const saving = ref(false);
const revoking = ref(0);
const { loading, ready, error, run, bindLoad } = usePageLoad();

const WEEKDAY = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const modeOptions = [
  {
    value: 'percent',
    title: '按课时费比例 %',
    hint: '机构分佣 = 教师课时费 × 比例；分佣另计，不扣教师所得',
  },
  {
    value: 'fixed',
    title: '固定金额 / 节',
    hint: '每节课机构固定分得一笔金额；同样不从教师课时费扣除',
  },
];
const visibilityOptions = [
  {
    value: 'final',
    title: '只看自己的课时费',
    hint: '教师端只显示「课时费 ¥xx」；看不到机构分佣明细',
  },
  {
    value: 'hidden',
    title: '完全不显示金额',
    hint: '教师端不展示任何费用数字，仅显示「课时费未开放」',
  },
];

const modeHelp = computed(() => {
  if (mode.value === 'fixed') return '固定金额：每上一节课，机构另得设定金额；教师课时费全额归教师。';
  return '比例分佣：机构分佣按教师课时费百分比另算；教师课时费全额归教师，不会被扣减。';
});

const visibilityHelp = computed(() => {
  if (visibility.value === 'hidden') {
    return '示例：教师端不显示金额。适合费用另行线下沟通、不想在 App/小程序露出数字时。';
  }
  return '示例：教师只看到「课时费 ¥100」。机构分佣仅后台可见；机构设为「不看金额」时此处无法放开。';
});

const selectedTeacher = computed(() => teachers.value.find((item) => String(item.id) === String(teacherId.value)) || null);
const selectedCourses = computed(() => {
  const set = new Set((courseIds.value || []).map(String));
  return courses.value.filter((item) => set.has(String(item.id)));
});
const courseOrgBound = computed(() => selectedCourses.value.some((item) => !!item.organizationId));

/** 已有主预分配的课程不可再选，解除后才回到选项里 */
const assignedCourseIds = computed(() => new Set(
  grants.value.filter((g) => g.primary).map((g) => String(g.courseId)),
));

function courseTimeText(item) {
  if (!item) return '时间未设';
  if (item.scheduleText) return item.scheduleText;
  const day = item.weekday ? WEEKDAY[item.weekday] || '' : '';
  let time = '';
  if (item.startTime) {
    time = item.endTime ? `${item.startTime}-${item.endTime}` : item.startTime;
  }
  const text = [day, time].filter(Boolean).join(' ');
  return text || '时间未设';
}

function courseMetaText(item) {
  const school = item.school || '学校未填';
  const fee = item.sessionFee != null ? `课时费 ¥${item.sessionFee}` : '课时费未设';
  return `${school} · ${courseTimeText(item)} · ${fee}`;
}

const courseOptions = computed(() => courses.value
  .filter((item) => !assignedCourseIds.value.has(String(item.id)))
  .map((item) => ({
    value: String(item.id),
    title: item.title,
    hint: courseMetaText(item),
    search: `${item.title} ${item.school || ''} ${courseTimeText(item)} ${item.gradeLabel || ''}`,
  })));

const teacherOptions = computed(() => teachers.value.map((item) => ({
  value: String(item.id),
  title: item.realName || item.nickname,
  hint: `${item.organization?.name || '独立教师'} · ${contractLabel(item)}`,
  phone: item.phone || '',
  teacherNo: item.teacherNo || '',
  search: `${item.realName || ''} ${item.nickname || ''} ${item.phone || ''} ${item.organization?.name || ''} ${contractLabel(item)}`,
})));

/** 同一教师的多门课合并展示 */
const grantGroups = computed(() => {
  const map = new Map();
  for (const item of grants.value) {
    if (!item.primary) continue;
    const key = String(item.userId);
    let group = map.get(key);
    if (!group) {
      group = {
        userId: item.userId,
        teacherName: item.teacherName,
        organizationName: item.organizationName || '',
        contractValid: !!item.contractValid,
        contractPending: !!item.contractPending,
        contractDue: !!item.contractDue,
        courses: [],
      };
      map.set(key, group);
    }
    group.courses.push(item);
  }
  return [...map.values()].sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'zh'));
});

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
  courseIds.value = [];
  teacherId.value = '';
  baseFee.value = '';
  quote.value = null;
}

function removeCourse(id) {
  courseIds.value = courseIds.value.filter((item) => String(item) !== String(id));
  onCourse();
}

/** 从所选课程带入课时费 */
function applyFeeFromCourses() {
  const list = selectedCourses.value;
  if (!list.length) {
    baseFee.value = '';
    return;
  }
  // 承接机构课程：课时费 − 机构抽成（抽成按课时费计算）
  if (list.every((item) => item.organizationId)) {
    const fees = list.map((item) => {
      const fee = Number(item.sessionFee || 0);
      const mode = item.orgCommissionMode || 'fixed';
      const raw = Number(item.orgCommissionValue || 0);
      const commission = Math.min(fee, mode === 'percent' ? fee * raw / 100 : raw);
      return Math.max(0, Math.round((fee - commission) * 100) / 100);
    });
    const same = fees.every((n) => n === fees[0]);
    baseFee.value = same ? String(fees[0]) : '';
    visibility.value = 'final';
    return;
  }
  const fees = list
    .map((item) => (item.sessionFee == null || item.sessionFee === '' ? null : Number(item.sessionFee)))
    .filter((n) => n != null && !Number.isNaN(n));
  if (!fees.length) {
    baseFee.value = '';
    return;
  }
  const same = fees.every((n) => n === fees[0]);
  baseFee.value = same ? String(fees[0]) : '';
}

function onCourse() {
  // 过滤掉已预分配残留
  courseIds.value = (courseIds.value || []).filter((id) => !assignedCourseIds.value.has(String(id)));
  applyFeeFromCourses();
  if (teacherId.value && selectedCourses.value.length) preview();
  else quote.value = null;
}

function onTeacher() {
  const teacher = selectedTeacher.value;
  visibility.value = 'final';
  if (!teacher?.organization) {
    mode.value = 'percent';
    value.value = 0;
  }
  if (selectedCourses.value.length && (baseFee.value === '' || baseFee.value == null)) {
    applyFeeFromCourses();
  }
  preview();
}

async function copyContractLink(group) {
  // for=教师id：其他人登录打开会提示无权；合同内容始终按登录账号本人读取
  const url = `${window.location.origin}/m/contract?for=${group.userId}`;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else {
      const input = document.createElement('textarea');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    notify.success(`已复制「${group.teacherName}」的签订链接（仅该教师本人可签）`);
  } catch {
    notify.error(`复制失败，请手动复制：${url}`);
  }
}

async function preview() {
  if (!teacherId.value) return;
  try {
    const first = selectedCourses.value[0];
    if (first?.organizationId) {
      quote.value = await api.feePreview({
        courseOrg: '1',
        schoolPrice: first.price,
        sessionFee: first.sessionFee ?? '',
        mode: first.orgCommissionMode || 'fixed',
        value: first.orgCommissionValue ?? 0,
      });
      if (quote.value?.teacherFee != null) baseFee.value = String(quote.value.teacherFee);
      return;
    }
    quote.value = await api.feePreview({
      baseFee: baseFee.value,
      hasOrg: selectedTeacher.value?.organization ? '1' : '0',
      mode: mode.value,
      value: value.value,
      visibility: visibility.value,
      schoolPrice: first?.price,
    });
  } catch (err) {
    notify.error(err.message || '预览失败');
  }
}

async function save() {
  if (!selectedCourses.value.length || !teacherId.value) {
    notify.warn('请先选择课程和教师');
    return;
  }

  const teacher = selectedTeacher.value;
  const lockedHint = teacher?.contractValid
    ? '保存后课程将解锁。'
    : '本学期合同尚未生效，保存后为预分配（课程锁定），合同审核通过后自动解锁。';
  const changing = selectedCourses.value.filter((item) => String(item.teacherId || '') !== String(teacherId.value));
  if (changing.length) {
    teacherChange.value = {
      kind: 'assign',
      error: '',
      note: `${lockedHint}预分配可随时解除，并不代表合同已签订。`,
      items: changing.map((item) => ({
        courseId: Number(item.id),
        title: item.title,
        fromName: item.teacher ? (item.teacher.teacherCert?.realName || item.teacher.nickname || '') : '',
        toName: teacher?.realName || teacher?.nickname || '新老师',
      })),
    };
    return;
  }
  const names = selectedCourses.value.map((item) => item.title).join('、');
  const ok = await notify.confirm({
    title: '确认预分配',
    message: `将 ${selectedCourses.value.length} 门课程（${names}）预分配给「${teacher?.realName || teacher?.nickname}」。\n${lockedHint}\n预分配可随时解除，并不代表合同已签订。`,
    okText: '确认保存',
    icon: 'users',
  });
  if (!ok) return;
  await commitSave();
}

async function confirmTeacherChange(from) {
  const state = teacherChange.value;
  if (!state) return;
  const ok = state.kind === 'revoke' ? await commitRevoke(state.item, from) : await commitSave(from);
  if (ok) teacherChange.value = null;
}

async function commitSave(teacherFrom) {
  saving.value = true;
  try {
    let locked = false;
    for (const course of selectedCourses.value) {
      const fee = baseFee.value !== '' && baseFee.value != null
        ? baseFee.value
        : (course.sessionFee == null ? '' : String(course.sessionFee));
      const result = await api.saveGrant(teacherId.value, {
        courseId: Number(course.id),
        baseFee: fee,
        mode: course.organizationId
          ? (course.orgCommissionMode || 'fixed')
          : (selectedTeacher.value?.organization ? mode.value : null),
        value: course.organizationId
          ? (course.orgCommissionValue ?? 0)
          : (selectedTeacher.value?.organization ? value.value : null),
        visibility: course.organizationId ? 'final' : (selectedTeacher.value?.organization ? visibility.value : 'final'),
        primary: true,
        teacherFrom,
      });
      quote.value = result;
      if (result?.locked) locked = true;
    }
    notify.success(
      locked
        ? `已预分配 ${selectedCourses.value.length} 门课：待本学期合同生效后自动解锁`
        : `已保存 ${selectedCourses.value.length} 门课授权`,
    );
    resetForm();
    await load();
    return true;
  } catch (err) {
    if (teacherChange.value) teacherChange.value.error = err.message || '保存失败';
    else notify.error(err.message || '保存失败');
    return false;
  } finally {
    saving.value = false;
  }
}

async function revoke(item) {
  if (item.primary) {
    teacherChange.value = {
      kind: 'revoke',
      item,
      error: '',
      note: '解除后课程变为未安排，可重新分配给其他教师。',
      items: [{ courseId: item.courseId, title: item.title, fromName: item.teacherName, toName: '' }],
    };
    return;
  }
  const ok = await notify.confirm({
    title: '解除预分配',
    message: `确定解除「${item.title}」与教师「${item.teacherName}」的预分配？\n解除后可重新分配给其他教师。`,
    okText: '解除分配',
    danger: true,
    icon: 'unlock',
  });
  if (!ok) return;
  await commitRevoke(item);
}

async function commitRevoke(item, from) {
  revoking.value = item.id;
  try {
    await api.revokeGrant(item.userId, item.courseId, from);
    notify.success(`已解除「${item.title}」的预分配`);
    if (courseIds.value.some((id) => String(id) === String(item.courseId))
      && String(teacherId.value) === String(item.userId)) {
      courseIds.value = courseIds.value.filter((id) => String(id) !== String(item.courseId));
      quote.value = null;
    }
    await load();
    return true;
  } catch (err) {
    if (teacherChange.value) teacherChange.value.error = err.message || '解除失败';
    else notify.error(err.message || '解除失败');
    return false;
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

bindLoad(load);
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
.vis-field { grid-column: 1 / -1; }
.course-field { grid-column: 1 / -1; }
.field-block { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.field-block > span { font-size: 13px; color: #344054; font-weight: 500; }
.picked-courses {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.picked-courses li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e7edf5;
  border-radius: 10px;
  background: #f8fafc;
}
.picked-courses strong { font-size: 13px; }
.picked-courses .link { flex-shrink: 0; border: 0; background: none; cursor: pointer; font-size: 12px; }
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
.teacher-grant-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 8px; }
.teacher-grant {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
}
.tg-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  background: #f8fafc;
  border-bottom: 1px solid var(--line);
}
.tg-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tg-who strong { font-size: 14px; }
.teacher-avatar.sm {
  width: 36px; height: 36px; font-size: 14px;
}
.tg-actions {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.tg-actions .btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 10px; font-size: 12px;
}
.tg-actions .btn :deep(svg) { width: 14px; height: 14px; }
.tg-actions .btn.ghost {
  background: transparent;
  border: 1px solid var(--line);
  color: #475467;
}
.tg-courses { list-style: none; margin: 0; padding: 0; }
.tg-courses li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-top: 1px solid #f1f5f9;
}
.tg-courses li:first-child { border-top: 0; }
.tg-course-main strong { font-size: 13px; }
.tg-course-meta {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.tg-course-meta .fee { font-size: 13px; color: #334155; font-variant-numeric: tabular-nums; }
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
