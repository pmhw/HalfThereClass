<template>
  <div class="login">
    <div class="brand">诺维思</div>
    <p class="slogan">{{ slogan }}</p>

    <label class="agree">
      <input v-model="agreed" type="checkbox" />
      <span>我已阅读并同意<a href="javascript:;" @click.prevent="showAgreement = true">《{{ agreementTitle }}》</a></span>
    </label>

    <template v-if="step === 'login'">
      <button class="btn btn-primary btn-block" type="button" :disabled="loading" @click="doLogin">
        {{ loading ? '登录中…' : '进入诺维思' }}
      </button>
      <p class="hint">手机端使用本机账号登录，认证、抢课、课表与小程序同一套接口。</p>
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
      <div class="sheet">
        <h3>{{ agreementTitle }}</h3>
        <pre>{{ agreementContent }}</pre>
        <button class="btn btn-primary btn-block" type="button" @click="showAgreement = false">知道了</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { getAgreement, mobileLogin, updateProfile, uploadAvatar } from '../api';
import { assetUrl, setSession, getUser } from '../store';
import { lock as freezeLock } from '../utils/freeze';
import { showToast } from '../api/request';

const props = defineProps({
  slogan: { type: String, default: '教师端登录' },
});
const emit = defineEmits(['success']);

const step = ref('login');
const loading = ref(false);
const agreed = ref(false);
const avatar = ref('');
const avatarFile = ref(null);
const nickname = ref('');
const agreementTitle = ref('用户协议');
const agreementContent = ref('');
const showAgreement = ref(false);

onMounted(async () => {
  try {
    const paper = await getAgreement();
    agreementTitle.value = paper.title || '用户协议';
    agreementContent.value = paper.content || '';
  } catch {
    /* ignore */
  }
});

async function doLogin() {
  if (!agreed.value) {
    showToast('请先勾选用户协议');
    return;
  }
  if (loading.value) return;
  loading.value = true;
  try {
    const result = await mobileLogin();
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
  z-index: 50;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  max-height: 70vh;
  overflow: auto;
  background: #fff;
  border-radius: calc(24 * var(--r)) calc(24 * var(--r)) 0 0;
  padding: calc(32 * var(--r));
}
.sheet h3 { margin: 0 0 calc(16 * var(--r)); }
.sheet pre {
  white-space: pre-wrap;
  margin: 0 0 calc(24 * var(--r));
  color: #475467;
  font-family: inherit;
  font-size: calc(26 * var(--r));
}
</style>
