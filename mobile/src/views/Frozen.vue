<template>
  <div class="page safe-bottom">
    <div class="lock">🔒</div>
    <h1>账号已冻结</h1>
    <p class="msg">{{ message }}</p>
    <p class="hint">暂时无法使用，如有疑问请联系管理员。</p>
    <button class="btn btn-primary btn-block" type="button" @click="recheck">重新检测</button>
    <button class="btn btn-outline btn-block" type="button" @click="logoutToLogin">退出登录</button>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getProfile } from '../api';
import { getToken } from '../store';
import { clear, getFrozenMessage, isFrozenMessage, logoutToLogin } from '../utils/freeze';

const router = useRouter();
const message = ref(getFrozenMessage());

onMounted(() => recheck());

async function recheck() {
  if (!getToken()) {
    router.replace('/login');
    return;
  }
  try {
    const user = await getProfile();
    if (!user || Number(user.status) !== 0) {
      clear();
      router.replace('/');
    }
  } catch (err) {
    const text = err?.message || '';
    if (isFrozenMessage(text)) message.value = text;
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: calc(80 * var(--r)) calc(40 * var(--r));
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: #f7f8fa;
}
.lock { font-size: calc(80 * var(--r)); margin-bottom: calc(24 * var(--r)); }
h1 { margin: 0; font-size: calc(40 * var(--r)); color: #111827; }
.msg { margin: calc(24 * var(--r)) 0 calc(12 * var(--r)); color: #475467; line-height: 1.6; }
.hint { margin: 0 0 calc(48 * var(--r)); color: #98a2b3; font-size: calc(26 * var(--r)); }
.btn { margin-bottom: calc(20 * var(--r)); max-width: 100%; }
</style>
