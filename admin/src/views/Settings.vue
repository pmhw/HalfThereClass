<template>
  <section>
    <div class="page-head">
      <div>
        <p class="crumb">系统 / 设置</p>
        <h1>系统设置</h1>
        <p>密钥仍在弹窗里配置。用户协议和教师合同会打开编辑页，左边编写、右边预览。</p>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="settings-grid">
      <button type="button" class="settings-card" @click="openWx">
        <span class="settings-icon wx">微</span>
        <span class="settings-copy">
          <strong>小程序</strong>
          <small>登录用的 AppID 和 AppSecret，保存后立即生效</small>
        </span>
        <em :class="wx.ready ? 'ok' : 'wait'">{{ wx.ready ? '已配置' : '未配置' }}</em>
      </button>
      <button type="button" class="settings-card" @click="openSms">
        <span class="settings-icon sms">信</span>
        <span class="settings-copy">
          <strong>阿里云短信</strong>
          <small>手机网页端验证码注册 / 登录</small>
        </span>
        <em :class="sms.ready ? 'ok' : 'wait'">{{ sms.ready ? '已启用' : (sms.enabled ? '未配齐' : '未开启') }}</em>
      </button>
      <button type="button" class="settings-card" @click="openAmap">
        <span class="settings-icon map"><Icon name="pin" /></span>
        <span class="settings-copy">
          <strong>高德地图</strong>
          <small>学校地图搜索和选点使用的密钥</small>
        </span>
        <em :class="form.key ? 'ok' : 'wait'">{{ form.key ? '已配置' : '未配置' }}</em>
      </button>
      <router-link class="settings-card" to="/settings/agreement">
        <span class="settings-icon doc"><Icon name="book" /></span>
        <span class="settings-copy">
          <strong>用户协议</strong>
          <small>教师登录前阅读并勾选，支持 Markdown 排版</small>
        </span>
        <em :class="agreement.title ? 'ok' : 'wait'">{{ agreement.title || '未配置' }}</em>
      </router-link>
      <router-link class="settings-card" to="/settings/contract">
        <span class="settings-icon file"><Icon name="receipt" /></span>
        <span class="settings-copy">
          <strong>教师服务合同</strong>
          <small>认证通过后签订。未签订不能安排课程，也不能抢课</small>
        </span>
        <em :class="contract.title ? 'ok' : 'wait'">{{ contract.title || '未配置' }}</em>
      </router-link>
      <button type="button" class="settings-card" @click="openDatabase">
        <span class="settings-icon db"><Icon name="layers" /></span>
        <span class="settings-copy">
          <strong>数据同步</strong>
          <small>导出 / 导入 SQLite，方便本地和线上对齐</small>
        </span>
        <em :class="database.exists ? 'ok' : 'wait'">{{ dbLabel }}</em>
      </button>
    </div>

    <div v-if="dialog === 'wx'" class="modal-mask">
      <div class="modal narrow" role="dialog">
        <header>
          <h3>小程序</h3>
          <button class="modal-close" type="button" @click="close">×</button>
        </header>
        <form class="form" @submit.prevent="saveWx">
          <p class="muted">填写微信公众平台「开发管理 → 开发设置」里的 AppID 和 AppSecret。须与小程序工程里的 AppID 一致，并配置 request 合法域名。</p>
          <label>AppID
            <input v-model="draft.appId" required placeholder="wx 开头的 AppID" autocomplete="off" />
          </label>
          <label>AppSecret
            <input v-model="draft.secret" :required="!wx.hasSecret" :placeholder="wx.hasSecret ? '已配置，留空或保持掩码则不修改' : '请输入 AppSecret'" autocomplete="off" :type="showSecret ? 'text' : 'password'" />
          </label>
          <p v-if="dialogError" class="error">{{ dialogError }}</p>
          <div class="form-actions">
            <button class="btn" type="button" @click="showSecret = !showSecret">{{ showSecret ? '隐藏密钥' : '显示密钥' }}</button>
            <button class="btn primary" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="dialog === 'sms'" class="modal-mask">
      <div class="modal narrow" role="dialog">
        <header>
          <h3>阿里云短信</h3>
          <button class="modal-close" type="button" @click="close">×</button>
        </header>
        <form class="form" @submit.prevent="saveSms">
          <p class="muted">用于手机网页端（/m/）验证码注册登录。请在阿里云短信服务开通国内短信，创建签名与验证码模板（模板变量建议为 code）。</p>
          <label class="check">
            <input v-model="draft.enabled" type="checkbox" />
            <span>启用短信登录</span>
          </label>
          <label>AccessKey ID
            <input v-model="draft.accessKeyId" :required="draft.enabled" placeholder="LTAI…" autocomplete="off" />
          </label>
          <label>AccessKey Secret
            <input v-model="draft.accessKeySecret" :required="draft.enabled && !sms.hasSecret" :placeholder="sms.hasSecret ? '已配置，留空或保持掩码则不修改' : '请输入 Secret'" autocomplete="off" :type="showSecret ? 'text' : 'password'" />
          </label>
          <label>短信签名
            <input v-model="draft.signName" :required="draft.enabled" placeholder="控制台审核通过的签名" autocomplete="off" />
          </label>
          <label>模板 CODE
            <input v-model="draft.templateCode" :required="draft.enabled" placeholder="SMS_…" autocomplete="off" />
          </label>
          <label>模板变量名
            <input v-model="draft.templateParam" placeholder="默认 code" autocomplete="off" />
          </label>
          <p v-if="dialogError" class="error">{{ dialogError }}</p>
          <div class="form-actions">
            <button class="btn" type="button" @click="showSecret = !showSecret">{{ showSecret ? '隐藏密钥' : '显示密钥' }}</button>
            <button class="btn primary" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

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
            <input v-model="draft.security" :required="!form.hasSecurity" :placeholder="form.hasSecurity ? '已配置，留空或保持掩码则不修改' : '请输入安全密钥'" autocomplete="off" :type="showSecret ? 'text' : 'password'" />
          </label>
          <p v-if="dialogError" class="error">{{ dialogError }}</p>
          <div class="form-actions">
            <button class="btn" type="button" @click="showSecret = !showSecret">{{ showSecret ? '隐藏密钥' : '显示密钥' }}</button>
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
import Icon from '../components/Icon.vue';

