<template>
  <section>
    <div class="page-head"><div><h1>教师管理</h1><p>只显示提交过认证的教师，和普通微信用户分开。</p></div></div>
    <div class="kpi-grid">
      <article class="card kpi"><div class="label">认证教师</div><div class="value">{{ stats.certified }}</div></article>
      <article class="card kpi"><div class="label">待审核</div><div class="value">{{ stats.pending }}</div></article>
      <article class="card kpi"><div class="label">本月新增</div><div class="value">{{ stats.monthNew }}</div></article>
      <article class="card kpi"><div class="label">机构教师</div><div class="value">{{ stats.org }}</div></article>
      <article class="card kpi"><div class="label">独立教师</div><div class="value">{{ stats.independent }}</div></article>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <article class="card">
      <table>
        <thead><tr><th>教师</th><th>手机号</th><th>认证</th><th>机构</th><th>上级</th><th>授权课程</th><th>已授课</th><th></th></tr></thead>
        <tbody>
          <tr v-for="item in list" :key="item.id">
            <td>{{ item.realName || item.nickname }}</td>
            <td>{{ item.phone || '—' }}</td>
            <td><span :class="['tag', item.certStatus === 'approved' ? 'green' : '']">{{ certText(item.certStatus) }}</span></td>
            <td>{{ item.organization?.name || '未绑定机构' }}</td>
            <td>{{ item.parent?.name || '未设置' }}</td>
            <td>{{ item.grantCount }}</td>
            <td>{{ item.taughtCount }}</td>
            <td><router-link class="link" :to="`/faculty/${item.id}`">详情</router-link></td>
          </tr>
          <tr v-if="!list.length"><td colspan="8" class="empty">还没有教师申请</td></tr>
        </tbody>
      </table>
    </article>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';
const error = ref('');
const list = ref([]);
const stats = ref({ certified: 0, pending: 0, monthNew: 0, org: 0, independent: 0 });
const certMap = { pending: '审核中', approved: '已认证', rejected: '已驳回', frozen: '冻结' };
function certText(value) { return certMap[value] || '未申请'; }
onMounted(async () => {
  try {
    const data = await api.faculty();
    list.value = data.list;
    stats.value = data.stats;
  } catch (err) {
    error.value = err.message;
  }
});
</script>
