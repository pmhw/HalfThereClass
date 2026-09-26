<template>
  <section>
    <div class="page-head">
      <div><h1>分类管理</h1><p>新增、修改课程分类。分类下还有课程时不能删除</p></div>
      <div class="actions">
        <button class="btn danger" :disabled="!selected.length" @click="askRemoveSelected">批量删除{{ selected.length ? `（${selected.length}）` : '' }}</button>
        <button class="btn primary" @click="open()">新增分类</button>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <article class="card" style="margin-top: 16px">
      <table>
        <thead><tr><th class="check-col"><input type="checkbox" :checked="allChecked" :disabled="!selectable.length" @change="toggleAll" /></th><th>分类</th><th>排序</th><th>课程数</th><th>状态</th><th class="col-actions">操作</th></tr></thead>
        <tbody>
          <tr v-for="item in list" :key="item.id">
            <td class="check-col"><input type="checkbox" :disabled="item._count.courses > 0" :checked="selected.includes(item.id)" :title="item._count.courses ? '分类下还有课程，不能删除' : ''" @change="toggle(item)" /></td>
            <td>{{ item.name }}</td>
            <td>{{ item.sort }}</td>
            <td>{{ item._count.courses }}</td>
            <td><span :class="['tag', item.status === 1 ? 'green' : '']">{{ item.status === 1 ? '启用' : '停用' }}</span></td>
            <td class="col-actions">
              <div class="row-actions">
                <ActionBtn icon="pencil" tip="编辑" @click="open(item)" />
                <ActionBtn
                  icon="trash"
                  tip="删除"
                  tone="danger"
                  :disabled="item._count.courses > 0"
                  disabled-tip="分类下还有课程，不能删除"
                  @click="askRemove(item)"
                />
              </div>
            </td>
          </tr>
          <tr v-if="!list.length"><td colspan="6" class="empty">暂无分类</td></tr>
        </tbody>
      </table>
    </article>

    <div v-if="form" class="modal-mask">
      <div class="modal narrow" role="dialog">
        <header>
          <h3>{{ form.id ? '编辑分类' : '新增分类' }}</h3>
          <button class="modal-close" type="button" @click="form = null">×</button>
        </header>
        <form class="form" @submit.prevent="save">
          <label>名称<input v-model="form.name" required /></label>
          <label>排序<input v-model.number="form.sort" type="number" /></label>
          <label class="checks"><input v-model="form.enabled" type="checkbox" />启用</label>
          <p v-if="formError" class="error">{{ formError }}</p>
          <div class="form-actions">
            <button class="btn primary" type="submit">保存</button>
            <button class="btn" type="button" @click="form = null">取消</button>
          </div>
        </form>
      </div>
    </div>
    <Confirm :open="!!pending.length" :message="confirmText" @cancel="pending = []" @ok="remove" />
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import Confirm from '../components/Confirm.vue';
import ActionBtn from '../components/ActionBtn.vue';

const list = ref([]);
const error = ref('');
const form = ref(null);
const pending = ref([]);
const selected = ref([]);
const formError = ref('');

async function load() {
  error.value = '';
  try {
    list.value = await api.categories();
  } catch (err) {
    error.value = err.message;
  }
}

function open(item) {
  formError.value = '';
  form.value = item
    ? { id: item.id, name: item.name, sort: item.sort, enabled: item.status === 1 }
    : { id: null, name: '', sort: 0, enabled: true };
}

async function save() {
  formError.value = '';
  const body = { name: form.value.name, sort: form.value.sort, status: form.value.enabled ? 1 : 0 };
  try {
    if (form.value.id) await api.updateCategory(form.value.id, body);
    else await api.createCategory(body);
    form.value = null;
    await load();
  } catch (err) {
    formError.value = err.message;
  }
}

function askRemove(item) {
  if (item._count.courses) return;
  pending.value = [item];
}
function askRemoveSelected() {
  const items = list.value.filter((item) => selected.value.includes(item.id) && !item._count.courses);
  if (!items.length) return;
  pending.value = items;
}
const selectable = computed(() => list.value.filter((item) => !item._count.courses));
const allChecked = computed(() => selectable.value.length > 0 && selectable.value.every((item) => selected.value.includes(item.id)));
const confirmText = computed(() => {
  if (pending.value.length === 1) return `确定删除分类「${pending.value[0].name}」？`;
  if (pending.value.length > 1) return `确定删除选中的 ${pending.value.length} 个分类？`;
  return '';
});
function toggle(item) {
  if (item._count.courses) return;
  selected.value = selected.value.includes(item.id)
    ? selected.value.filter((id) => id !== item.id)
    : [...selected.value, item.id];
}
function toggleAll(event) {
  selected.value = event.target.checked ? selectable.value.map((item) => item.id) : [];
}

async function remove() {
  const items = pending.value;
  if (!items.length) return;
  pending.value = [];
  error.value = '';
  try {
    const data = await api.deleteCategories(items.map((item) => item.id));
    selected.value = selected.value.filter((id) => !data.deleted.includes(id));
    await load();
    if (data.blocked?.length) {
      error.value = `已删除 ${data.deleted.length} 个，未删除：${data.blocked.map((item) => `${item.title}（${item.reason}）`).join('、')}`;
    }
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(load);
</script>
