<template>
  <section>
    <div class="page-head">
      <div>
        <h1>教师收益</h1>
        <p>按月统计教师课程收入、应得分成与对平台利润贡献</p>
      </div>
      <div class="actions">
        <select v-model="month" @change="load">
          <option v-for="item in monthOptions" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="6" @retry="load">
      <article class="card">
        <table>
          <thead>
            <tr>
              <th>教师</th>
              <th>课程数量</th>
              <th>订单数</th>
              <th>总收入</th>
              <th>教师所得</th>
              <th>平台利润贡献</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.teacherId">
              <td>{{ item.name }}</td>
              <td>{{ item.courseCount }}</td>
              <td>{{ item.orderCount }}</td>
              <td>{{ money(item.totalAmount) }}</td>
              <td>{{ money(item.teacherAmount) }}</td>
              <td>{{ money(item.platformAmount) }}</td>
              <td class="col-actions">
                <button class="link" type="button" @click="openDetail(item.teacherId)">详情</button>
              </td>
            </tr>
            <tr v-if="!list.length"><td colspan="7" class="empty">本月暂无教师收益</td></tr>
          </tbody>
        </table>
      </article>
    </PageLoad>

    <PageModal :open="!!detail" size="narrow" :title="detail?.name || '教师收益'" icon="users" @close="detail = null">
      <div v-if="detail" class="kv">
        <span>本月课程</span><div>{{ detail.courses?.map((c) => c.title).join('、') || '—' }}</div>
        <span>总课时</span><div>{{ detail.lessonCount || 0 }}</div>
        <span>课程产生收入</span><div>{{ money(detail.totalAmount) }}</div>
        <span>教师所得</span><div>{{ money(detail.teacherAmount) }}</div>
        <span>平台贡献利润</span><div>{{ money(detail.platformAmount) }}</div>
      </div>
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
    list.value = await api.financeTeachers({ month: month.value });
  });
}

async function openDetail(id) {
  detail.value = await api.financeTeacher(id, { month: month.value });
}

onMounted(load);
</script>
