<template>
  <section>
    <div class="page-head"><div><h1>收入记录</h1><p>平台可以看到课程费用、机构分佣和教师实得。教师端只看自己被允许看到的金额。</p></div></div>
    <p v-if="error" class="error">{{ error }}</p>
    <article class="card">
      <table>
        <thead><tr><th>教师</th><th>课程</th><th>日期</th><th>课程费用</th><th>机构分佣</th><th>教师实得</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="item in list" :key="item.id">
            <td>{{ item.user.teacherCert?.realName || item.user.nickname }}</td>
            <td>{{ item.course.title }}</td>
            <td>{{ item.date }}</td>
            <td>{{ item.baseFee == null ? '未配置' : `¥${item.baseFee}` }}</td>
            <td>{{ item.commission == null ? '—' : `¥${item.commission}` }}</td>
            <td>{{ item.teacherFee == null ? '—' : `¥${item.teacherFee}` }}</td>
            <td>{{ item.status }}</td>
          </tr>
          <tr v-if="!list.length"><td colspan="7" class="empty">签到后才会生成收入记录</td></tr>
        </tbody>
      </table>
    </article>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';
const list = ref([]);
const error = ref('');
onMounted(async () => {
  try { list.value = await api.incomes(); } catch (err) { error.value = err.message; }
});
</script>
