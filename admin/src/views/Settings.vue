<template>
  <section>
    <div class="page-head">
      <div>
        <p class="crumb">系统 / 设置</p>
        <h1>系统设置</h1>
        <p>密钥仍在弹窗里配置。用户协议和教师合同会打开编辑页，左边编写、右边预览。</p>
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
    <div class="settings-grid">
      <button v-if="hasFinance" type="button" class="settings-card" @click="openPin">
        <span class="settings-icon pin"><Icon name="lock" /></span>
        <span class="settings-copy">
          <strong>财务密码</strong>
          <small>{{ pinStatus.canManage ? '进入财务功能前输入的 6 位数字密码，所有管理员共用' : '所有管理员共用，由系统管理员统一设置' }}</small>
        </span>
        <em :class="pinStatus.set ? 'ok' : 'wait'">{{ pinStatus.set ? '已设置' : '未设置' }}</em>
      </button>
      <template v-if="canSystem">
      <article class="settings-card entry-card">
        <span class="settings-icon lock">锁</span>
        <span class="settings-copy">
          <strong>后台入口地址</strong>
          <small>带 12 位随机后缀，域名根路径无法打开。请收藏，勿泄露。</small>
          <code class="entry-url">{{ entryUrl }}</code>
        </span>
        <button type="button" class="btn" @click="copyEntry">{{ entryCopied ? '已复制' : '复制' }}</button>
      </article>
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
        <em :class="smsBadge.tone">{{ smsBadge.text }}</em>
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
      <button type="button" class="settings-card" @click="openPartyA">
        <span class="settings-icon corp">甲</span>
        <span class="settings-copy">
          <strong>合同甲方对公</strong>
          <small>自动填入合同的机构名称、信用代码、住所与联系方式</small>
        </span>
        <em :class="partyA.name ? 'ok' : 'wait'">{{ partyA.name || '未配置' }}</em>
      </button>
      <button v-if="isSuper" type="button" class="settings-card" @click="openDatabase">
        <span class="settings-icon db"><Icon name="layers" /></span>
        <span class="settings-copy">
          <strong>数据同步</strong>
          <small>导出 / 导入 SQLite，方便本地和线上对齐</small>
        </span>
        <em :class="database.exists ? 'ok' : 'wait'">{{ dbLabel }}</em>
      </button>
      </template>
    </div>
    </PageLoad>

    <PageModal
      :open="dialog === 'pin'"
      size="narrow"
      icon="lock"
      :title="pinMode === 'change' ? '修改财务密码' : pinMode === 'reset' ? '重置财务密码' : '设置财务密码'"
      :desc="pinMode === 'set' ? '所有管理员共用一个，进入财务功能前输入，验证通过后在后台操作期间免输，2 小时无操作才需重输' : '所有管理员共用；修改后所有人需要用新密码重新验证'"
      :close-on-backdrop="false"
      @close="close"
    >
      <form class="form pin-form" @submit.prevent="savePin">
        <div v-if="pinMode === 'change'" class="pin-field">
          <span class="pin-label">原财务密码
            <button type="button" class="link-btn" @click="forgotPin">忘记原密码？</button>
          </span>
          <PinInput ref="pinOld" v-model="pinDraft.oldPin" :error="pinOldErrorTick" @complete="pinFirst?.focus()" />
        </div>
        <template v-else>
          <p v-if="pinMode === 'reset'" class="pin-reset-tip">
            忘记原财务密码时，由超级管理员验证本人登录密码后直接重置。
            <button type="button" class="link-btn" @click="pinResetting = false">用原密码修改</button>
          </p>
          <label>当前登录密码
            <input v-model="pinDraft.password" type="password" required autocomplete="current-password" placeholder="验证你本人的身份" />
          </label>
        </template>
        <div class="pin-field">
          <span>{{ pinMode === 'set' ? '财务密码' : '新的财务密码' }}</span>
          <PinInput ref="pinFirst" v-model="pinDraft.pin" :error="pinErrorTick" @complete="pinSecond?.focus()" />
        </div>
        <div class="pin-field">
          <span>再输入一次</span>
          <PinInput ref="pinSecond" v-model="pinDraft.confirm" :error="pinErrorTick" />
        </div>
        <p class="muted">6 位数字，不能是相同或连续的数字。连续输错 5 次，财务功能锁定 15 分钟。</p>
        <p v-if="dialogError" class="error">{{ dialogError }}</p>
        <div class="form-actions">
          <button class="btn" type="button" @click="close">取消</button>
          <button class="btn primary" type="submit" :disabled="saving || pinDraft.pin.length !== 6 || pinDraft.confirm.length !== 6 || (pinMode === 'change' && pinDraft.oldPin.length !== 6)">{{ saving ? '保存中' : '保存' }}</button>
        </div>
      </form>
    </PageModal>

    <PageModal
      :open="dialog === 'wx'"
      size="narrow"
      title="小程序"
      @close="close"
    >
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
    </PageModal>

    <PageModal
      :open="dialog === 'sms'"
      size="narrow"
      title="阿里云短信"
      @close="close"
    >
      <form class="form" @submit.prevent="saveSms">
        <p class="muted">用于手机网页端（/m/）验证码注册登录。请在阿里云短信控制台开通国内短信，并使用<strong>已审核通过</strong>的签名与「验证码」类模板。</p>
        <p class="muted">注意：接口提示成功只代表阿里云已受理；若手机收不到，请到阿里云控制台「国内消息 → 发送记录」用手机号查询，并核对：①签名不要加【】②模板 CODE 正确③模板变量名与下方一致（多为 <code>code</code>）④账户有余额⑤签名已关联该模板。</p>
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
          <input v-model="draft.signName" :required="draft.enabled" placeholder="控制台里的签名，不要写【】" autocomplete="off" />
        </label>
        <label>模板 CODE
          <input v-model="draft.templateCode" :required="draft.enabled" placeholder="SMS_…" autocomplete="off" />
        </label>
        <label>模板变量名
          <input v-model="draft.templateParam" placeholder="须与模板一致，默认 code" autocomplete="off" />
        </label>

        <div class="sms-balance" :class="{ low: smsBalance.low }">
          <div class="sms-balance-head">
            <strong>剩余量</strong>
            <button class="link" type="button" :disabled="balanceLoading || !sms.accessKeyId" @click="loadSmsBalance(true)">
              {{ balanceLoading ? '查询中…' : '刷新' }}
            </button>
          </div>
          <template v-if="!smsBalance.configured">
            <p class="muted">保存 AccessKey 后可查询剩余量。</p>
          </template>
          <template v-else>
            <div class="sms-balance-grid">
              <div>
                <small>资源包剩余</small>
                <b v-if="smsBalance.remaining != null">{{ formatCount(smsBalance.remaining) }} 条</b>
                <b v-else class="faint">{{ smsBalance.packagesQueried ? '未查到' : '—' }}</b>
                <small v-if="smsBalance.total">共 {{ formatCount(smsBalance.total) }} 条</small>
              </div>
              <div>
                <small>账户可用余额</small>
                <b>{{ smsBalance.accountBalance == null ? '—' : `¥${Number(smsBalance.accountBalance).toFixed(2)}` }}</b>
              </div>
            </div>
            <ul v-if="smsBalance.packages?.length" class="sms-packages">
              <li v-for="pkg in smsBalance.packages" :key="pkg.instanceId">
                <span>{{ pkg.name }}</span>
                <span>{{ pkg.remaining == null ? '—' : formatCount(pkg.remaining) }} / {{ pkg.total == null ? '—' : formatCount(pkg.total) }} {{ pkg.unit }}</span>
                <small>{{ pkg.expiryTime ? `到期 ${formatTime(pkg.expiryTime)}` : '' }}</small>
              </li>
            </ul>
            <div v-if="smsBalance.packagesQueried && !smsBalance.packages?.length" class="sms-unmatched">
              <p class="muted tiny">费用中心接口里没有识别到短信资源包。</p>
              <template v-if="smsBalance.otherPackages?.length">
                <p class="muted tiny">费用中心返回的其它资源包（请核对其中是否有短信套餐包）：</p>
                <ul class="sms-packages">
                  <li v-for="(pkg, idx) in smsBalance.otherPackages" :key="idx">
                    <span>{{ pkg.name }}</span>
                    <span>{{ pkg.remaining == null ? '—' : formatCount(pkg.remaining) }} {{ pkg.unit }}</span>
                    <small>{{ [pkg.commodityCode, pkg.packageType].filter(Boolean).join(' · ') }}</small>
                  </li>
                </ul>
              </template>
              <p v-else class="muted tiny">费用中心没有返回任何有效资源包，套餐包余量请以短信控制台「业务统计 → 套餐包资费」为准。</p>
            </div>
            <p v-if="smsBalance.low" class="error">{{ smsBalance.lowMessage }}，请及时到阿里云充值或购买资源包。</p>
            <p v-if="smsBalance.error" class="error">{{ smsBalance.error }}</p>
            <p v-if="smsBalance.checkedAt" class="muted tiny">更新于 {{ formatTime(smsBalance.checkedAt) }}</p>
          </template>
        </div>

        <div class="form-row">
          <label>剩余条数提醒阈值
            <input v-model.number="draft.lowThreshold" type="number" min="0" step="1" placeholder="默认 200" />
          </label>
          <label>余额提醒阈值（元）
            <input v-model.number="draft.lowBalance" type="number" min="0" step="1" placeholder="默认 20" />
          </label>
        </div>
        <p class="muted tiny">资源包剩余低于条数阈值，或没有资源包且账户余额低于金额阈值时，后台顶部会提醒。查询需给 AccessKey 额外授权 <code>AliyunBSSReadOnlyAccess</code>（费用中心只读）。</p>
        <p v-if="dialogError" class="error">{{ dialogError }}</p>
        <div class="form-actions">
          <button class="btn" type="button" @click="showSecret = !showSecret">{{ showSecret ? '隐藏密钥' : '显示密钥' }}</button>
          <button class="btn primary" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存' }}</button>
        </div>
      </form>
    </PageModal>

    <PageModal
      :open="dialog === 'amap'"
      size="narrow"
      title="高德地图"
      @close="close"
    >
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
    </PageModal>

    <PageModal
      :open="dialog === 'partyA'"
      size="narrow"
      title="合同甲方对公信息"
      @close="close"
    >
      <form class="form" @submit.prevent="savePartyA">
        <p class="muted">保存后，教师查看/签署合同时会自动替换模板中的甲方占位符。</p>
        <label>机构名称
          <input v-model="draft.name" required placeholder="上海御炎川科技有限公司" autocomplete="off" />
        </label>
        <label>统一社会信用代码
          <input v-model="draft.creditCode" required placeholder="18位信用代码" autocomplete="off" />
        </label>
        <label>住所地
          <input v-model="draft.address" required placeholder="注册地址" autocomplete="off" />
        </label>
        <label>法定代表人/授权代表
          <input v-model="draft.legalRep" placeholder="可留空" autocomplete="off" />
        </label>
        <label>联系电话
          <input v-model="draft.phone" placeholder="对公联系电话" autocomplete="off" />
        </label>
        <label>电子邮箱
          <input v-model="draft.email" type="email" placeholder="送达邮箱" autocomplete="off" />
        </label>
        <p v-if="dialogError" class="error">{{ dialogError }}</p>
        <div class="form-actions">
          <button class="btn primary" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存' }}</button>
        </div>
      </form>
    </PageModal>

    <PageModal
      :open="dialog === 'database'"
      size="narrow"
      title="数据同步"
      @close="close"
    >
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
    </PageModal>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, getProfile } from '../api';
