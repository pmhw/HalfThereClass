<template>
  <section class="cat-page">
    <div class="page-head">
      <div>
        <h1>分类管理</h1>
        <p>左侧维护分类树，中间勾选课程，右侧批量归类。少弹窗、直接配置。</p>
      </div>
      <div class="actions">
        <button class="btn primary" type="button" @click="openCat()">新增分类</button>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="5" @retry="boot">
      <div class="cat-chips">
        <button type="button" class="chip" :class="{ on: !activeId }" @click="pickChip(null)">全部（{{ courseTotal }}）</button>
        <button
          v-for="item in rootCats"
          :key="item.id"
          type="button"
          class="chip"
          :class="{ on: activeId === item.id }"
          @click="pickChip(item.id)"
        >{{ item.name }}（{{ countOf(item) }}）</button>
      </div>

      <div class="cat-layout">
        <aside class="card cat-tree">
          <div class="cat-pane-head">
            <strong>分类树</strong>
            <button class="btn" type="button" @click="openCat()">+ 新增</button>
          </div>
          <button type="button" class="tree-item root" :class="{ on: !activeId }" @click="pickChip(null)">
            全部分类
          </button>
          <div v-for="node in tree" :key="node.id" class="tree-block">
            <div class="tree-item" :class="{ on: activeId === node.id }" :style="{ paddingLeft: `${12 + node.depth * 14}px` }">
              <button type="button" class="tree-main" @click="pickChip(node.id)">
                <span v-if="node.children.length" class="tree-toggle" @click.stop="toggleExpand(node.id)">{{ expanded[node.id] === false ? '▶' : '▼' }}</span>
                <span v-else class="tree-toggle muted">·</span>
                <b>{{ node.name }}</b>
                <em>{{ countOf(node) }}</em>
              </button>
              <div class="tree-ops">
                <ActionBtn icon="plus" tip="加子分类" @click="openCat(null, node.id)" />
                <ActionBtn icon="pencil" tip="编辑" @click="openCat(node)" />
                <ActionBtn icon="trash" tip="删除" tone="danger" :disabled="countOf(node) > 0 || node.children.length > 0" disabled-tip="有课程或子分类时不能删" @click="askRemove(node)" />
              </div>
            </div>
            <template v-if="expanded[node.id] !== false">
              <div
                v-for="child in node.children"
                :key="child.id"
                class="tree-item"
                :class="{ on: activeId === child.id }"
                :style="{ paddingLeft: `${12 + child.depth * 14}px` }"
              >
                <button type="button" class="tree-main" @click="pickChip(child.id)">
                  <span class="tree-toggle muted">·</span>
                  <b>{{ child.name }}</b>
                  <em>{{ countOf(child) }}</em>
                </button>
                <div class="tree-ops">
                  <ActionBtn icon="pencil" tip="编辑" @click="openCat(child)" />
                  <ActionBtn icon="trash" tip="删除" tone="danger" :disabled="countOf(child) > 0" disabled-tip="分类下还有课程" @click="askRemove(child)" />
                </div>
              </div>
            </template>
          </div>
          <p v-if="!list.length" class="empty">还没有分类</p>
        </aside>

        <article class="card cat-courses">
          <div class="cat-pane-head">
            <div>
              <strong>{{ activeName }}</strong>
              <p class="muted">{{ filteredCourses.length }} 门课程 · 已选 {{ courseSelected.length }}</p>
            </div>
            <div class="actions">
              <button class="btn" type="button" @click="selectAllCourses">全选</button>
              <button class="btn" type="button" @click="invertCourses">反选</button>
              <button class="btn primary" type="button" :disabled="!courseSelected.length" @click="batchPanel = true">批量分类</button>
            </div>
          </div>
          <div class="toolbar">
            <div class="field"><input v-model="courseKeyword" placeholder="搜索课程名称" @keyup.enter="loadCourses" /></div>
            <button class="btn" type="button" @click="loadCourses">搜索</button>
          </div>
          <table>
            <thead>
              <tr>
                <th class="check-col"><input type="checkbox" :checked="allCoursesChecked" @change="toggleAllCourses" /></th>
                <th>课程</th>
                <th>年级</th>
                <th>分类</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredCourses" :key="item.id">
                <td class="check-col"><input type="checkbox" :checked="courseSelected.includes(item.id)" @change="toggleCourse(item)" /></td>
                <td>{{ item.title }}</td>
                <td>{{ item.gradeLabel || '—' }}</td>
                <td>{{ item.category?.name || '—' }}</td>
                <td><span :class="['tag', item.status === 1 ? 'green' : '']">{{ item.status === 1 ? '上架' : '下架' }}</span></td>
              </tr>
              <tr v-if="!filteredCourses.length"><td colspan="5" class="empty">该分类下暂无课程</td></tr>
            </tbody>
          </table>
        </article>

        <aside class="card cat-batch" :class="{ open: batchPanel || courseSelected.length }">
          <div class="cat-pane-head">
            <strong>批量配置</strong>
          </div>
          <p class="muted">已选择 <b>{{ courseSelected.length }}</b> 个课程</p>
          <label class="field">搜索分类
            <input v-model="catQuery" placeholder="筛选分类名称" />
          </label>
          <div class="batch-tree">
            <label v-for="node in flatForPick" :key="node.id" class="batch-item" :style="{ paddingLeft: `${8 + node.depth * 14}px` }">
              <input type="radio" name="target-cat" :value="node.id" v-model="targetCategoryId" />
              <span>{{ node.name }}</span>
            </label>
            <p v-if="!flatForPick.length" class="empty">没有匹配的分类</p>
          </div>
          <div class="form-actions" style="margin-top:12px">
            <button class="btn primary" type="button" :disabled="!courseSelected.length || !targetCategoryId" @click="applyBatch">确认分类</button>
            <button class="btn" type="button" @click="courseSelected = []; batchPanel = false">清空选择</button>
          </div>
          <p v-if="notice" class="ok-tip">{{ notice }}</p>
        </aside>
      </div>
    </PageLoad>

    <PageModal
      :open="!!form"
      size="narrow"
      :title="form?.id ? '编辑分类' : '新增分类'"
      icon="folder"
      @close="form = null"
    >
      <form class="form" @submit.prevent="save">
        <label>名称<input v-model="form.name" required /></label>
        <label>上级分类
          <select v-model="form.parentId">
            <option value="">无（顶级）</option>
            <option v-for="item in parentOptions" :key="item.id" :value="String(item.id)">{{ item.label }}</option>
          </select>
        </label>
        <label>排序<input v-model.number="form.sort" type="number" /></label>
        <label class="checks"><input v-model="form.enabled" type="checkbox" />启用</label>
        <p v-if="formError" class="error">{{ formError }}</p>
        <div class="form-actions">
          <button class="btn primary" type="submit">保存</button>
          <button class="btn" type="button" @click="form = null">取消</button>
        </div>
      </form>
    </PageModal>
    <Confirm :open="!!pending" :message="pending ? `确定删除分类「${pending.name}」？` : ''" @cancel="pending = null" @ok="remove" />
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api';
import Confirm from '../components/Confirm.vue';
import ActionBtn from '../components/ActionBtn.vue';
import PageModal from '../components/PageModal.vue';
import PageLoad from '../components/PageLoad.vue';
import { usePageLoad } from '../composables/usePageLoad';

