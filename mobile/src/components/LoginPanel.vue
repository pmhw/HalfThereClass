<template>
  <div class="login">
    <div class="brand">诺维思</div>
    <p class="slogan">{{ slogan }}</p>

    <label class="agree">
      <input v-model="agreed" type="checkbox" />
      <span>我已阅读并同意<a href="javascript:;" @click.prevent="showAgreement = true">《{{ agreementTitle }}》</a></span>
    </label>

    <template v-if="step === 'login'">
      <form class="sms-form" @submit.prevent="doLogin">
        <input
          v-model="phone"
          class="field"
          type="tel"
          maxlength="11"
          inputmode="numeric"
          autocomplete="tel"
          placeholder="手机号"
        />
        <div class="code-row">
          <input
            v-model="code"
            class="field"
            type="text"
            maxlength="6"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="验证码"
          />
          <button class="btn code-btn" type="button" :disabled="sending || cooldown > 0" @click="sendCode">
            {{ cooldown > 0 ? `${cooldown}s` : sending ? '发送中' : '获取验证码' }}
          </button>
        </div>
        <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
          {{ loading ? '登录中…' : '注册 / 登录' }}
        </button>
      </form>
      <p class="hint">{{ statusHint }}</p>
    </template>

    <form v-else class="profile" @submit.prevent="onProfile">
      <label class="avatar-pick">
        <img v-if="avatar" :src="avatar" alt="" />
        <span v-else>头像</span>
        <input type="file" accept="image/*" hidden @change="onAvatar" />
      </label>
      <input v-model="nickname" class="nick" maxlength="30" placeholder="请输入昵称" />
      <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
        {{ loading ? '保存中…' : '完成' }}
      </button>
    </form>

    <div v-if="showAgreement" class="mask" @click.self="showAgreement = false">
      <div class="sheet" role="dialog" aria-modal="true">
        <header class="sheet-head">
          <h3>{{ agreementTitle }}</h3>
          <button class="sheet-close" type="button" aria-label="关闭" @click="showAgreement = false">×</button>
        </header>
        <div class="sheet-body md" v-html="agreementHtml"></div>
        <div class="sheet-foot">
          <button class="btn btn-primary btn-block" type="button" @click="showAgreement = false">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getAgreement, getSmsStatus, sendSmsCode, smsLogin, updateProfile, uploadAvatar } from '../api';
import { assetUrl, setSession, getUser } from '../store';
import { lock as freezeLock } from '../utils/freeze';
import { showToast } from '../api/request';
import { renderMarkdown } from '../utils/markdown';

const PHONE_KEY = 'mobile_login_phone';
const AGREED_KEY = 'mobile_login_agreed';

const props = defineProps({
  slogan: { type: String, default: '教师端登录' },
});
const emit = defineEmits(['success']);

const step = ref('login');
const loading = ref(false);
const sending = ref(false);
const agreed = ref(localStorage.getItem(AGREED_KEY) === '1');
const phone = ref('');
const code = ref('');
const cooldown = ref(0);
const avatar = ref('');
const avatarFile = ref(null);
const nickname = ref('');
const agreementTitle = ref('用户协议');
const agreementContent = ref('');
const showAgreement = ref(false);
const smsReady = ref(false);
let timer = 0;

const agreementHtml = computed(() => renderMarkdown(agreementContent.value || ''));

const statusHint = computed(() =>
  smsReady.value
    ? '使用手机号验证码注册或登录，与小程序账号相互独立。'
    : '短信登录尚未配置，请管理员在后台「系统设置 → 阿里云短信」启用。',
);

function readSavedPhone() {
  const saved = String(localStorage.getItem(PHONE_KEY) || '').trim();
  return /^1[3-9]\d{0,9}$/.test(saved) ? saved : '';
}

onMounted(async () => {
  phone.value = readSavedPhone();
  try {
    const [paper, status] = await Promise.all([
      getAgreement().catch(() => null),
      getSmsStatus().catch(() => ({ ready: false })),
    ]);
    if (paper) {
      agreementTitle.value = paper.title || '用户协议';
      agreementContent.value = paper.content || '';
    }
    smsReady.value = !!status?.ready;
  } catch {
    /* ignore */
  }
});