import { adminEntryUrl } from '../adminBase';
import { FINANCE_PERMS, allow } from '../access';
import { setFinanceToken } from '../financePin';
import Icon from '../components/Icon.vue';
import PageModal from '../components/PageModal.vue';
import PageLoad from '../components/PageLoad.vue';
import PinInput from '../components/PinInput.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { notify } from '../notify';

const entryUrl = ref(adminEntryUrl());
const entryCopied = ref(false);
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
const partyA = ref({ name: '', creditCode: '', address: '', legalRep: '', phone: '', email: '' });
const database = ref({ exists: false, size: 0, updatedAt: null, hasInit: false });
const isSuper = !!getProfile()?.isSuper;
const canSystem = allow(getProfile(), 'admin.settings');
const hasFinance = allow(getProfile(), FINANCE_PERMS);
const pinStatus = ref({ set: false, canManage: canSystem, canReset: false, lockedUntil: null });
const pinDraft = ref({ oldPin: '', password: '', pin: '', confirm: '' });
const pinErrorTick = ref(0);
const pinOldErrorTick = ref(0);
const pinOld = ref(null);
const pinFirst = ref(null);
const pinSecond = ref(null);
const pinResetting = ref(false);
/** set：首次设置（登录密码）；change：修改（原财务密码）；reset：超管忘记原密码时用登录密码重置 */
const pinMode = computed(() => (!pinStatus.value.set ? 'set' : pinResetting.value ? 'reset' : 'change'));