const list = ref([]);
const courses = ref([]);
const { loading, ready, error, run } = usePageLoad();
const form = ref(null);
const pending = ref(null);
const formError = ref('');
const notice = ref('');
const activeId = ref(null);
const courseKeyword = ref('');
const courseSelected = ref([]);
const batchPanel = ref(false);
const catQuery = ref('');
const targetCategoryId = ref(null);
const expanded = reactive({});
const courseTotal = ref(0);

const rootCats = computed(() => list.value.filter((item) => !item.parentId).sort((a, b) => a.sort - b.sort || a.id - b.id));

function buildTree(items, parentId = null, depth = 0) {
  return items
    .filter((item) => (item.parentId || null) === parentId)
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map((item) => ({
      ...item,
      depth,
      children: buildTree(items, item.id, depth + 1),
    }));
}

const tree = computed(() => buildTree(list.value));

function flattenTree(nodes, out = []) {
  for (const node of nodes) {
    out.push(node);
    if (node.children?.length && expanded[node.id] !== false) flattenTree(node.children, out);
  }
  return out;
}

const flatNodes = computed(() => flattenTree(tree.value));

const flatForPick = computed(() => {
  const q = catQuery.value.trim().toLowerCase();
  const walk = (nodes, depth = 0, acc = []) => {
    for (const node of nodes) {
      if (!q || node.name.toLowerCase().includes(q)) acc.push({ ...node, depth });
      if (node.children?.length) walk(node.children, depth + 1, acc);
    }
    return acc;
  };
  return walk(tree.value);
});

const parentOptions = computed(() => {
  const walk = (nodes, depth = 0, acc = []) => {
    for (const node of nodes) {
      if (form.value?.id && node.id === form.value.id) continue;
      acc.push({ id: node.id, label: `${'　'.repeat(depth)}${node.name}` });
      if (node.children?.length) walk(node.children, depth + 1, acc);
    }
    return acc;
  };
  return walk(tree.value);
});

function countOf(node) {
  const allIds = collectDescendantIds(node.id);
  const live = courses.value.filter((c) => allIds.has(c.categoryId)).length;
  if (live) return live;
  return node._count?.courses || 0;
}

function collectDescendantIds(id) {
  const set = new Set([id]);
  const kids = list.value.filter((item) => item.parentId === id);
  for (const kid of kids) {
    for (const x of collectDescendantIds(kid.id)) set.add(x);
  }
  return set;
}

const activeName = computed(() => {
  if (!activeId.value) return '全部课程';
  return list.value.find((item) => item.id === activeId.value)?.name || '分类课程';
});

