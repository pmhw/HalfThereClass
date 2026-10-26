<template>
  <section>
    <div class="page-head">
      <div>
        <h1>管理员</h1>
        <p>创建管理员并分配权限。这里不管理学生。</p>
      </div>
      <button class="btn primary" @click="openForm()">新增管理员</button>
    </div>
    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="5" filters @retry="load">
    <div class="toolbar">
      <div class="field"><input v-model="keyword" placeholder="搜索账号或姓名" @keyup.enter="reload" /></div>
      <button class="btn" @click="reload">搜索</button>
    </div>
    <article class="card">
      <table>
        <thead><tr><th>姓名</th><th>账号</th><th>权限</th><th>状态</th><th class="col-actions">操作</th></tr></thead>
        <tbody>
          <tr v-for="item in result.list" :key="item.id">
            <td>{{ item.name }}</td>
            <td>{{ item.username }}</td>
            <td>{{ item.isSuper ? '超级管理员' : (item.role === 'school' ? '校企业账号' : permissionText(item.permissions)) }}</td>
            <td>
              <span :class="['tag', item.status === 1 && !frozen(item) ? 'green' : 'red']">{{ frozen(item) ? '已冻结' : (item.status === 1 ? '正常' : '停用') }}</span>
            </td>
            <td class="col-actions">
              <div class="row-actions">
                <ActionBtn icon="pencil" tip="编辑" @click="openForm(item)" />
                <ActionBtn icon="trash" tip="删除" tone="danger" @click="askRemove(item)" />
              </div>
            </td>
          </tr>
          <tr v-if="!result.list.length"><td colspan="5" class="empty">还没有管理员</td></tr>
        </tbody>
      </table>
      <Pager :page="result.pagination.page" :total-pages="result.pagination.totalPages" :total="result.pagination.total" @change="changePage" />
    </article>
    </PageLoad>

    <PageModal
      :open="!!form"
      :title="form?.id ? '编辑管理员' : '新增管理员'"
      icon="users"
      @close="form = null"
    >
      <form class="form" @submit.prevent="save">
        <div class="form-row">
          <label>姓名<input v-model="form.name" required /></label>
          <label>账号<input v-model="form.username" required :disabled="!!form.id" /></label>
        </div>
        <label>密码<input v-model="form.password" type="password" :placeholder="form.id ? '不修改请留空' : '至少 10 位，勿用弱口令'" :required="!form.id" /></label>
        <div class="perm-panel">
          <div class="perm-head">
            <div>
              <strong>角色</strong>
              <p>校企业账号是默认角色，只能发布课程并填写校方价格</p>
            </div>
          </div>
          <label class="course-field" style="display:block;margin-bottom:16px;">
            <select v-model="form.role" @change="onRole">
              <option value="admin">管理员</option>
              <option value="school">校企业账号</option>
            </select>
          </label>
          <template v-if="form.role === 'school'">
            <p>这个账号登录后只有课程管理。可以发布课程、设置校方价格，不能填写课时费。下面可以把已有课程分给它。</p>
            <div class="course-assign">
              <label v-for="item in courseOptions" :key="item.id" class="check-line">
                <input type="checkbox" :checked="form.courseIds.includes(item.id)" @change="toggleCourse(item.id)" />
                <span>{{ item.title }}<small v-if="item.owner && item.owner.id !== form.id"> · 当前属于 {{ item.owner.name }}</small></span>
              </label>
              <p v-if="!courseOptions.length" class="empty">还没有可分配的课程</p>
            </div>
          </template>
          <template v-else>
          <div class="perm-head">
            <div>
              <strong>权限设置</strong>
              <p>细分到每个子菜单，勾选后才能进入对应页面并调用对应接口</p>
            </div>
            <label class="check-line"><input v-model="form.isSuper" type="checkbox" :disabled="!me.isSuper" />超级管理员</label>
          </div>
          <p v-if="lockedSelf" class="perm-note">不能修改自己的权限，请联系超级管理员。</p>
          <p v-else-if="!me.isSuper" class="perm-note">只能分配你自己拥有的权限，灰色项不可勾选。</p>
          <section v-for="group in groups" :key="group.key" class="perm-group">
            <label class="perm-group-head">
              <input
                type="checkbox"
                :checked="groupState(group) === 'all'"
                :indeterminate.prop="groupState(group) === 'some'"
                :disabled="form.isSuper || !groupEditable(group)"
                @change="toggleGroup(group, $event.target.checked)"
              />
              <span class="perm-icon"><Icon :name="groupIcon[group.key] || 'list'" /></span>
              <b>{{ group.label }}</b>
              <small>{{ groupCount(group) }}</small>
            </label>
            <div class="perm-sub">
              <label
                v-for="item in group.items"
                :key="item.key"
                class="perm-item"
                :class="{ on: checked(item.key), off: !editable(item.key) }"
                :title="editable(item.key) ? item.desc : (lockedSelf ? '不能修改自己的权限' : '你没有这项权限，不能分配')"
              >
                <input type="checkbox" :checked="checked(item.key)" :disabled="form.isSuper || !editable(item.key)" @change="toggle(item.key)" />
                <span>
                  <b>{{ item.label }}</b>
                  <small>{{ item.desc }}</small>
                </span>
              </label>
            </div>
          </section>
          </template>
        </div>
        <label v-if="form.id" class="check-line"><input v-model="form.enabled" type="checkbox" />允许登录</label>
        <p v-if="formError" class="error">{{ formError }}</p>
        <div class="form-actions">
          <button class="btn primary" type="submit">保存</button>
          <button class="btn" type="button" @click="form = null">取消</button>
        </div>
      </form>
    </PageModal>
    <Confirm :open="!!pending" :message="pending ? `确定删除管理员「${pending.name}」？` : ''" @cancel="pending = null" @ok="remove" />
  </section>
