<template>
  <PageModal :open="open" size="narrow" title="换老师：之前的课怎么算" @close="$emit('close')">
    <form class="form" @submit.prevent="submit">
      <ul class="tc-courses">
        <li v-for="item in items" :key="item.courseId">
          <span class="tc-title">{{ item.title }}</span>
          <span class="tc-swap">
            <span class="muted">{{ item.fromName || '未安排' }}</span>
            <span class="tc-arrow">→</span>
            <strong>{{ item.toName || '未安排' }}</strong>
          </span>
        </li>
      </ul>
      <p v-if="note" class="muted tc-note">{{ note }}</p>

      <label class="check-line"><input v-model="mode" type="radio" value="today" /><span>从今天（{{ today }}）起生效，之前已上的课不变</span></label>
      <label class="check-line"><input v-model="mode" type="radio" value="date" /><span>从指定日期起生效</span></label>
      <label v-if="mode === 'date'">生效日期<input v-model="date" type="date" :max="today" required /></label>
      <label class="check-line"><input v-model="mode" type="radio" value="all" /><span>之前已上的课也全部改过来</span></label>
      <p class="muted tc-note">生效日之前的课仍算原老师（还没记课时费的也补记给原老师）；生效日起{{ targetText }}。已固定月份或已打款的课次不会改动。</p>

      <div class="teacher-change-preview">
        <p v-if="loading" class="muted">正在统计受影响的课次…</p>
        <template v-else-if="previews.length">
          <p v-if="!total" class="muted">生效日之后还没有已上完的课次，之后的课直接{{ targetText }}。</p>
          <template v-else>
            <p>将改动：<strong>{{ movable }}</strong> 节<span v-if="locked">，已固定不改：{{ locked }} 节</span></p>
            <template v-for="group in previews" :key="group.courseId">
              <p v-if="previews.length > 1 && group.list.length" class="tc-group">{{ group.title }}</p>
              <ul class="teacher-change-list">
                <li v-for="row in group.list" :key="`${group.courseId}-${row.date}-${row.startTime}`" :class="{ locked: row.locked }">
                  <span>{{ row.date }} {{ row.startTime }}</span>
                  <span class="muted">现记：{{ row.teachers.length ? row.teachers.map((t) => t.name).join('、') : '未记老师' }}</span>
                  <span v-if="row.locked" class="tag">已固定</span>
                </li>
              </ul>
            </template>
          </template>
        </template>
      </div>

      <p v-if="error || loadError" class="error">{{ error || loadError }}</p>
      <div class="form-actions">
        <button class="btn primary" type="submit" :disabled="saving || loading || !from">{{ saving ? '保存中' : '确认更换' }}</button>
        <button class="btn" type="button" @click="$emit('close')">取消</button>
      </div>
    </form>
  </PageModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import PageModal from './PageModal.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  /** [{ courseId, title, fromName, toName }]，toName 为空表示改成未安排 */
  items: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  note: { type: String, default: '' },
  error: { type: String, default: '' },
});
const emit = defineEmits(['confirm', 'close']);

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const today = ref(todayKey());
const mode = ref('today');
const date = ref(today.value);
const previews = ref([]);
const loading = ref(false);
const loadError = ref('');
let seq = 0;

const from = computed(() => {
  if (mode.value === 'all') return '2000-01-01';
  if (mode.value === 'date') return date.value;
  return today.value;
});
const targetText = computed(() => (props.items.some((item) => item.toName) ? '算新老师' : '不再记老师'));
const total = computed(() => previews.value.reduce((sum, row) => sum + row.total, 0));
const movable = computed(() => previews.value.reduce((sum, row) => sum + row.movable, 0));
const locked = computed(() => previews.value.reduce((sum, row) => sum + row.locked, 0));

async function loadPreview() {
  if (!props.open || !from.value || !props.items.length) return;
  const id = ++seq;
  loading.value = true;
  loadError.value = '';
  try {
    const rows = await Promise.all(props.items.map(async (item) => ({
      courseId: item.courseId,
      title: item.title,
      ...(await api.courseTeacherChange(item.courseId, from.value)),
    })));
    if (id === seq) previews.value = rows;
  } catch (err) {
    if (id === seq) loadError.value = err.message;
  } finally {
    if (id === seq) loading.value = false;
  }
}

watch(() => props.open, (open) => {
  if (!open) return;
  today.value = todayKey();
  mode.value = 'today';
  date.value = today.value;
  previews.value = [];
  loadPreview();
});
watch(from, loadPreview);

function submit() {
  if (from.value) emit('confirm', from.value);
}
</script>

<style scoped>
.tc-courses { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.tc-courses li {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 12px; border-radius: 10px; background: #f5f9ff; font-size: 13px;
}
.tc-title { font-weight: 600; color: #0f172a; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tc-swap { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.tc-swap .muted { margin: 0; }
.tc-arrow { color: #94a3b8; }
.tc-swap strong { color: #1d4ed8; }
.tc-note { margin: 0; font-size: 12px; }
.tc-group { margin-top: 10px !important; font-weight: 600; color: #344054; }
</style>
