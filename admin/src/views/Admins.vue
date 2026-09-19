<template>
  <section>
    <div class="page-head">
      <div>
        <h1>管理员</h1>
        <p>创建管理员并分配权限。这里不管理学生。</p>
      </div>
      <button class="btn primary" @click="openForm()">新增管理员</button>
    </div>
    <div class="toolbar">
      <div class="field"><input v-model="keyword" placeholder="搜索账号或姓名" @keyup.enter="reload" /></div>
      <button class="btn" @click="reload">搜索</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <article class="card">
      <table>
        <thead><tr><th>姓名</th><th>账号</th><th>权限</th><th>状态</th><th></th></tr></thead>
        <tbody>
          <tr v-for="item in result.list" :key="item.id">
            <td>{{ item.name }}</td>
            <td>{{ item.username }}</td>
            <td>{{ item.isSuper ? '超级管理员' : permissionText(item.permissions) }}</td>
            <td>
              <span :class="['tag', item.status === 1 && !frozen(item) ? 'green' : 'red']">{{ frozen(item) ? '已冻结' : (item.status === 1 ? '正常' : '停用') }}</span>
            </td>
            <td>
              <div class="row-actions">
                <button class="link" @click="openForm(item)">编辑</button>
                <button class="link danger" @click="askRemove(item)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!result.list.length"><td colspan="5" class="empty">还没有管理员</td></tr>
        </tbody>
      </table>
      <Pager :page="result.pagination.page" :total-pages="result.pagination.totalPages" :total="result.pagination.total" @change="changePage" />
    </article>

    <div v-if="form" class="modal-mask">
      <div class="modal" role="dialog">
        <header>
          <h3>{{ form.id ? '编辑管理员' : '新增管理员' }}</h3>
          <button class="modal-close" type="button" @click="form = null">×</button>
        </header>
        <form class="form" @submit.prevent="save">
          <div class="form-row">
            <label>姓名<input v-model="form.name" required /></label>
            <label>账号<input v-model="form.username" required :disabled="!!form.id" /></label>
          </div>
          <label>密码<input v-model="form.password" type="password" :placeholder="form.id ? '不修改请留空' : '至少 6 位'" :required="!form.id" /></label>
          <div class="perm-panel">
            <div class="perm-head">
              <div>
                <strong>权限设置</strong>
                <p>按侧边栏菜单分配，勾选后才能进入对应页面</p>
              </div>
              <label class="check-line"><input v-model="form.isSuper" type="checkbox" :disabled="!me.isSuper" />超级管理员</label>
            </div>
            <section v-for="group in groups" :key="group.key" class="perm-group">
              <h4>{{ group.label }}</h4>
              <div class="perm-grid">
                <button
                  v-for="item in group.items"
                  :key="item.key"
                  type="button"
                  class="perm-card"
                  :class="{ on: checked(item.key) }"
                  :disabled="form.isSuper"
                  @click="toggle(item.key)"
                >
                  <span class="perm-icon"><Icon :name="item.icon" /></span>
                  <span class="perm-copy">
                    <b>{{ item.label }}</b>
                    <small>{{ item.desc }}</small>
                  </span>
                  <input type="checkbox" :checked="checked(item.key)" tabindex="-1" />
                </button>
              </div>
            </section>
          </div>
          <label v-if="form.id" class="check-line"><input v-model="form.enabled" type="checkbox" />允许登录</label>
          <p v-if="formError" class="error">{{ formError }}</p>
          <div class="form-actions">
            <button class="btn primary" type="submit">保存</button>
            <button class="btn" type="button" @click="form = null">取消</button>
          </div>
        </form>
      </div>
    </div>
    <Confirm :open="!!pending" :message="pending ? `确定删除管理员「${pending.name}」？` : ''" @cancel="pending = null" @ok="remove" />
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api, getProfile } from '../api';
import { PERMISSIONS, PERMISSION_GROUPS } from '../access';
import Pager from '../components/Pager.vue';
import Confirm from '../components/Confirm.vue';
import Icon from '../components/Icon.vue';

const keyword = ref('');
const page = ref(1);
const error = ref('');
const form = ref(null);
const formError = ref('');
const pending = ref(null);
const me = getProfile() || {};
const groups = PERMISSION_GROUPS;

function checked(key) {
  return !!(form.value?.isSuper || form.value?.permissions?.includes(key));
}
function toggle(key) {
  if (!form.value || form.value.isSuper) return;
  const list = form.value.permissions;
  const index = list.indexOf(key);
  if (index >= 0) list.splice(index, 1);
  else list.push(key);
}
const result = ref({ list: [], pagination: { page: 1, totalPages: 1, total: 0 } });

function permissionText(keys) {
  const map = Object.fromEntries(PERMISSIONS.map((item) => [item.key, item.label]));
  return (keys || []).map((key) => map[key] || key).join('、') || '未分配';
}
function frozen(item) {
  return item.lockedUntil && new Date(item.lockedUntil).getTime() > Date.now();
}
async function load() {
  error.value = '';
  try {
    result.value = await api.admins({ page: page.value, pageSize: 8, keyword: keyword.value });
  } catch (err) {
    error.value = err.message;
  }
}
function reload() { page.value = 1; load(); }
function changePage(next) { page.value = next; load(); }
function openForm(item) {
  formError.value = '';
  form.value = item
    ? { id: item.id, name: item.name, username: item.username, password: '', isSuper: item.isSuper, permissions: [...(item.permissions || [])], enabled: item.status === 1 }
    : { id: null, name: '', username: '', password: '', isSuper: false, permissions: ['overview'], enabled: true };
}
async function save() {
  formError.value = '';
  const body = {
    name: form.value.name,
    username: form.value.username,
    password: form.value.password,
    isSuper: form.value.isSuper,
    permissions: form.value.permissions,
    status: form.value.enabled ? 1 : 0,
  };
  try {
    if (form.value.id) await api.updateAdmin(form.value.id, body);
    else await api.createAdmin(body);
    form.value = null;
    await load();
  } catch (err) {
    formError.value = err.message;
  }
}
function askRemove(item) { pending.value = item; }
async function remove() {
  const item = pending.value;
  pending.value = null;
  if (!item) return;
  try {
    await api.deleteAdmin(item.id);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}
onMounted(load);
</script>