function forgotPin() {
  if (!pinStatus.value.canReset) {
    notify.toast('忘记原财务密码请联系超级管理员重置');
    return;
  }
  pinResetting.value = true;
  dialogError.value = '';
}
const route = useRoute();
const draft = ref({});
const dialog = ref('');
const { loading, ready, error, run, bindLoad } = usePageLoad();
const dialogError = ref('');
const dialogOk = ref('');
const saving = ref(false);
const busy = ref('');
const showSecret = ref(false);
const dbLabel = computed(() => (database.value.exists ? formatSize(database.value.size) : '未就绪'));
const smsBalance = ref({ configured: false, packages: [], remaining: null, total: null, accountBalance: null, low: false, lowMessage: '', error: '' });
const balanceLoading = ref(false);
const smsBadge = computed(() => {
  if (!sms.value.ready) return { tone: 'wait', text: sms.value.enabled ? '未配齐' : '未开启' };
  if (smsBalance.value.low) return { tone: 'low', text: smsBalance.value.remaining != null && smsBalance.value.packages?.length ? `仅剩 ${formatCount(smsBalance.value.remaining)} 条` : '余额不足' };
  if (smsBalance.value.remaining != null && smsBalance.value.packages?.length) return { tone: 'ok', text: `剩 ${formatCount(smsBalance.value.remaining)} 条` };
  return { tone: 'ok', text: '已启用' };
});