watch(phone, (value) => {
  const text = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (text !== value) phone.value = text;
  if (/^1[3-9]\d{9}$/.test(text)) localStorage.setItem(PHONE_KEY, text);
  else if (!text) localStorage.removeItem(PHONE_KEY);
  else localStorage.setItem(PHONE_KEY, text);
});

watch(agreed, (value) => {
  localStorage.setItem(AGREED_KEY, value ? '1' : '0');
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

function startCooldown(seconds = 60) {
  cooldown.value = seconds;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    cooldown.value -= 1;
    if (cooldown.value <= 0) {
      clearInterval(timer);
      timer = 0;
      cooldown.value = 0;
    }
  }, 1000);
}

async function sendCode() {
  if (!agreed.value) {
    showToast('请先勾选用户协议');
    return;
  }
  if (!/^1[3-9]\d{9}$/.test(String(phone.value || '').trim())) {
    showToast('请输入正确的手机号');
    return;
  }
  if (sending.value || cooldown.value > 0) return;
  sending.value = true;
  try {
    const result = await sendSmsCode(phone.value.trim());
    showToast('验证码已发送');
    startCooldown(Number(result?.cooldown) || 60);
  } catch (err) {
    showToast(err.message || '发送失败');
  } finally {
    sending.value = false;
  }
}

async function doLogin() {
  if (!agreed.value) {
    showToast('请先勾选用户协议');
    return;
  }
  if (!/^1[3-9]\d{9}$/.test(String(phone.value || '').trim())) {
    showToast('请输入正确的手机号');
    return;
  }
  if (!String(code.value || '').trim()) {
    showToast('请输入验证码');
    return;
  }
  if (loading.value) return;
  loading.value = true;
  try {
    const result = await smsLogin({ phone: phone.value.trim(), code: code.value.trim() });
    setSession(result.token, result.user);
    const user = result.user || {};
    if (Number(user.status) === 0) {
      freezeLock('账号已冻结');
      return;
    }
    if (user.nickname && user.avatar) {
      emit('success', { user });
      return;
    }
    step.value = 'profile';
    nickname.value = user.nickname || '';
    avatar.value = assetUrl(user.avatar);
  } catch (err) {
    showToast(err.message || '登录失败');
  } finally {
    loading.value = false;
  }
}

function onAvatar(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  avatarFile.value = file;
  avatar.value = URL.createObjectURL(file);
}

