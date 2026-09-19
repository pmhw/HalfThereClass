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
      <button type="button" class="settings-row" @click="openDatabase">
        <span>
          <strong>数据同步</strong>
          <small>导出 / 导入 SQLite，方便本地和线上对齐</small>
        </span>
        <em>{{ dbLabel }}</em>
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

    <div v-if="dialog === 'database'" class="modal-mask">
      <div class="modal narrow" role="dialog">
        <header>
          <h3>数据同步</h3>
          <button class="modal-close" type="button" @click="close">×</button>
        </header>
        <div class="form">
          <p class="muted">导出当前运行库，导入到另一台环境即可同步。导入会先自动备份本机原库。运行中的 `dev.db` 不进 Git，只有 `init.db` 初始快照会进仓库。</p>
          <div class="db-meta">
            <div><small>当前库</small><strong>{{ database.exists ? formatSize(database.size) : '不存在' }}</strong></div>
            <div><small>更新时间</small><strong>{{ database.updatedAt ? formatTime(database.updatedAt) : '—' }}</strong></div>
            <div><small>初始快照</small><strong>{{ database.hasInit ? '已有 init.db' : '未生成' }}</strong></div>
          </div>
          <p v-if="dialogError" class="error">{{ dialogError }}</p>
          <p v-if="dialogOk" class="ok">{{ dialogOk }}</p>
          <div class="form-actions wrap">
            <button class="btn primary" type="button" :disabled="busy" @click="exportDb">{{ busy === 'export' ? '导出中…' : '导出数据库' }}</button>
            <label class="btn" :class="{ disabled: !!busy }">
              {{ busy === 'import' ? '导入中…' : '导入数据库' }}
              <input type="file" accept=".db,application/octet-stream" hidden :disabled="!!busy" @change="importDb" />
            </label>
            <button class="btn" type="button" :disabled="busy" @click="saveInit">{{ busy === 'init' ? '写入中…' : '另存为初始库' }}</button>
            <button class="btn" type="button" @click="close">关闭</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import MarkdownField from '../components/MarkdownField.vue';

const form = ref({ key: '', security: '' });
const agreement = ref({ title: '', content: '' });
const contract = ref({ title: '', content: '' });
const database = ref({ exists: false, size: 0, updatedAt: null, hasInit: false });
const draft = ref({});
const dialog = ref('');
const error = ref('');
const dialogError = ref('');
const dialogOk = ref('');
const saving = ref(false);
const busy = ref('');
const showSecret = ref(false);
const dbLabel = computed(() => (database.value.exists ? formatSize(database.value.size) : '未就绪'));

function formatSize(size) {
  const value = Number(size) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const p = (n) => `${n}`.padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

async function load() {
  try {
    const [amap, text, paper, db] = await Promise.all([
      api.settingsAmap(),
      api.settingsAgreement(),
      api.settingsContract(),
      api.databaseInfo().catch(() => ({ exists: false, size: 0, updatedAt: null, hasInit: false })),
    ]);
    form.value = amap;
    agreement.value = text;
    contract.value = paper;
    database.value = db;
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

async function openDatabase() {
  dialogError.value = '';
  dialogOk.value = '';
  dialog.value = 'database';
  try {
    database.value = await api.databaseInfo();
  } catch (err) {
    dialogError.value = err.message;
  }
}

function close() {
  dialog.value = '';
  dialogError.value = '';
  dialogOk.value = '';
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

async function exportDb() {
  busy.value = 'export';
  dialogError.value = '';
  dialogOk.value = '';
  try {
    const result = await api.exportDatabase();
    dialogOk.value = `已下载 ${result.name}（${formatSize(result.size)}）`;
    database.value = await api.databaseInfo();
  } catch (err) {
    dialogError.value = err.message;
  } finally {
    busy.value = '';
  }
}

async function importDb(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!window.confirm(`确定用「${file.name}」覆盖当前数据库？导入前会自动备份。`)) return;
  busy.value = 'import';
  dialogError.value = '';
  dialogOk.value = '';
  try {
    const result = await api.importDatabase(file);
    dialogOk.value = result.message || '导入成功';
    database.value = await api.databaseInfo();
  } catch (err) {
    dialogError.value = err.message;
  } finally {
    busy.value = '';
  }
}

async function saveInit() {
  if (!window.confirm('把当前运行库写入 prisma/init.db，作为 Git 初始快照？')) return;
  busy.value = 'init';
  dialogError.value = '';
  dialogOk.value = '';
  try {
    const result = await api.saveInitSnapshot();
    dialogOk.value = result.message || '已写入初始库';
    database.value = await api.databaseInfo();
  } catch (err) {
    dialogError.value = err.message;
  } finally {
    busy.value = '';
  }
}

onMounted(load);
</script>

<style scoped>
.db-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0 4px;
}
.db-meta > div {
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
}
.db-meta small { display: block; color: #98a2b3; font-size: 12px; }
.db-meta strong { display: block; margin-top: 4px; font-size: 13px; color: #111827; }
.form-actions.wrap { flex-wrap: wrap; }
.btn.disabled { opacity: 0.55; pointer-events: none; }
.ok { color: #059669; margin: 8px 0 0; }
</style>