function formatCount(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

async function loadSmsBalance(force = false) {
  balanceLoading.value = true;
  try {
    smsBalance.value = await api.smsBalance(force);
  } catch (err) {
    smsBalance.value = { ...smsBalance.value, error: err.message || '查询失败' };
  } finally {
    balanceLoading.value = false;
  }
}

function formatSize(size) {
  const value = Number(size) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

async function copyEntry() {
  const url = entryUrl.value || adminEntryUrl();
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else {
      const input = document.createElement('textarea');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    entryCopied.value = true;
    notify.success('已复制后台入口地址');
    setTimeout(() => { entryCopied.value = false; }, 2000);
  } catch {
    await notify.prompt({
      title: '复制后台入口',
      message: '自动复制失败，请手动选中复制：',
      value: url,
      okText: '关闭',
      cancelText: '取消',
      required: false,
    });
  }
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const p = (n) => `${n}`.padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

async function load() {
  await run(async () => {
    if (hasFinance) pinStatus.value = await api.financePinStatus();
    if (!canSystem) return;
    const [mini, amap, text, paper, corp, db, smsCfg] = await Promise.all([
      api.settingsWx(),
      api.settingsAmap(),
      api.settingsAgreement(),
      api.settingsContract(),
      api.settingsPartyA().catch(() => ({ name: '', creditCode: '', address: '', legalRep: '', phone: '', email: '' })),
      (isSuper ? api.databaseInfo() : Promise.reject()).catch(() => ({ exists: false, size: 0, updatedAt: null, hasInit: false })),
      api.settingsSms().catch(() => ({ enabled: false, ready: false })),
    ]);
    wx.value = mini;
    form.value = amap;
    agreement.value = text;
    contract.value = paper;
    partyA.value = corp;
    database.value = db;
    sms.value = smsCfg;
  });
  if (sms.value.accessKeyId) loadSmsBalance(false);
}

function openPin() {
  if (!pinStatus.value.canManage) {
    notify.toast(pinStatus.value.set ? '财务密码由系统管理员统一设置，如需修改请联系管理员' : '还没有设置财务密码，请联系系统管理员设置');
    return;
  }
  pinDraft.value = { oldPin: '', password: '', pin: '', confirm: '' };
  pinResetting.value = false;
  dialogError.value = '';
  dialog.value = 'pin';
}

async function savePin() {
  if (pinDraft.value.pin !== pinDraft.value.confirm) {
    dialogError.value = '两次输入的财务密码不一致';
    pinDraft.value = { ...pinDraft.value, pin: '', confirm: '' };
    pinErrorTick.value += 1;
    pinFirst.value?.focus();
    return;
  }
  saving.value = true;
  dialogError.value = '';
  try {
    const mode = pinMode.value;
    const data = await api.setFinancePin(mode === 'change'
      ? { oldPin: pinDraft.value.oldPin, pin: pinDraft.value.pin }
      : { password: pinDraft.value.password, pin: pinDraft.value.pin, reset: mode === 'reset' });
    setFinanceToken(data.token, data.expiresAt);
    pinStatus.value = { ...pinStatus.value, set: true, lockedUntil: null };
    close();
    notify.success(mode === 'set' ? '财务密码已设置，所有管理员共用这个密码' : '财务密码已修改，其他管理员需要用新密码重新验证');
  } catch (err) {
    dialogError.value = err.message;
    if (pinMode.value === 'change' && /原财务密码/.test(err.message || '')) {
      pinDraft.value = { ...pinDraft.value, oldPin: '' };
      pinOldErrorTick.value += 1;
      pinOld.value?.focus();
    }
  } finally {
    saving.value = false;
  }
}

watch(() => [route.path, route.query.pin], ([path, pin]) => {
  if (path === '/settings' && pin && canSystem) openPin();
}, { immediate: true });

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
    lowThreshold: sms.value.lowThreshold ?? 200,
    lowBalance: sms.value.lowBalance ?? 20,
  };
  showSecret.value = false;
  dialogError.value = '';
  dialog.value = 'sms';
  if (sms.value.accessKeyId) loadSmsBalance(false);
}

function openAmap() {
  draft.value = { ...form.value };
  showSecret.value = false;
  dialogError.value = '';
  dialog.value = 'amap';
}

function openPartyA() {
  draft.value = { ...partyA.value };
  dialogError.value = '';
  dialog.value = 'partyA';
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
    sms.value = await api.saveSettingsSms({
      enabled: !!draft.value.enabled,
      accessKeyId: String(draft.value.accessKeyId || '').trim(),
      accessKeySecret: String(draft.value.accessKeySecret || '').trim(),
      signName: String(draft.value.signName || '').trim(),
      templateCode: String(draft.value.templateCode || '').trim(),
      templateParam: String(draft.value.templateParam || 'code').trim() || 'code',
      lowThreshold: draft.value.lowThreshold === '' ? 200 : Number(draft.value.lowThreshold ?? 200),
      lowBalance: draft.value.lowBalance === '' ? 20 : Number(draft.value.lowBalance ?? 20),
    });
    close();
    loadSmsBalance(true);
    window.dispatchEvent(new CustomEvent('sms-balance-changed'));
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

async function savePartyA() {
  saving.value = true;
  dialogError.value = '';
  try {
    partyA.value = await api.saveSettingsPartyA({
      name: String(draft.value.name || '').trim(),
      creditCode: String(draft.value.creditCode || '').trim(),
      address: String(draft.value.address || '').trim(),
      legalRep: String(draft.value.legalRep || '').trim(),
      phone: String(draft.value.phone || '').trim(),
      email: String(draft.value.email || '').trim(),
    });
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
  const ok = await notify.confirm({
    title: '导入数据库',
    message: `确定用「${file.name}」覆盖当前数据库？导入前会自动备份。`,
    okText: '确认导入',
    danger: true,
  });
  if (!ok) return;
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
  const ok = await notify.confirm({
    title: '另存为初始库',
    message: '把当前运行库写入 prisma/init.db，作为 Git 初始快照？',
    okText: '确认写入',
    danger: true,
  });
  if (!ok) return;
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

bindLoad(load);
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
.settings-icon.corp { background: #eff6ff; color: #1d4ed8; font-weight: 700; font-size: 16px; }
.settings-icon.db { background: #f5f3ff; color: #7c3aed; }
.settings-icon.lock { background: #fff7ed; color: #c2410c; font-weight: 700; font-size: 15px; }
.settings-icon.pin { background: #fef2f2; color: #dc2626; }
.pin-form .pin-field { display: grid; gap: 8px; color: var(--text); font-size: 13px; font-weight: 600; }
.pin-form .pin-label { display: flex; justify-content: space-between; align-items: center; }
.pin-form .link-btn { padding: 0; border: 0; background: none; color: var(--primary, #2563eb); font-size: 12px; font-weight: 500; cursor: pointer; }
.pin-form .pin-reset-tip { margin: 0; padding: 8px 10px; border-radius: 8px; background: #fffbeb; color: #92400e; font-size: 12px; line-height: 1.6; }
.entry-card {
  grid-column: 1 / -1;
  cursor: default;
}
.entry-card:hover { border-color: var(--line, #e5e7eb); }
.entry-url {
  display: block;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 13px;
  word-break: break-all;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
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
.settings-card em.low { background: #fef3f2; color: #b42318; }
.sms-balance {
  padding: 12px 14px;
  border: 1px solid var(--line, #e4e7ec);
  border-radius: 12px;
  background: #f8fafc;
  display: grid;
  gap: 8px;
}
.sms-balance.low { border-color: #fecdca; background: #fffbfa; }
.sms-balance-head { display: flex; align-items: center; justify-content: space-between; }
.sms-balance-head strong { font-size: 14px; }
.sms-balance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sms-balance-grid > div { padding: 8px 10px; border-radius: 10px; background: #fff; }
.sms-balance-grid small { display: block; color: #98a2b3; font-size: 12px; }
.sms-balance-grid b { display: block; margin: 2px 0; font-size: 18px; color: #111827; font-variant-numeric: tabular-nums; }
.sms-balance.low .sms-balance-grid b { color: #b42318; }
.sms-balance-grid b.faint { color: #98a2b3; font-size: 15px; }
.sms-unmatched { display: grid; gap: 6px; }
.sms-packages { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.sms-packages li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0 10px;
  font-size: 12px;
  color: #475467;
}
.sms-packages li small { grid-column: 1 / -1; color: #98a2b3; }
.muted.tiny { font-size: 12px; margin: 0; }
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
