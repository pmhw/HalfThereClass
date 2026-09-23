<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>编辑资料</span>
    </header>
    <form class="form" @submit.prevent="onSave">
      <label class="avatar-pick">
        <img v-if="avatar" :src="avatar" alt="" />
        <span v-else>头像</span>
        <input type="file" accept="image/*" hidden @change="onAvatar" />
      </label>
      <input v-model="nickname" class="nick" maxlength="30" placeholder="昵称" />
      <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
        {{ loading ? '保存中…' : '保存' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { updateProfile, uploadAvatar } from '../api';
import { showToast } from '../api/request';
import { assetUrl, getUser, setSession } from '../store';
import { requireLogin } from '../utils/helpers';

const router = useRouter();
const nickname = ref('');
const avatar = ref('');
const avatarFile = ref(null);
const loading = ref(false);

onMounted(() => {
  if (!requireLogin(router)) return;
  const user = getUser() || {};
  nickname.value = user.nickname || '';
  avatar.value = assetUrl(user.avatar);
});

function onAvatar(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  avatarFile.value = file;
  avatar.value = URL.createObjectURL(file);
}

async function onSave() {
  const name = String(nickname.value || '').trim();
  if (!name || name === '微信用户') {
    showToast('请填写昵称');
    return;
  }
  if (!avatar.value) {
    showToast('请选择头像');
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
    showToast('保存成功');
    setTimeout(() => router.back(), 800);
  } catch (err) {
    showToast(err.message || '保存失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); }
.nav { display: flex; align-items: center; gap: calc(16 * var(--r)); margin-bottom: calc(40 * var(--r)); font-weight: 650; }
.back { color: #2563eb; }
.form { display: flex; flex-direction: column; align-items: center; gap: calc(24 * var(--r)); }
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
</style>