async function onProfile() {
  if (!avatar.value) {
    showToast('请先选择头像');
    return;
  }
  const name = String(nickname.value || '').trim();
  if (!name || name === '微信用户') {
    showToast('请填写昵称');
    return;
  }
  loading.value = true;
  try {
    let nextAvatar = avatar.value;
    if (avatarFile.value) {
      const uploaded = await uploadAvatar(avatarFile.value);
      nextAvatar = assetUrl(uploaded.avatar);
    }
    const path = nextAvatar.replace(/^https?:\/\/[^/]+/, '');
    const profile = await updateProfile({ nickname: name, avatar: path });
    const user = { ...(getUser() || {}), ...profile, nickname: name, avatar: nextAvatar };
    setSession(localStorage.getItem('token'), user);
    emit('success', { user });
  } catch (err) {
    showToast(err.message || '资料保存失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login {
  min-height: 70vh;
  padding: calc(48 * var(--r)) calc(40 * var(--r));
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.brand {
  font-size: calc(56 * var(--r));
  font-weight: 750;
  color: #111827;
  text-align: center;
}
.slogan {
  margin: calc(16 * var(--r)) 0 calc(48 * var(--r));
  text-align: center;
  color: #667085;
  font-size: calc(28 * var(--r));
}
.agree {
  display: flex;
  gap: calc(12 * var(--r));
  align-items: flex-start;
  margin-bottom: calc(28 * var(--r));
  color: #667085;
  font-size: calc(24 * var(--r));
}
.agree a { color: #2563eb; }
.sms-form {
  display: flex;
  flex-direction: column;
  gap: calc(20 * var(--r));
}
.field {
  width: 100%;
  height: calc(88 * var(--r));
  border: 1px solid #e7edf5;
  border-radius: calc(16 * var(--r));
  padding: 0 calc(24 * var(--r));
  background: #fff;
  font-size: calc(30 * var(--r));
}
.code-row {
  display: flex;
  gap: calc(16 * var(--r));
}
.code-row .field { flex: 1; }
.code-btn {
  flex: 0 0 auto;
  min-width: calc(200 * var(--r));
  height: calc(88 * var(--r));
  border: 1px solid #dbe4f0;
  border-radius: calc(16 * var(--r));
  background: #f8fafc;
  color: #2563eb;
  font-size: calc(26 * var(--r));
  font-weight: 600;
}
.code-btn:disabled {
  color: #98a2b3;
}
.hint {
  margin-top: calc(24 * var(--r));
  color: #98a2b3;
  font-size: calc(22 * var(--r));
  line-height: 1.6;
  text-align: center;
}
.profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(24 * var(--r));
}
.avatar-pick {
  width: calc(140 * var(--r));
  height: calc(140 * var(--r));
  border-radius: 50%;
  overflow: hidden;
  background: #eef4ff;
  color: #2563eb;
  display: grid;
  place-items: center;
  font-weight: 700;
}
.avatar-pick img { width: 100%; height: 100%; object-fit: cover; }
.nick {
  width: 100%;
  height: calc(88 * var(--r));
  border: 1px solid #e7edf5;
  border-radius: calc(16 * var(--r));
  padding: 0 calc(24 * var(--r));
  background: #fff;
}
.mask {
  position: fixed;
  inset: 0;
  z-index: 100050;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
  box-sizing: border-box;
}
.sheet {
  width: 100%;
  max-width: 100%;
  max-height: min(86vh, 920px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: calc(24 * var(--r)) calc(24 * var(--r)) 0 0;
  box-shadow: 0 -8px 32px rgba(15, 23, 42, 0.12);
  overflow: hidden;
}
.sheet-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(16 * var(--r));
  padding: calc(28 * var(--r)) calc(28 * var(--r)) calc(16 * var(--r));
  border-bottom: 1px solid #eef2f6;
}
.sheet-head h3 {
  margin: 0;
  font-size: calc(32 * var(--r));
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
  padding-right: calc(12 * var(--r));
}
.sheet-close {
  width: calc(56 * var(--r));
  height: calc(56 * var(--r));
  border: 0;
  border-radius: 50%;
  background: #f3f5f8;
  color: #667085;
  font-size: calc(36 * var(--r));
  line-height: 1;
  flex-shrink: 0;
}
.sheet-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  padding: calc(20 * var(--r)) calc(28 * var(--r));
  color: #475467;
  font-size: calc(28 * var(--r));
  line-height: 1.75;
  word-break: break-word;
}
.sheet-body :deep(h1),
.sheet-body :deep(h2),
.sheet-body :deep(h3) {
  color: #111827;
  font-weight: 700;
  margin: 0.9em 0 0.4em;
  line-height: 1.35;
}
.sheet-body :deep(h1) { font-size: 1.15em; }
.sheet-body :deep(h2) { font-size: 1.05em; }
.sheet-body :deep(h3) { font-size: 1em; }
.sheet-body :deep(p) { margin: 0 0 0.75em; color: #344054; }
.sheet-body :deep(ul),
.sheet-body :deep(ol) { margin: 0 0 0.75em; padding-left: 1.25em; }
.sheet-body :deep(li) { margin: 0.15em 0; }
.sheet-body :deep(blockquote) {
  margin: 0 0 0.85em;
  padding: 0.65em 0.85em;
  border-left: 3px solid #93c5fd;
  background: #f8fbff;
  border-radius: 0 8px 8px 0;
}
.sheet-body :deep(blockquote p) { margin: 0; }
.sheet-body :deep(a) { color: #2563eb; word-break: break-all; }
.sheet-foot {
  flex: 0 0 auto;
  padding: calc(16 * var(--r)) calc(28 * var(--r)) calc(20 * var(--r) + env(safe-area-inset-bottom));
  border-top: 1px solid #eef2f6;
  background: #fff;
}
</style>
