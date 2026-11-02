<template>
  <section class="doc-page">
    <div class="page-head">
      <div>
        <p class="crumb">系统 / 设置 / {{ title }}</p>
        <h1>{{ title }}</h1>
        <p v-if="kind === 'contract'">左边编写，右边预览。占位符如 <code>&#123;&#123;甲方名称&#125;&#125;</code>、<code>&#123;&#123;乙方身份证号&#125;&#125;</code> 会在签署时自动替换。「导出预览」按甲方对公开一份打印件，可另存 PDF。</p>
        <p v-else>左边编写，右边预览。「导出预览」会打开排版后的打印页，可另存为 PDF。保存后返回系统设置。</p>
      </div>
      <div class="actions">
        <button class="btn" type="button" @click="back">返回</button>
        <button class="btn" type="button" :disabled="exporting || loading" @click="exportPreview">{{ exporting ? '打开中…' : '导出预览' }}</button>
        <button class="btn primary" type="button" :disabled="saving || loading" @click="save">{{ saving ? '保存中' : '保存' }}</button>
      </div>
    </div>
    <PageLoad
      :loading="loading"
      :ready="ready"
      :error="error"
      :columns="3"
      :rows="4"
      @retry="load"
    >
    <p v-if="error" class="error">{{ error }}</p>
    <form class="doc-form" @submit.prevent="save">
      <label class="title-field">标题
        <input v-model="draft.title" required maxlength="30" :placeholder="title" />
      </label>
      <MarkdownField v-model="draft.content" />
    </form>
    </PageLoad>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { buildDocExportHtml, fillContractPreview, openDocExport } from '../docExport';
import { notify } from '../notify';
import MarkdownField from '../components/MarkdownField.vue';
import PageLoad from '../components/PageLoad.vue';
import { usePageLoad } from '../composables/usePageLoad';

const route = useRoute();
const router = useRouter();
const kind = computed(() => (route.meta.kind === 'contract' ? 'contract' : 'agreement'));
const title = computed(() => (kind.value === 'contract' ? '教师服务合同' : '用户协议'));
const draft = ref({ title: '', content: '' });
const { loading, ready, error, run, bindLoad } = usePageLoad();
const saving = ref(false);
const exporting = ref(false);

function back() {
  router.push('/settings');
}

async function load() {
  await run(async () => {
    draft.value = kind.value === 'contract' ? await api.settingsContract() : await api.settingsAgreement();
  });
}

async function exportPreview() {
  const docTitle = String(draft.value.title || '').trim() || title.value;
  const raw = String(draft.value.content || '').trim();
  if (!raw) {
    notify.error('请先填写内容再导出预览');
    return;
  }
  exporting.value = true;
  try {
    let content = raw;
    let note = '';
    let filled = false;
    if (kind.value === 'contract') {
      const partyA = await api.settingsPartyA().catch(() => ({}));
      content = fillContractPreview(raw, partyA || {});
      note = partyA?.name ? `甲方：${partyA.name}` : '未配置合同甲方时，对公信息显示为空白线';
      filled = true;
    }
    const html = buildDocExportHtml({ title: docTitle, content, note, filled });
    const fileName = `${docTitle}.html`;
    const result = openDocExport(html, fileName);
    if (result.opened) notify.success('已打开导出预览，可打印或另存为 PDF');
    else notify.success('弹窗被拦截，已下载 HTML，打开后选择「打印 → 另存为 PDF」');
  } catch (err) {
    notify.error(err?.message || '导出预览失败');
  } finally {
    exporting.value = false;
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

bindLoad(load);
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
