<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>教师服务合同</span>
    </header>

    <div v-if="!loaded" class="card muted">加载中…</div>

    <div v-else-if="paper.signed" class="card done">
      <div class="badge">已签订</div>
      <h2>{{ paper.title || '教师服务合同' }}</h2>
      <p class="sub">现在可以抢课，后台也可以把课程安排给你</p>
      <div class="doc">
        <div class="md" v-html="html"></div>
      </div>
      <div v-if="signUrl" class="sign-box">
        <div class="sign-label">我的签名</div>
        <img :src="signUrl" alt="签名" />
      </div>
    </div>

    <div v-else-if="paper.status !== 'approved'" class="card wait">
      <h2>还不能签订</h2>
      <p class="sub">请先完成教师认证，审核通过后再签订合同</p>
      <button class="btn btn-primary btn-block" type="button" @click="router.push('/certify')">去认证</button>
    </div>

    <template v-else>
      <div class="card paper">
        <div class="paper-head">
          <span class="seal">合同</span>
          <h2>{{ paper.title || '教师服务合同' }}</h2>
        </div>
        <div class="doc">
          <div class="md" v-html="html"></div>
        </div>
      </div>

      <label class="agree">
        <input v-model="agreed" type="checkbox" />
        <span>我已阅读并同意《{{ paper.title || '教师服务合同' }}》</span>
      </label>

      <div class="pad-wrap card">
        <div class="pad-label">手写签名 <em>*</em></div>
        <p class="pad-hint">请在框内签名，签名会随合同一起保存</p>
        <div class="pad-frame">
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
          <span v-if="!drew" class="pad-placeholder">在这里签名</span>
        </div>
        <button type="button" class="link" @click="clearPad">重写</button>
      </div>

      <button class="btn btn-primary btn-block" type="button" :disabled="saving" @click="submit">
        {{ saving ? '提交中…' : '确认签订' }}
      </button>
      <p class="foot">签订后才能抢课，后台也才能安排课程</p>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getContract, signContract } from '../api';
import { showToast } from '../api/request';
import { assetUrl } from '../store';
import { requireLogin } from '../utils/helpers';
import { renderMarkdown } from '../utils/markdown';

const router = useRouter();
const paper = ref({ title: '教师服务合同', status: 'none', signed: false, content: '', sign: '' });
const loaded = ref(false);
const agreed = ref(false);
const drew = ref(false);
const saving = ref(false);
const canvasRef = ref(null);
let ctx = null;
let last = null;
let drawing = false;

const html = computed(() => renderMarkdown(paper.value.content || ''));
const signUrl = computed(() => assetUrl(paper.value.sign || ''));

onMounted(async () => {
  if (!requireLogin(router)) return;
  await load();
});

watch(
  () => [loaded.value, paper.value.signed, paper.value.status],
  async () => {
    if (loaded.value && !paper.value.signed && paper.value.status === 'approved') {
      await nextTick();
      initCanvas();
    }
  },
);

async function load() {
  try {
    paper.value = await getContract();
  } catch (err) {
    showToast(err.message || '加载失败');
  } finally {
    loaded.value = true;
  }
}

function initCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
.page {
  min-height: 100vh;
  padding: calc(24 * var(--r));
  padding-bottom: calc(56 * var(--r));
  background: #eef2f7;
}
.nav {
  display: flex;
  align-items: center;
  gap: calc(16 * var(--r));
  margin-bottom: calc(20 * var(--r));
  font-weight: 650;
  color: #111827;
}
.back { color: #2563eb; }
.card {
  background: #fff;
  border-radius: calc(20 * var(--r));
  padding: calc(28 * var(--r));
  margin-bottom: calc(20 * var(--r));
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
.muted { color: #98a2b3; text-align: center; }
.done .badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  background: #ecfdf3;
  color: #059669;
  font-size: calc(22 * var(--r));
  font-weight: 650;
  margin-bottom: calc(12 * var(--r));
}
.wait h2 { color: #2563eb; margin: 0 0 calc(10 * var(--r)); font-size: calc(32 * var(--r)); }
.sub { margin: 0; color: #667085; font-size: calc(26 * var(--r)); line-height: 1.55; }
.paper-head {
  display: flex;
  align-items: center;
  gap: calc(12 * var(--r));
  margin-bottom: calc(8 * var(--r));
  padding-bottom: calc(16 * var(--r));
  border-bottom: 1px solid #eef2f6;
}
.seal {
  flex: 0 0 auto;
  width: calc(56 * var(--r));
  height: calc(56 * var(--r));
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #eff6ff;
  color: #2563eb;
  font-size: calc(22 * var(--r));
  font-weight: 700;
}
.paper h2, .done h2 {
  margin: 0;
  font-size: calc(34 * var(--r));
  color: #111827;
  font-weight: 750;
  letter-spacing: 0.02em;
}
.doc {
  margin-top: calc(8 * var(--r));
  max-height: min(62vh, calc(720 * var(--r)));
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  padding-right: 4px;
}
.md :deep(h1),
.md :deep(h2),
.md :deep(h3) {
  color: #111827;
  font-weight: 700;
  line-height: 1.35;
  margin: 1em 0 0.45em;
}
.md :deep(h1) { font-size: 1.2em; }
.md :deep(h2) { font-size: 1.08em; }
.md :deep(h3) { font-size: 1em; }
.md :deep(p) {
  margin: 0 0 0.75em;
  color: #344054;
  font-size: calc(27 * var(--r));
  line-height: 1.75;
}
.md :deep(ul),
.md :deep(ol) {
  margin: 0 0 0.85em;
  padding-left: 1.25em;
  color: #344054;
  font-size: calc(27 * var(--r));
  line-height: 1.75;
}
.md :deep(li) { margin: 0.2em 0; }
.md :deep(blockquote) {
  margin: 0 0 0.9em;
  padding: 0.7em 0.9em;
  border-left: 3px solid #93c5fd;
  background: #f8fbff;
  border-radius: 0 10px 10px 0;
  color: #475467;
  font-size: calc(26 * var(--r));
  line-height: 1.65;
}
.md :deep(blockquote p) { margin: 0; color: inherit; font-size: inherit; }
.md :deep(strong) { color: #111827; font-weight: 700; }
.md :deep(code) {
  padding: 0 4px;
  background: #f3f5f8;
  border-radius: 4px;
  font-size: 0.92em;
}
.md :deep(a) { color: #2563eb; }
.sign-box {
  margin-top: calc(20 * var(--r));
  padding-top: calc(16 * var(--r));
  border-top: 1px dashed #e5e7eb;
}
.sign-label {
  margin-bottom: calc(10 * var(--r));
  color: #667085;
  font-size: calc(24 * var(--r));
}
.sign-box img {
  width: 100%;
  max-height: calc(200 * var(--r));
  object-fit: contain;
  background: #f8fafc;
  border-radius: calc(12 * var(--r));
}
.agree {
  display: flex;
  gap: calc(12 * var(--r));
  align-items: flex-start;
  margin-bottom: calc(18 * var(--r));
  color: #344054;
  font-size: calc(26 * var(--r));
}
.pad-wrap { margin-bottom: calc(20 * var(--r)); }
.pad-label { font-weight: 650; color: #111827; font-size: calc(28 * var(--r)); }
.pad-label em { color: #ef4444; font-style: normal; }
.pad-hint { margin: calc(8 * var(--r)) 0 calc(12 * var(--r)); color: #98a2b3; font-size: calc(22 * var(--r)); }
.pad-frame {
  position: relative;
  border-radius: calc(14 * var(--r));
  overflow: hidden;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
}
.pad {
  width: 100%;
  height: calc(280 * var(--r));
  display: block;
  touch-action: none;
}
.pad-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #cbd5e1;
  font-size: calc(28 * var(--r));
  pointer-events: none;
}
.link {
  color: #2563eb;
  margin-top: calc(12 * var(--r));
  font-size: calc(26 * var(--r));
}
.foot {
  margin-top: calc(16 * var(--r));
  text-align: center;
  color: #98a2b3;
  font-size: calc(22 * var(--r));
}
</style>
