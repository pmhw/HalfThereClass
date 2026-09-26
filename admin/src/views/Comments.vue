<template>
  <section>
    <div class="page-head"><div><h1>评价管理</h1><p>学员购买课程后提交的评分和评价</p></div></div>
    <PageLoad
      :loading="loading"
      :ready="ready"
      :error="error"
      :columns="6"
      filters
      @retry="load"
    >
    <div class="toolbar">
      <div class="field"><input v-model="keyword" placeholder="搜索评价、课程或用户" @keyup.enter="reload" /></div>
      <button class="btn" @click="reload">搜索</button>
    </div>
    <article class="card">
      <table>
        <thead><tr><th>用户</th><th>课程</th><th>评分</th><th>内容</th><th>匿名</th><th>时间</th></tr></thead>
        <tbody>
          <tr v-for="item in result.list" :key="item.id">
            <td>{{ item.isAnonymous ? '匿名用户' : (item.user?.nickname || '—') }}</td>
            <td>{{ item.course?.title || '—' }}</td>
            <td>{{ item.rating }} 分</td>
            <td>{{ item.content || '—' }}</td>
            <td>{{ item.isAnonymous ? '是' : '否' }}</td>
            <td>{{ dateTime(item.createdAt) }}</td>
          </tr>
          <tr v-if="!result.list.length"><td colspan="6" class="empty">暂无评价</td></tr>
        </tbody>
      </table>
      <Pager :page="result.pagination.page" :total-pages="result.pagination.totalPages" :total="result.pagination.total" @change="changePage" />
    </article>
    </PageLoad>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { dateTime } from '../format';
import Pager from '../components/Pager.vue';
import PageLoad from '../components/PageLoad.vue';
import { usePageLoad } from '../composables/usePageLoad';

const keyword = ref('');
const page = ref(1);
const { loading, ready, error, run } = usePageLoad();
const result = ref({ list: [], pagination: { page: 1, totalPages: 1, total: 0 } });

async function load() {
  await run(async () => {
    result.value = await api.comments({ page: page.value, pageSize: 8, keyword: keyword.value });
  });
}
function reload() { page.value = 1; load(); }
function changePage(next) { page.value = next; load(); }
onMounted(load);
</script>
