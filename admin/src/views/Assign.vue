<template>
  <section>
    <div class="page-head">
      <div>
        <h1>教师分配</h1>
        <p>只显示已签订合同的认证教师。未签订的不能安排课程，也不能抢课。</p>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <article class="card card-pad">
      <div class="form-row">
        <label>课程
          <select v-model="courseId" @change="preview">
            <option value="">请选择</option>
            <option v-for="item in courses" :key="item.id" :value="String(item.id)">{{ item.title }}</option>
          </select>
        </label>
        <label>教师
          <select v-model="teacherId" @change="onTeacher">
            <option value="">请选择认证教师</option>
            <option v-for="item in teachers" :key="item.id" :value="String(item.id)">{{ item.realName || item.nickname }} · {{ item.organization?.name || '独立教师' }}</option>
          </select>
        </label>
      </div>
      <div v-if="teacherId" class="fee-box">
        <p>{{ selectedTeacher?.organization?.name || '未绑定机构，不设置机构分佣' }}</p>
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
  try {
    quote.value = await api.saveGrant(teacherId.value, {
      courseId: Number(courseId.value),
      baseFee: baseFee.value,
      mode: selectedTeacher.value?.organization ? mode.value : null,
      value: selectedTeacher.value?.organization ? value.value : null,
      visibility: selectedTeacher.value?.organization ? visibility.value : 'final',
      primary: true,
    });
    error.value = '已按服务端结果保存';
  } catch (err) {
    error.value = err.message;
  }
}
onMounted(async () => {
  const [courseData, faculty] = await Promise.all([api.courses({ page: 1, pageSize: 100, status: '1' }), api.faculty()]);
  courses.value = courseData.list;
  teachers.value = faculty.list.filter((item) => item.certStatus === 'approved' && item.contractSigned);
});
</script>
