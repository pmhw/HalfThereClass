<template>
  <section v-if="detail">
    <div class="page-head">
      <div>
        <h1>{{ detail.realName || detail.nickname }} <span v-if="detail.certStatus === 'approved'" class="tag green">认证教师</span></h1>
        <p>{{ detail.phone || '未留手机号' }} · 微信 {{ detail.nickname || '—' }} · {{ detail.organization?.name || '未绑定机构' }}</p>
      </div>
      <button class="btn" @click="freeze">{{ detail.status === 1 ? '冻结账号' : '解除冻结' }}</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="tabs">
      <button v-for="item in tabs" :key="item" type="button" :class="{ on: tab === item }" @click="tab = item">{{ item }}</button>
    </div>

    <article v-if="tab === '基本资料'" class="card card-pad">
      <p>姓名 {{ detail.realName || '—' }}</p>
      <p>性别 {{ detail.gender || '—' }}</p>
      <p>擅长 {{ detail.skills || '—' }}</p>
      <p>简介 {{ detail.bio || '—' }}</p>
    </article>

    <article v-if="tab === '认证资料'" class="card card-pad">
      <p>状态 {{ detail.certStatus }}</p>
      <p>编号 {{ detail.teacherNo || '—' }}</p>
      <p v-if="detail.rejectReason">驳回原因 {{ detail.rejectReason }}</p>
      <p>身份证 {{ detail.idCard || '未上传' }}</p>
      <p>学历证明 {{ detail.diploma || '未上传' }}</p>
      <p>资格证明 {{ detail.certificate || '未上传' }}</p>
    </article>

    <article v-if="tab === '所属机构'" class="card card-pad">
      <p>{{ detail.organization?.name || '未绑定机构' }}</p>
      <div class="toolbar">
        <select v-model="orgId">
          <option value="">不绑定</option>
          <option v-for="item in detail.orgs" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
        </select>
        <button class="btn primary" type="button" @click="saveOrg">保存机构</button>
      </div>
    </article>

    <article v-if="tab === '上级关系'" class="card card-pad">
      <p>上级：{{ detail.parent?.name || '未设置' }}</p>
      <div class="toolbar">
        <select v-model="parentId">
          <option value="">无上级</option>
          <option v-for="item in detail.teachers" :key="item.id" :value="String(item.id)">{{ item.name }}</option>
        </select>
        <button class="btn primary" type="button" @click="saveParent">保存上级</button>
      </div>
    </article>

    <article v-if="tab === '课程授权'" class="card card-pad">
      <table>
        <thead><tr><th>课程</th><th>课时费</th><th>机构分佣</th><th>教师实得</th></tr></thead>
        <tbody>
          <tr v-for="item in detail.grants" :key="item.id">
            <td>{{ item.title }}</td>
            <td>{{ moneyOf(item.quote.baseFee) }}</td>
            <td>{{ moneyOf(item.quote.commission) }}</td>
            <td>{{ moneyOf(item.quote.teacherFee) }}</td>
          </tr>
          <tr v-if="!detail.grants.length"><td colspan="4" class="empty">还没有授权课程。到「教师分配」里配置。</td></tr>
        </tbody>
      </table>
      <router-link class="btn" to="/assign">去分配课程</router-link>
    </article>

    <article v-if="tab === '收入记录'" class="card">
      <table>
        <thead><tr><th>课程</th><th>日期</th><th>课程费用</th><th>机构分佣</th><th>教师实得</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="item in detail.incomes" :key="item.id">
            <td>{{ item.course.title }}</td>
            <td>{{ item.date }}</td>
            <td>{{ moneyOf(item.baseFee) }}</td>
            <td>{{ moneyOf(item.commission) }}</td>
            <td>{{ moneyOf(item.teacherFee) }}</td>
            <td>{{ item.status === 'unconfigured' ? '未配置费用' : '待结算' }}</td>
          </tr>
          <tr v-if="!detail.incomes.length"><td colspan="6" class="empty">还没有上课结算记录</td></tr>
        </tbody>
      </table>
    </article>
  </section>
  <div v-else class="empty">{{ error || '加载中…' }}</div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const detail = ref(null);
const error = ref('');
const tab = ref('基本资料');
const tabs = ['基本资料', '认证资料', '所属机构', '上级关系', '课程授权', '收入记录'];
const orgId = ref('');
const parentId = ref('');

function moneyOf(value) {
  return value == null ? '未配置' : `¥${Number(value).toFixed(2)}`;
}
async function load() {
  error.value = '';
  try {
    detail.value = await api.facultyDetail(route.params.id);
    orgId.value = detail.value.organization ? String(detail.value.organization.id) : '';
    parentId.value = detail.value.parent ? String(detail.value.parent.id) : '';
  } catch (err) {
    error.value = err.message;
  }
}
async function saveOrg() {
  try {
    detail.value = await api.setFacultyOrg(detail.value.id, orgId.value ? Number(orgId.value) : null);
  } catch (err) {
    error.value = err.message;
  }
}
async function saveParent() {
  try {
    await api.setFacultyParent(detail.value.id, parentId.value ? Number(parentId.value) : null);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
async function freeze() {
  try {
    await api.freezeFaculty(detail.value.id, detail.value.status === 1);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
onMounted(load);
</script>
