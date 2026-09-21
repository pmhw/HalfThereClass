<template>
  <section class="doc-page">
    <div class="page-head">
      <div>
        <p class="crumb">系统 / 设置 / {{ title }}</p>
        <h1>{{ title }}</h1>
        <p>左边编写，右边预览。保存后返回系统设置。</p>
      </div>
      <div class="actions">
        <button class="btn" type="button" @click="back">返回</button>
        <button class="btn primary" type="button" :disabled="saving || loading" @click="save">{{ saving ? '保存中' : '保存' }}</button>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <form class="doc-form" @submit.prevent="save">
      <label class="title-field">标题
        <input v-model="draft.title" required maxlength="30" :placeholder="title" />
      </label>
      <MarkdownField v-model="draft.content" />
    </form>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import MarkdownField from '../components/MarkdownField.vue';

const route = useRoute();
const router = useRouter();
const kind = computed(() => (route.meta.kind === 'contract' ? 'contract' : 'agreement'));
const title = computed(() => (kind.value === 'contract' ? '教师服务合同' : '用户协议'));
const draft = ref({ title: '', content: '' });
const error = ref('');
const loading = ref(true);
const saving = ref(false);

function back() {
  router.push('/settings');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    draft.value = kind.value === 'contract' ? await api.settingsContract() : await api.settingsAgreement();
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!draft.value.title?.trim()) {
    error.value = '请填写标题';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    if (kind.value === 'contract') await api.saveSettingsContract(draft.value);
    else await api.saveSettingsAgreement(draft.value);
    back();
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.doc-page { display: flex; flex-direction: column; min-height: calc(100vh - 132px); }
.doc-form { display: flex; flex-direction: column; flex: 1; min-height: 0; margin-top: 16px; }
.title-field { display: block; margin-bottom: 12px; color: #344054; font-size: 13px; font-weight: 650; }
.title-field input {
  display: block;
  width: 100%;
  height: 40px;
  margin-top: 6px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 14px;
}
.doc-form :deep(.md-editor) { flex: 1; }
</style>