const form = ref({ key: '', security: '' });
const wx = ref({ appId: '', secret: '', ready: false });
const sms = ref({
  enabled: false,
  accessKeyId: '',
  accessKeySecret: '',
  hasSecret: false,
  signName: '',
  templateCode: '',
  templateParam: 'code',
  ready: false,
});
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
    const [mini, amap, text, paper, db, smsCfg] = await Promise.all([
      api.settingsWx(),
      api.settingsAmap(),
      api.settingsAgreement(),
      api.settingsContract(),
      api.databaseInfo().catch(() => ({ exists: false, size: 0, updatedAt: null, hasInit: false })),
      api.settingsSms().catch(() => ({ enabled: false, ready: false })),
    ]);
    wx.value = mini;
    form.value = amap;
    agreement.value = text;
    contract.value = paper;
    database.value = db;
    sms.value = smsCfg;
  } catch (err) {
    error.value = err.message;
  }
}

function openWx() {
  draft.value = { appId: wx.value.appId, secret: wx.value.secret };
  showSecret.value = false;
  dialogError.value = '';
  dialog.value = 'wx';
}

function openSms() {
  draft.value = {
    enabled: !!sms.value.enabled,
    accessKeyId: sms.value.accessKeyId || '',
    accessKeySecret: sms.value.accessKeySecret || '',
    signName: sms.value.signName || '',
    templateCode: sms.value.templateCode || '',
    templateParam: sms.value.templateParam || 'code',
  };
  showSecret.value = false;
  dialogError.value = '';
  dialog.value = 'sms';
}

function openAmap() {
  draft.value = { ...form.value };
  showSecret.value = false;
  dialogError.value = '';
  dialog.value = 'amap';
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

async function saveWx() {
  saving.value = true;
  dialogError.value = '';
  try {
    wx.value = await api.saveSettingsWx(draft.value);
    close();
  } catch (err) {
    dialogError.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function saveSms() {
  saving.value = true;
  dialogError.value = '';
  try {
    sms.value = await api.saveSettingsSms(draft.value);
    close();
  } catch (err) {
    dialogError.value = err.message;
  } finally {
    saving.value = false;
  }
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
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}
.settings-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 92px;
  padding: 16px 18px;
  text-align: left;
  text-decoration: none;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
  box-shadow: var(--shadow);
  color: inherit;
  transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.settings-card:hover {
  border-color: #c9d7f2;
  box-shadow: 0 8px 22px rgba(37, 99, 235, 0.08);
  transform: translateY(-1px);
}
.settings-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex: none;
}
.settings-icon.wx { background: #ecfdf3; color: #059669; font-weight: 700; font-size: 16px; }
.settings-icon.sms { background: #fff1f2; color: #e11d48; font-weight: 700; font-size: 16px; }
.settings-icon.map { background: #eef4ff; color: #2563eb; }
.settings-icon.doc { background: #ecfdf3; color: #059669; }
.settings-icon.file { background: #fff7ed; color: #c2410c; }
.settings-icon.db { background: #f5f3ff; color: #7c3aed; }
.form label.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.form label.check input { width: auto; }
.settings-copy { min-width: 0; flex: 1; }
.settings-copy strong { display: block; font-size: 15px; font-weight: 650; }
.settings-copy small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}
.settings-card em {
  flex: none;
  max-width: 140px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
  line-height: 26px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.settings-card em.ok { background: #ecfdf3; color: #047857; }
.settings-card em.wait { background: #f2f4f7; color: #667085; }
@media (max-width: 860px) {
  .settings-grid { grid-template-columns: 1fr; }
  .settings-card em { max-width: 96px; }
}
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
