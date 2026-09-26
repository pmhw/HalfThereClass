<template>
  <section>
    <div class="page-head">
      <div>
        <h1>月度收益</h1>
        <p>按月 / 季度 / 年度查看收入、分成与平台利润</p>
      </div>
      <div class="actions">
        <select v-model="year" @change="load">
          <option v-for="y in years" :key="y" :value="y">{{ y }}年</option>
        </select>
        <select v-model="group" @change="load">
          <option value="month">按月</option>
          <option value="quarter">按季度</option>
          <option value="year">按年度</option>
        </select>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="7" @retry="load">
      <article class="card">
        <table>
          <thead>
            <tr>
              <th>周期</th>
              <th>总收入</th>
              <th>教师所得</th>
              <th>机构所得</th>
              <th>平台利润</th>
              <th>利润率</th>
              <th>状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.key">
              <td>{{ item.key }}</td>
              <td>{{ money(item.totalAmount) }}</td>
              <td>{{ money(item.teacherAmount) }}</td>
              <td>{{ money(item.institutionAmount) }}</td>
              <td>{{ money(item.platformAmount) }}</td>
              <td>{{ item.profitRate || 0 }}%</td>
              <td>{{ statusText(item.settlementStatus) }}</td>
              <td class="col-actions">
                <button v-if="item.month" class="link" type="button" @click="openMonth(item.month)">课程明细</button>
              </td>
            </tr>
            <tr v-if="!list.length"><td colspan="8" class="empty">暂无数据</td></tr>
          </tbody>
        </table>
      </article>
    </PageLoad>

    <PageModal :open="!!detailMonth" size="wide" :title="`${detailMonth || ''} 课程利润`" icon="chart" @close="detailMonth = ''">
      <table>
        <thead>
          <tr>
            <th>课程</th>
            <th>学校/机构</th>
            <th>课次</th>
            <th>学员数</th>
            <th>总收入</th>
            <th>教师所得</th>
            <th>机构所得</th>
            <th>平台利润</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in courses" :key="item.courseId">
            <td>{{ item.title }}</td>
            <td>{{ item.school }}</td>
            <td>{{ item.lessonCount }}</td>
            <td>{{ item.studentCount }}</td>
            <td>{{ money(item.totalAmount) }}</td>
            <td>{{ money(item.teacherAmount) }}</td>
            <td>{{ money(item.institutionAmount) }}</td>
            <td>{{ money(item.platformAmount) }}</td>
          </tr>
          <tr v-if="!courses.length"><td colspan="8" class="empty">该月暂无课程收益</td></tr>
        </tbody>
      </table>
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

const year = ref(new Date().getFullYear());
const years = Array.from({ length: 5 }, (_, i) => year.value - i);
const group = ref('month');
const list = ref([]);
const detailMonth = ref('');
const courses = ref([]);
const { loading, ready, error, run } = usePageLoad();

function statusText(s) {
  return ({ open: '进行中', pending: '待结算', settled: '已结算' })[s] || '—';
}

async function load() {
  await run(async () => {
    list.value = await api.financeMonthly({ year: year.value, group: group.value });
  });
}

async function openMonth(month) {
  detailMonth.value = month;
  courses.value = await api.financeMonthCourses(month);
}

onMounted(load);
</script>
