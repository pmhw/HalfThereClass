<template>
  <section>
    <div class="page-head">
      <div>
        <h1>收益规则</h1>
        <p>平台利润 = 校方价格 − 教师课时费 − 机构分佣。机构分佣在「机构管理」配置；此处可调整课程价格与课时费。</p>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="8" @retry="load">
      <article class="card">
        <table>
          <thead>
            <tr>
              <th>课程</th>
              <th>校方价格</th>
              <th>课时费</th>
              <th>机构 / 分佣</th>
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
              <td>{{ item.sessionFee == null ? '未配置' : money(item.sessionFee) }}</td>
              <td>
                <div>{{ item.organizationName }}</div>
                <div class="muted">{{ commissionText(item) }}</div>
              </td>
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

    <PageModal :open="!!form" size="narrow" title="编辑课程收益参数" icon="gear" @close="form = null">
      <form v-if="form" class="form-grid" @submit.prevent="save">
        <label>
          校方价格（元/课时）
          <input v-model.number="form.price" type="number" min="0" step="0.01" required />
        </label>
        <label>
          教师课时费（元/节）
          <input v-model="form.sessionFee" type="number" min="0" step="0.01" />
        </label>
        <p class="muted">
          机构分佣请到「机构管理」设置。全职分佣一般为 0，利润 = 校方价格 − 课时费；
          兼职固定抽成时，利润 = 校方价格 − 课时费 − 分佣值。一般定价使校方价格 ≈ 课时费 + 分佣。
        </p>
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

function commissionText(item) {
  if (!item.commissionMode) return '无分佣';
  if (item.commissionMode === 'fixed') return `固定 ¥${item.commissionValue}/节`;
  return `${item.commissionValue}%`;
}

function edit(item) {
  form.value = {
    id: item.id,
    price: item.price ?? 0,
    sessionFee: item.sessionFee ?? '',
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
