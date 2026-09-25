<template>
  <section>
    <div class="page-head">
      <div>
        <h1>教师分配</h1>
        <p>可预分配给已实名认证的教师。若本学期合同未生效，课程会锁定，教师端仅可见课时费；合同审核通过后自动解锁时间安排，并写入合同附件。</p>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="ok-tip">{{ notice }}</p>
    <article class="card card-pad">
      <div class="form-row">
        <label class="field pick">课程
          <select v-model="courseId" @change="preview">
            <option value="">请选择</option>
            <option v-for="item in courses" :key="item.id" :value="String(item.id)">{{ item.title }}</option>
          </select>
        </label>
        <label class="field pick">教师
          <select v-model="teacherId" @change="onTeacher">
            <option value="">请选择认证教师</option>
            <option v-for="item in teachers" :key="item.id" :value="String(item.id)">
              {{ item.realName || item.nickname }} · {{ item.organization?.name || '独立教师' }}
              {{ item.contractSigned ? '' : ' · 未签合同(预分配)' }}
            </option>
          </select>
        </label>
      </div>
      <div v-if="teacherId" class="fee-box">
        <p>{{ selectedTeacher?.organization?.name || '未绑定机构，不设置机构分佣' }}</p>
        <p v-if="selectedTeacher && !selectedTeacher.contractSigned" class="warn-tip">
          该教师本学期合同未生效：保存后课程处于「未解锁」，写入待签合同附件；老师签完并通过审核后自动解锁。
        </p>
        <label>课程标准课时费<input v-model="baseFee" type="number" min="0" step="0.01" @input="preview" /></label>
        <template v-if="selectedTeacher?.organization">
          <label>分佣方式
            <select v-model="mode" @change="preview">
              <option value="percent">按比例 %</option>
              <option value="fixed">固定金额</option>
            </select>
          </label>
          <label>分佣值<input v-model="value" type="number" min="0" step="0.01" @input="preview" /></label>
          <label>教师可见
            <select v-model="visibility" @change="preview">
              <option value="final">只看最终课时费</option>
              <option value="full">看完整费用</option>
              <option value="hidden">不看金额</option>
            </select>
          </label>
        </template>
        <div v-if="quote && quote.configured" class="fee-flow">
          <div><small>课程费用</small><b>¥{{ quote.baseFee }}</b></div>
          <span>↓</span>
          <div><small>机构分佣</small><b>- ¥{{ quote.commission }}</b></div>
          <span>↓</span>
          <div><small>教师实得</small><b>¥{{ quote.teacherFee }}</b></div>
        </div>
        <p v-else class="muted">还没有课时费，教师端不会显示金额。</p>
        <button class="btn primary" type="button" @click="save">保存授权</button>
      </div>
      <p v-else class="empty">先选择课程和认证教师</p>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';

const courses = ref([]);
const teachers = ref([]);
const courseId = ref('');
const teacherId = ref('');
const baseFee = ref('');
const mode = ref('percent');
const value = ref(10);
const visibility = ref('final');
const quote = ref(null);
const error = ref('');
const notice = ref('');
const selectedTeacher = computed(() => teachers.value.find((item) => String(item.id) === teacherId.value) || null);

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
    error.value = err.message;
  }
}
async function save() {
  error.value = '';
  notice.value = '';
  try {
    quote.value = await api.saveGrant(teacherId.value, {
      courseId: Number(courseId.value),
      baseFee: baseFee.value,
      mode: selectedTeacher.value?.organization ? mode.value : null,
      value: selectedTeacher.value?.organization ? value.value : null,
      visibility: selectedTeacher.value?.organization ? visibility.value : 'final',
      primary: true,
    });
    notice.value = quote.value?.locked
      ? '已预分配：课程未解锁，待教师签订本学期合同并审核通过后解锁'
      : '已保存授权，课程已解锁';
  } catch (err) {
    error.value = err.message;
  }
}
onMounted(async () => {
  const [courseData, faculty] = await Promise.all([api.courses({ page: 1, pageSize: 100, status: '1' }), api.faculty()]);
  courses.value = courseData.list;
  teachers.value = faculty.list.filter((item) => item.certStatus === 'approved');
});
</script>

<style scoped>
.warn-tip {
  background: #fff7ed;
  color: #9a3412;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 8px 0 12px;
  font-size: 13px;
  line-height: 1.5;
}
</style>