const filteredCourses = computed(() => {
  let rows = courses.value;
  if (activeId.value) {
    const ids = collectDescendantIds(activeId.value);
    rows = rows.filter((item) => ids.has(item.categoryId));
  }
  const q = courseKeyword.value.trim().toLowerCase();
  if (q) rows = rows.filter((item) => String(item.title || '').toLowerCase().includes(q));
  return rows;
});

const allCoursesChecked = computed(() => filteredCourses.value.length > 0 && filteredCourses.value.every((item) => courseSelected.value.includes(item.id)));

function toggleExpand(id) {
  expanded[id] = expanded[id] === false;
}

function pickChip(id) {
  activeId.value = id;
  courseSelected.value = [];
}

function toggleCourse(item) {
  courseSelected.value = courseSelected.value.includes(item.id)
    ? courseSelected.value.filter((id) => id !== item.id)
    : [...courseSelected.value, item.id];
}
function toggleAllCourses(event) {
  const ids = filteredCourses.value.map((item) => item.id);
  courseSelected.value = event.target.checked
    ? [...new Set([...courseSelected.value, ...ids])]
    : courseSelected.value.filter((id) => !ids.includes(id));
}
function selectAllCourses() {
  courseSelected.value = filteredCourses.value.map((item) => item.id);
}
function invertCourses() {
  const set = new Set(courseSelected.value);
  courseSelected.value = filteredCourses.value.map((item) => item.id).filter((id) => !set.has(id));
}

async function boot() {
  await run(async () => {
    list.value = await api.categories();
    await loadCourses();
  });
}

async function loadCourses() {
  const data = await api.courses({
    page: 1,
    pageSize: 200,
    keyword: courseKeyword.value,
    semesterScope: 'all',
  });
  courses.value = data.list || [];
  courseTotal.value = data.pagination?.total || courses.value.length;
}

function openCat(item, parentId) {
  formError.value = '';
  form.value = item
    ? {
      id: item.id,
      name: item.name,
      sort: item.sort,
      enabled: item.status === 1,
      parentId: item.parentId ? String(item.parentId) : '',
    }
    : {
      id: null,
      name: '',
      sort: 0,
      enabled: true,
      parentId: parentId ? String(parentId) : '',
    };
}

async function save() {
  formError.value = '';
  const body = {
    name: form.value.name,
    sort: form.value.sort,
    status: form.value.enabled ? 1 : 0,
    parentId: form.value.parentId ? Number(form.value.parentId) : null,
  };
  try {
    if (form.value.id) await api.updateCategory(form.value.id, body);
    else await api.createCategory(body);
    form.value = null;
    await boot();
  } catch (err) {
    formError.value = err.message;
  }
}

function askRemove(item) {
  if ((item._count?.courses || 0) > 0 || (item.children || []).length) return;
  // also check live children from list
  if (list.value.some((row) => row.parentId === item.id)) return;
  pending.value = item;
}

async function remove() {
  const item = pending.value;
  pending.value = null;
  if (!item) return;
  try {
    await api.deleteCategory(item.id);
    if (activeId.value === item.id) activeId.value = null;
    await boot();
  } catch (err) {
    error.value = err.message;
  }
}

async function applyBatch() {
  notice.value = '';
  try {
    await api.patchCourses({ ids: courseSelected.value, categoryId: Number(targetCategoryId.value) });
    notice.value = `已将 ${courseSelected.value.length} 门课程归类`;
    courseSelected.value = [];
    batchPanel.value = false;
    await loadCourses();
    list.value = await api.categories();
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(boot);
</script>

<style scoped>
.cat-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 14px; }
.cat-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(220px, 280px);
  gap: 14px;
  align-items: start;
}
.cat-tree, .cat-courses, .cat-batch { padding: 12px; min-height: 420px; }
.cat-pane-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  margin-bottom: 10px;
}
.cat-pane-head .muted { margin: 2px 0 0; font-size: 12px; }
.tree-item {
  display: flex; align-items: center; gap: 4px; border-radius: 8px; margin-bottom: 2px;
}
.tree-item.on { background: #eef4ff; }
.tree-main {
  flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0;
  border: 0; background: transparent; text-align: left; cursor: pointer; padding: 6px 4px; color: inherit;
}
.tree-main b { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.tree-main em { color: #98a2b3; font-style: normal; font-size: 12px; }
.tree-toggle { width: 14px; font-size: 10px; color: #667085; }
.tree-ops { display: flex; opacity: 0; }
.tree-item:hover .tree-ops { opacity: 1; }
.tree-item.root { width: 100%; border: 0; background: #f8fafc; padding: 8px 10px; margin-bottom: 8px; font-weight: 650; cursor: pointer; text-align: left; border-radius: 8px; }
.tree-item.root.on { background: #eef4ff; color: #1d4ed8; }
.batch-tree { max-height: 320px; overflow: auto; border: 1px solid var(--line); border-radius: 10px; padding: 6px; }
.batch-item { display: flex; align-items: center; gap: 8px; padding: 6px 4px; font-size: 13px; cursor: pointer; }
.batch-item:hover { background: #f8fbff; }
@media (max-width: 1100px) {
  .cat-layout { grid-template-columns: 1fr; }
  .cat-batch { order: 3; }
}
</style>
