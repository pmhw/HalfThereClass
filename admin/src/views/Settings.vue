<template>
  <section>
    <div class="page-head">
      <div>
        <p class="crumb">系统设置</p>
        <h1>系统设置</h1>
        <p>点某一项，在弹窗里配置。空白处不会关闭，点 × 才关闭。</p>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <article class="card settings-list">
      <button type="button" class="settings-row" @click="openAmap">
        <span>
          <strong>高德地图</strong>
          <small>学校地图搜索和选点使用的密钥</small>
        </span>
        <em>{{ form.key ? '已配置' : '未配置' }}</em>
      </button>
      <button type="button" class="settings-row" @click="openAgreement">
        <span>
          <strong>用户协议</strong>
          <small>教师登录前阅读并勾选，支持 Markdown 排版</small>
        </span>
        <em>{{ agreement.title || '未配置' }}</em>
      </button>
      <button type="button" class="settings-row" @click="openContract">
        <span>
          <strong>教师服务合同</strong>
          <small>认证通过后签订。未签订不能安排课程，也不能抢课</small>
        </span>
        <em>{{ contract.title || '未配置' }}</em>
      </button>
    </article>

    <div v-if="dialog === 'amap'" class="modal-mask">
      <div class="modal narrow" role="dialog">
        <header>
          <h3>高德地图</h3>
          <button class="modal-close" type="button" @click="close">×</button>
        </header>
        <form class="form" @submit.prevent="saveAmap">
          <p class="muted">在高德开放平台创建「Web端(JS API)」应用，填写 Key 和安全密钥，并把当前后台域名加入白名单。</p>
          <label>Web端 Key
            <input v-model="draft.key" required placeholder="请输入高德 Key" autocomplete="off" />
          </label>
          <label>安全密钥
            <input v-model="draft.security" required placeholder="请输入安全密钥" autocomplete="off" :type="showSecret ? 'text' : 'password'" />
          </label>
          <p v-if="dialogError" class="error">{{ dialogError }}</p>
          <div class="form-actions">
            <button class="btn" type="button" @click="showSecret = !showSecret">{{ showSecret ? '隐藏密钥' : '显示密钥' }}</button>
            <button class="btn primary" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="dialog === 'agreement' || dialog === 'contract'" class="modal-mask">
      <div class="modal md-dialog" role="dialog">
        <header>
          <h3>{{ dialog === 'contract' ? '教师服务合同' : '用户协议' }}</h3>
          <button class="modal-close" type="button" @click="close">×</button>
        </header>
        <form class="form" @submit.prevent="saveText">
          <p class="muted">左边编写，右边预览。支持标题、加粗、列表、引用和链接。</p>
          <label>{{ dialog === 'contract' ? '合同标题' : '协议标题' }}
            <input v-model="draft.title" required maxlength="30" :placeholder="dialog === 'contract' ? '教师服务合同' : '用户协议'" />
          </label>
          <MarkdownField v-model="draft.content" />
          <p v-if="dialogError" class="error">{{ dialogError }}</p>
          <div class="form-actions">
            <button class="btn" type="button" @click="close">取消</button>
            <button class="btn primary" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api';
import MarkdownField from '../components/MarkdownField.vue';

const form = ref({ key: '', security: '' });
const agreement = ref({ title: '', content: '' });
const contract = ref({ title: '', content: '' });
const draft = ref({});
const dialog = ref('');
const error = ref('');
const dialogError = ref('');
const saving = ref(false);
const showSecret = ref(false);

async function load() {
  try {
    const [amap, text, paper] = await Promise.all([api.settingsAmap(), api.settingsAgreement(), api.settingsContract()]);
    form.value = amap;
    agreement.value = text;
    contract.value = paper;
  } catch (err) {
    error.value = err.message;
  }
}

function openAmap() {
  draft.value = { ...form.value };
  showSecret.value = false;
  dialogError.value = '';
  dialog.value = 'amap';
}

function openAgreement() {
  draft.value = { ...agreement.value };
  dialogError.value = '';
  dialog.value = 'agreement';
}

function openContract() {
  draft.value = { ...contract.value };
  dialogError.value = '';
  dialog.value = 'contract';
}

function close() {
  dialog.value = '';
  dialogError.value = '';
}

async function saveAmap() {
  saving.value = true;
  dialogError.value = '';
  try {
    form.value = await api.saveSettingsAmap(draft.value);
    close();
  } catch (err) {
    dialogError.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function saveText() {
  saving.value = true;
  dialogError.value = '';
  try {
    if (dialog.value === 'contract') contract.value = await api.saveSettingsContract(draft.value);
    else agreement.value = await api.saveSettingsAgreement(draft.value);
    close();
  } catch (err) {
    dialogError.value = err.message;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
