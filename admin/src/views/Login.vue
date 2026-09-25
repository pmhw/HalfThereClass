<template>
  <div class="login-page">
    <div class="card login-card">
      <div class="logo">半</div>
      <h1>半堂课</h1>
      <p class="muted">登录课程平台管理后台</p>
      <form class="login-form" @submit.prevent="submit">
        <input v-model="username" placeholder="账号" autocomplete="username" />
        <div class="password-field">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="密码"
            autocomplete="current-password"
            @keydown="onPasswordKey"
            @keyup="onPasswordKey"
            @focus="onPasswordKey"
            @blur="capsOn = false"
          />
          <button
            class="password-toggle"
            type="button"
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            :title="showPassword ? '隐藏密码' : '显示密码'"
            @click="showPassword = !showPassword"
          >
            {{ showPassword ? '隐藏' : '显示' }}
          </button>
        </div>
        <p v-if="capsOn" class="caps-tip">已开启大写锁定（Caps Lock）</p>
        <div class="captcha-slot">
          <button type="button" class="captcha-trigger" :class="{ ok: passed }" @click="toggleCaptcha">
            <span class="captcha-mark">{{ passed ? '✓' : '›' }}</span>
            {{ passed ? '验证通过' : '点击开始验证' }}
          </button>
          <div v-if="open" class="captcha-pop">
            <div class="captcha-board">
              <img v-if="captcha.image" :src="captcha.image" alt="" draggable="false" />
              <span class="captcha-piece" :style="{ transform: `translate3d(${offset}px,0,0)` }"></span>
            </div>
            <div class="captcha-track">
              <div class="captcha-fill" :style="{ width: `${offset}px` }"></div>
              <span class="captcha-knob" :style="{ transform: `translate3d(${offset}px,0,0)` }" @pointerdown="startDrag">›</span>
              <em>{{ hint }}</em>
            </div>
            <div class="captcha-foot">
              <span>{{ captchaTip }}</span>
              <button class="link" type="button" @click="loadCaptcha">换一张</button>
            </div>
          </div>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="login-submit" :disabled="loading">{{ loading ? '登录中…' : '登录' }}</button>
      </form>
      <div class="hint">连续输错 5 次会冻结 15 分钟</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, setSession } from '../api';
import { landingPath } from '../access';

const router = useRouter();
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const capsOn = ref(false);
const error = ref('');
const loading = ref(false);
const open = ref(false);
const passed = ref(false);
const passedOffset = ref(0);
const hint = ref('按住滑块，拖到缺口');
const captchaTip = ref('');
const captcha = ref({ token: '', image: '', width: 280, piece: 42 });
const offset = ref(0);
let snapId = 0;
let dragId = 0;

function onPasswordKey(event) {
  try {
    capsOn.value = !!event.getModifierState?.('CapsLock');
  } catch {
    capsOn.value = false;
  }
}

async function loadCaptcha() {
  snapId += 1;
  offset.value = 0;
  passed.value = false;
  passedOffset.value = 0;
  captchaTip.value = '';
  hint.value = '按住滑块，拖到缺口';
  captcha.value = await api.captcha();
}

async function toggleCaptcha() {
  if (passed.value) return;
  open.value = !open.value;
  if (open.value) {
    try {
      await loadCaptcha();
    } catch (err) {
      error.value = err.message;
      open.value = false;
    }
  }
}

function snapBack() {
  const id = ++snapId;
  const from = offset.value;
  const start = performance.now();
  const step = (now) => {
    if (id !== snapId) return;
    const t = Math.min(1, (now - start) / 420);
    const ease = 1 - (1 - t) ** 3;
    offset.value = from * (1 - ease);
    if (t < 1) requestAnimationFrame(step);
    else offset.value = 0;
  };
  requestAnimationFrame(step);
}

function startDrag(event) {
  if (event.button != null && event.button !== 0) return;
  event.preventDefault();
  const id = ++dragId;
  snapId += 1;
  const knob = event.currentTarget;
  knob.setPointerCapture(event.pointerId);
  const origin = event.clientX;
  const base = offset.value;
  const max = (captcha.value.width || 280) - (captcha.value.piece || 42);
  hint.value = '拖到缺口后松开';
  captchaTip.value = '';

  const move = (point) => {
    offset.value = Math.min(max, Math.max(0, base + point.clientX - origin));
  };
  const stop = async () => {
    knob.removeEventListener('pointermove', move);
    knob.removeEventListener('pointerup', stop);
    knob.removeEventListener('pointercancel', stop);
    if (id !== dragId) return;
    if (offset.value < 8) {
      hint.value = '按住滑块，拖到缺口';
      snapBack();
      return;
    }
    try {
      const result = await api.checkCaptcha({
        captchaToken: captcha.value.token,
        offset: Math.round(offset.value),
      });
      if (id !== dragId) return;
      if (result?.ok) {
        passed.value = true;
        passedOffset.value = Math.round(offset.value);
        open.value = false;
        error.value = '';
        return;
      }
      captchaTip.value = '没对准缺口';
      hint.value = '按住滑块，拖到缺口';
      snapBack();
    } catch (err) {
      if (id !== dragId) return;
      snapBack();
      try {
        await loadCaptcha();
      } catch {
        captcha.value = { token: '', image: '', width: 280, piece: 42 };
      }
      captchaTip.value = '请再滑一次';
    }
  };
  knob.addEventListener('pointermove', move);
  knob.addEventListener('pointerup', stop);
  knob.addEventListener('pointercancel', stop);
}

async function submit() {
  error.value = '';
  if (!passed.value) {
    error.value = '请先完成滑块验证';
    if (!open.value) await toggleCaptcha();
    return;
  }
  loading.value = true;
  try {
    const data = await api.login({
      username: username.value,
      password: password.value,
      captchaToken: captcha.value.token,
      offset: passedOffset.value,
    });
    setSession(data.token, data.admin);
    router.push(landingPath(data.admin) || '/');
  } catch (err) {
    const message = String(err.message || '');
    error.value = message.includes('过期') ? '请重新完成滑块验证' : message;
    passed.value = false;
    open.value = false;
    offset.value = 0;
  } finally {
    loading.value = false;
  }
}
</script>
