<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>教师服务合同</span>
    </header>

    <div v-if="paper.signed" class="card ok">合同已签订</div>

    <div class="card paper">
      <h2>{{ paper.title || '教师服务合同' }}</h2>
      <pre class="content">{{ paper.content || '' }}</pre>
    </div>

    <template v-if="!paper.signed">
      <label class="agree">
        <input v-model="agreed" type="checkbox" />
        <span>我已阅读并同意上述合同条款</span>
      </label>
      <div class="pad-wrap card">
        <div class="pad-label">手写签名</div>
        <canvas
          ref="canvasRef"
          class="pad"
          @mousedown="startDraw"
          @mousemove="moveDraw"
          @mouseup="endDraw"
          @mouseleave="endDraw"
          @touchstart.prevent="touchStart"
          @touchmove.prevent="touchMove"
          @touchend="endDraw"
        />
        <button type="button" class="link" @click="clearPad">清除签名</button>
      </div>
      <button class="btn btn-primary btn-block" type="button" :disabled="saving" @click="submit">
        {{ saving ? '提交中…' : '确认签订' }}
      </button>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getContract, signContract } from '../api';
import { showToast } from '../api/request';
import { requireLogin } from '../utils/helpers';

const router = useRouter();
const paper = ref({ title: '教师服务合同', status: 'none', signed: false, content: '' });
const agreed = ref(false);
const drew = ref(false);
const saving = ref(false);
const canvasRef = ref(null);
let ctx = null;
let last = null;
let drawing = false;

onMounted(async () => {
  if (!requireLogin(router)) return;
  await load();
  initCanvas();
});

async function load() {
  try {
    paper.value = await getContract();
  } catch (err) {
    showToast(err.message || '加载失败');
  }
}

function initCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function pointFromEvent(e) {
  const canvas = canvasRef.value;
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function startDraw(e) {
  drawing = true;
  last = pointFromEvent(e);
}

function touchStart(e) {
  startDraw(e);
}

function moveDraw(e) {
  if (!drawing || !ctx || !last) return;
  const p = pointFromEvent(e);
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  last = p;
  drew.value = true;
}

function touchMove(e) {
  moveDraw(e);
}

function endDraw() {
  drawing = false;
  last = null;
}

function clearPad() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drew.value = false;
}

async function submit() {
  if (paper.value.status !== 'approved') {
    showToast('认证通过后才能签订');
    return;
  }
  if (!agreed.value) {
    showToast('请先阅读并勾选合同');
    return;
  }
  if (!drew.value) {
    showToast('请手写签名');
    return;
  }
  saving.value = true;
  try {
    const canvas = canvasRef.value;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export'))), 'image/png');
    });
    const file = new File([blob], 'signature.png', { type: 'image/png' });
    await signContract(file);
    showToast('合同已签订');
    await load();
  } catch (err) {
    showToast(err.message || '签订失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); padding-bottom: calc(48 * var(--r)); }
.nav { display: flex; align-items: center; gap: calc(16 * var(--r)); margin-bottom: calc(24 * var(--r)); font-weight: 650; }
.back { color: #2563eb; }
.ok { margin-bottom: calc(20 * var(--r)); color: #16a34a; font-weight: 600; text-align: center; }
.paper { margin-bottom: calc(20 * var(--r)); }
.paper h2 { margin: 0 0 calc(16 * var(--r)); font-size: calc(32 * var(--r)); }
.content {
  white-space: pre-wrap;
  margin: 0;
  color: #475467;
  font-family: inherit;
  font-size: calc(26 * var(--r));
  line-height: 1.65;
  max-height: calc(480 * var(--r));
  overflow: auto;
}
.agree { display: flex; gap: calc(12 * var(--r)); margin-bottom: calc(20 * var(--r)); color: #667085; }
.pad-wrap { margin-bottom: calc(24 * var(--r)); }
.pad-label { margin-bottom: calc(12 * var(--r)); color: #667085; }
.pad {
  width: 100%;
  height: calc(280 * var(--r));
  background: #fafafa;
  border: 1px dashed #d0d5dd;
  border-radius: calc(12 * var(--r));
  touch-action: none;
}
.link { color: #2563eb; margin-top: calc(12 * var(--r)); font-size: calc(26 * var(--r)); }
</style>
