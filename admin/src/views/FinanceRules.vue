<template>
  <section>
    <div class="page-head">
      <div>
        <h1>收益规则</h1>
        <p>按课程配置教师 / 机构分成。订单支付时写入快照，之后改规则不影响历史订单。</p>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="8" @retry="load">
      <article class="card">
        <table>
          <thead>
            <tr>
              <th>课程</th>
              <th>价格</th>
              <th>教师分成</th>
              <th>机构分成</th>
              <th>预估教师</th>
              <th>预估机构</th>
              <th>预估平台</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.id">
              <td>
                <strong>{{ item.title }}</strong>
                <div class="muted">{{ item.teacherName }} · {{ item.school || '未绑定学校' }}</div>
              </td>
              <td>{{ money(item.price) }}</td>
              <td>{{ modeText(item.teacherShareMode, item.teacherShareValue, 'teacher') }}</td>
              <td>{{ modeText(item.institutionShareMode, item.institutionShareValue, 'org') }}</td>
              <td>{{ money(item.preview?.teacherAmount) }}</td>
              <td>{{ money(item.preview?.institutionAmount) }}</td>
              <td>{{ money(item.preview?.platformAmount) }}</td>
              <td class="col-actions">
                <button class="link" type="button" @click="edit(item)">编辑</button>
              </td>
            </tr>
            <tr v-if="!list.length"><td colspan="8" class="empty">暂无课程</td></tr>
          </tbody>
        </table>
      </article>
    </PageLoad>

    <PageModal :open="!!form" size="narrow" title="编辑收益规则" icon="gear" @close="form = null">
      <form v-if="form" class="form-grid" @submit.prevent="save">
        <label>
          教师分成方式
          <select v-model="form.teacherShareMode">
            <option value="percent">按课程收入比例</option>
            <option value="fixed">固定金额</option>
            <option value="per_lesson">按课时</option>
          </select>
        </label>
        <label>
          教师分成值
          <input v-model.number="form.teacherShareValue" type="number" min="0" step="0.01" required />
        </label>
        <label>
          机构分成方式
          <select v-model="form.institutionShareMode">
            <option value="percent">按课程收入比例</option>
            <option value="fixed">固定金额</option>
            <option value="per_student">按学生人数</option>
            <option value="per_lesson">按课时</option>
          </select>
        </label>
        <label>
          机构分成值
          <input v-model.number="form.institutionShareValue" type="number" min="0" step="0.01" required />
        </label>
        <p class="muted">比例模式填写百分数，例如 50 表示 50%。按课时/人数时填写单价。</p>
        <div class="actions">
          <button class="btn" type="button" @click="form = null">取消</button>
          <button class="btn primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </form>
    </PageModal>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { money } from '../format';
import PageLoad from '../components/PageLoad.vue';
import PageModal from '../components/PageModal.vue';
import { usePageLoad } from '../composables/usePageLoad';

const list = ref([]);
const form = ref(null);
const saving = ref(false);
const { loading, ready, error, run } = usePageLoad();

function modeText(mode, value, kind) {
  if (mode === 'fixed') return `固定 ¥${value}`;
  if (mode === 'per_lesson') return `¥${value}/课时`;
  if (mode === 'per_student') return `¥${value}/人`;
  return `${value}%${kind === 'teacher' ? ' 教师' : ''}`;
}

function edit(item) {
  form.value = {
    id: item.id,
    teacherShareMode: item.teacherShareMode || 'percent',
    teacherShareValue: item.teacherShareValue ?? 50,
    institutionShareMode: item.institutionShareMode || 'percent',
    institutionShareValue: item.institutionShareValue ?? 20,
  };
}

async function load() {
  await run(async () => {
    list.value = await api.financeRules();
  });
}

async function save() {
  saving.value = true;
  try {
    await api.financeSaveRule(form.value.id, form.value);
    alert('已保存');
    form.value = null;
    await load();
  } catch (e) {
    alert(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.form-grid { display: grid; gap: 12px; }
.form-grid label { display: grid; gap: 6px; font-size: 13px; color: #475467; }
.form-grid input, .form-grid select { height: 40px; padding: 0 10px; border: 1px solid #d0d5dd; border-radius: 10px; }
</style>
