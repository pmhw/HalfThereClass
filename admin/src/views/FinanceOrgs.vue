<template>
  <section>
    <div class="page-head">
      <div>
        <h1>机构收益</h1>
        <p>按月统计合作机构课程收入与机构所得</p>
      </div>
      <div class="actions">
        <select v-model="month" @change="load">
          <option v-for="item in monthOptions" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="5" @retry="load">
      <article class="card">
        <table>
          <thead>
            <tr>
              <th>机构</th>
              <th>合作课程</th>
              <th>总收入</th>
              <th>机构所得</th>
              <th>平台利润</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.organizationId">
              <td>{{ item.name }}</td>
              <td>{{ item.courseCount }}</td>
              <td>{{ money(item.totalAmount) }}</td>
              <td>{{ money(item.institutionAmount) }}</td>
              <td>{{ money(item.platformAmount) }}</td>
              <td class="col-actions">
                <button class="link" type="button" @click="openDetail(item.organizationId)">课程明细</button>
              </td>
            </tr>
            <tr v-if="!list.length"><td colspan="6" class="empty">本月暂无机构收益</td></tr>
          </tbody>
        </table>
      </article>
    </PageLoad>

    <PageModal :open="!!detail" size="wide" :title="detail?.name || '机构收益'" icon="folder" @close="detail = null">
      <table v-if="detail">
        <thead>
          <tr>
            <th>课程</th>
            <th>学校</th>
            <th>学员数</th>
            <th>总收入</th>
            <th>机构所得</th>
            <th>平台利润</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in detail.courses || []" :key="item.courseId">
            <td>{{ item.title }}</td>
            <td>{{ item.school }}</td>
            <td>{{ item.studentCount }}</td>
            <td>{{ money(item.totalAmount) }}</td>
            <td>{{ money(item.institutionAmount) }}</td>
            <td>{{ money(item.platformAmount) }}</td>
          </tr>
          <tr v-if="!(detail.courses || []).length"><td colspan="6" class="empty">暂无课程</td></tr>
        </tbody>
      </table>
    </PageModal>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { money } from '../format';
import PageLoad from '../components/PageLoad.vue';
import PageModal from '../components/PageModal.vue';
import { usePageLoad } from '../composables/usePageLoad';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const month = ref(currentMonth());
const monthOptions = computed(() => {
  const list = [];
  const now = new Date();
  for (let i = 0; i < 18; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return list;
});

const list = ref([]);
const detail = ref(null);
const { loading, ready, error, run } = usePageLoad();

async function load() {
  await run(async () => {
    list.value = await api.financeOrgs({ month: month.value });
  });
}

async function openDetail(id) {
  detail.value = await api.financeOrg(id, { month: month.value });
}

onMounted(load);
</script>