</template>

<style scoped>
.course-assign {
  max-height: 240px;
  overflow: auto;
  margin: 12px 0 4px;
  padding: 8px 12px;
  border: 1px solid #e7edf5;
  border-radius: 12px;
}
.course-assign .check-line { display: flex; gap: 8px; align-items: flex-start; margin: 8px 0; }
.course-assign small { color: #98a2b3; }
.perm-note { margin: 0 0 10px; padding: 8px 12px; border-radius: 10px; background: #fff7e6; color: #b45309; font-size: 13px; }
.perm-group { margin-top: 12px; padding: 10px 12px; border: 1px solid #e7edf5; border-radius: 12px; }
.perm-group-head { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.perm-group-head small { margin-left: auto; color: #98a2b3; font-size: 12px; }
.perm-group-head .perm-icon { width: 26px; height: 26px; }
.perm-sub { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; margin-top: 10px; }
.perm-item { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border: 1px solid #edf1f7; border-radius: 10px; cursor: pointer; }
.perm-item.on { border-color: #93c5fd; background: #f0f7ff; }
.perm-item.off { opacity: 0.5; cursor: not-allowed; }
.perm-item input { margin-top: 3px; }
.perm-item span { display: flex; flex-direction: column; gap: 2px; }
.perm-item small { color: #98a2b3; font-size: 12px; line-height: 1.4; }
.perm-group { background: #fff; }
.form .perm-group-head, .form .perm-item { flex-direction: row; color: #344054; }
.form .perm-group-head input, .form .perm-item input { width: 16px; height: 16px; padding: 0; flex: none; }
</style>

<script setup>
import { computed, ref } from 'vue';
import { api, getProfile } from '../api';
import { PERMISSIONS, PERMISSION_GROUPS, allow, normalizePermissions } from '../access';
import Pager from '../components/Pager.vue';
import Confirm from '../components/Confirm.vue';
import Icon from '../components/Icon.vue';
import ActionBtn from '../components/ActionBtn.vue';
import PageModal from '../components/PageModal.vue';
import PageLoad from '../components/PageLoad.vue';
import { usePageLoad } from '../composables/usePageLoad';

const keyword = ref('');
const page = ref(1);
const { loading, ready, error, run, bindLoad } = usePageLoad();
const form = ref(null);
const formError = ref('');
const pending = ref(null);
const courseOptions = ref([]);
const me = getProfile() || {};
const groups = PERMISSION_GROUPS;
const groupIcon = { home: 'overview', course: 'book', trade: 'receipt', people: 'users', org: 'folder', finance: 'chart', admin: 'gear' };
const lockedSelf = computed(() => !me.isSuper && !!form.value?.id && form.value.id === me.id);

function checked(key) {
  return !!(form.value?.isSuper || form.value?.permissions?.includes(key));
}
function editable(key) {
  if (lockedSelf.value) return false;
  return allow(me, key);
}
function toggle(key) {
  if (!form.value || form.value.isSuper || !editable(key)) return;
  const list = form.value.permissions;
  const index = list.indexOf(key);
  if (index >= 0) list.splice(index, 1);
  else list.push(key);
}
function groupState(group) {
  const on = group.items.filter((item) => checked(item.key)).length;
  return on === 0 ? 'none' : on === group.items.length ? 'all' : 'some';
}
function groupCount(group) {
  return `${group.items.filter((item) => checked(item.key)).length}/${group.items.length}`;
}
function groupEditable(group) {
  return group.items.some((item) => editable(item.key));
}
function toggleGroup(group, on) {
  if (!form.value || form.value.isSuper) return;
  const set = new Set(form.value.permissions);
  for (const item of group.items) {
    if (!editable(item.key)) continue;
    if (on) set.add(item.key);
    else set.delete(item.key);
  }
  form.value.permissions = PERMISSIONS.map((item) => item.key).filter((key) => set.has(key));
}
const result = ref({ list: [], pagination: { page: 1, totalPages: 1, total: 0 } });

function permissionText(keys) {
  const own = new Set(normalizePermissions(keys));
  const parts = [];
  for (const group of groups) {
    const on = group.items.filter((item) => own.has(item.key));
    if (!on.length) continue;
    if (on.length === group.items.length && group.items.length > 1) parts.push(`${group.label}（全部）`);
    else parts.push(...on.map((item) => item.label));
  }
  return parts.join('、') || '未分配';
}
function frozen(item) {
  return item.lockedUntil && new Date(item.lockedUntil).getTime() > Date.now();
}
async function load() {
  await run(async () => {
    result.value = await api.admins({ page: page.value, pageSize: 8, keyword: keyword.value });
  });
}
function reload() { page.value = 1; load(); }
function changePage(next) { page.value = next; load(); }
function openForm(item) {
  formError.value = '';
  form.value = item
    ? { id: item.id, name: item.name, username: item.username, password: '', isSuper: item.isSuper, role: item.role === 'school' ? 'school' : 'admin', permissions: normalizePermissions(item.permissions), courseIds: [], enabled: item.status === 1 }
    : { id: null, name: '', username: '', password: '', isSuper: false, role: 'admin', permissions: allow(me, 'home.overview') ? ['home.overview'] : [], courseIds: [], enabled: true };
  if (form.value.role === 'school') onRole();
}
async function onRole() {
  if (!form.value || form.value.role !== 'school') return;
  form.value.isSuper = false;
  if (!courseOptions.value.length) courseOptions.value = await api.adminCourseOptions();
  form.value.courseIds = courseOptions.value.filter((item) => item.ownerId === form.value.id).map((item) => item.id);
}
function toggleCourse(id) {
  if (!form.value) return;
  const list = form.value.courseIds;
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
  else list.push(id);
}
async function save() {
  formError.value = '';
  const school = form.value.role === 'school';
  const body = {
    name: form.value.name,
    username: form.value.username,
    password: form.value.password,
    isSuper: school ? false : form.value.isSuper,
    role: school ? 'school' : 'admin',
    permissions: school ? [] : form.value.permissions,
    status: form.value.enabled ? 1 : 0,
  };
  try {
    const saved = form.value.id ? await api.updateAdmin(form.value.id, body) : await api.createAdmin(body);
    if (school) await api.assignAdminCourses(saved.id, form.value.courseIds);
    form.value = null;
    courseOptions.value = [];
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
bindLoad(load);
</script>
