<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>教师服务合同</span>
    </header>

    <div v-if="!loaded" class="card muted">加载中…</div>

    <div v-else-if="paper.contractPending" class="card wait">
      <div class="badge amber">审核中</div>
      <h2>签名已提交</h2>
      <p class="sub">{{ paper.tip || '管理员审核通过后，本学期合同生效，预分配课程将自动解锁。' }}</p>
      <button v-if="paper.history?.length" class="btn btn-block" type="button" @click="exportPdf()">导出已提交合同</button>
    </div>

    <div v-else-if="paper.signed" class="card done">
      <div class="badge">本学期已生效</div>
      <h2>{{ paper.title || '教师服务合同' }}</h2>
      <p class="sub">{{ paper.tip || '本合同在本学期内有效，下学期需重新签订。' }}</p>
      <div v-if="paper.courseAnnex" class="annex">
        <div class="annex-title">课程附件（预分配）</div>
        <pre>{{ paper.courseAnnex }}</pre>
      </div>
      <div class="doc">
        <div class="md" v-html="html"></div>
      </div>
      <div v-if="signUrl" class="sign-box">
        <div class="sign-label">我的签名</div>
        <img :src="signUrl" alt="签名" />
      </div>
      <button class="btn btn-primary btn-block" type="button" @click="exportPdf()">导出 PDF</button>
      <div v-if="paper.history?.length" class="history">
        <div class="annex-title">历史已签合同（保留备查）</div>
        <button
          v-for="item in paper.history"
          :key="item.id"
          type="button"
          class="hist-row"
          @click="exportPdf(item.id)"
        >
          <span>{{ item.semesterId || '合同' }} · {{ statusText(item.status) }}</span>
          <span class="link">导出</span>
        </button>
      </div>
    </div>

    <div v-else-if="paper.status !== 'approved'" class="card wait">
      <h2>还不能签订</h2>
      <p class="sub">请先完成教师认证，审核通过后再签订合同</p>
      <button class="btn btn-primary btn-block" type="button" @click="router.push('/certify')">去认证</button>
    </div>

    <template v-else>
      <div class="tip card">
        {{ paper.tip || '每学期需重新签订合同，请仔细阅读后签名提交审核。' }}
      </div>
      <div v-if="paper.courseAnnex" class="card annex">
        <div class="annex-title">将写入合同的预分配课程</div>
        <pre>{{ paper.courseAnnex }}</pre>
      </div>
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
        <p class="pad-hint">请在框内签名，签名会随合同一起保存，提交后需管理员审核</p>
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
        {{ saving ? '提交中…' : '确认签订并提交审核' }}
      </button>
      <p class="foot">审核通过后本学期合同生效，预分配课程解锁；历史合同永久保留。</p>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { exportContract, getContract, signContract } from '../api';
import { showToast } from '../api/request';
import { assetUrl } from '../store';
import { requireLogin } from '../utils/helpers';
import { renderMarkdown } from '../utils/markdown';

const router = useRouter();
const paper = ref({ title: '教师服务合同', status: 'none', signed: false, content: '', sign: '', tip: '', history: [] });
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
  () => [loaded.value, paper.value.signed, paper.value.status, paper.value.contractPending],
  async () => {
    if (loaded.value && !paper.value.signed && !paper.value.contractPending && paper.value.status === 'approved') {
      await nextTick();
      initCanvas();
    }
  },
);

function statusText(status) {
  return ({ pending: '待审', approved: '已生效', rejected: '已驳回', superseded: '已归档' })[status] || status;
}

async function load() {
  try {
    paper.value = await getContract();
  } catch (err) {
    showToast(err.message || '加载失败');
  } finally {
    loaded.value = true;
  }
}

async function exportPdf(id) {
  try {
    const data = await exportContract(id);
    // 下载 HTML，手机/桌面都可打开后「打印 → 另存为 PDF」
    const blob = new Blob([data.html || ''], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.fileName || `教师服务合同-${data.id || 'export'}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    const win = window.open(url, '_blank');
    if (win) {
      showToast('已打开合同，请点「打印 / 另存为 PDF」');
    } else {
      showToast('已下载合同文件，打开后可打印为 PDF');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    showToast(err.message || '导出失败');
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
    const result = await signContract(file);
    showToast(result?.message || '已提交审核');
    await load();
  } catch (err) {
    showToast(err.message || '签订失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.page { padding: 12px 16px 40px; }
.nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 650;
}
.back { border: 0; background: transparent; font-size: 18px; }
.card {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 10px rgba(16, 24, 40, 0.04);
}
.badge {
  display: inline-block;
  background: #ecfdf3;
  color: #027a48;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  margin-bottom: 8px;
}
.badge.amber { background: #fff7ed; color: #9a3412; }
.sub, .foot, .muted { color: #667085; font-size: 13px; line-height: 1.5; }
.tip { background: #fff7ed; color: #9a3412; }
.annex-title { font-weight: 650; margin-bottom: 8px; }
.annex pre, .history { white-space: pre-wrap; font-family: inherit; color: #344054; font-size: 13px; line-height: 1.6; }
.hist-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid #f0f2f5;
  background: transparent;
  text-align: left;
}
.sign-box { margin-top: 12px; }
.sign-box img { max-width: 220px; border: 1px solid #e7edf5; background: #fff; }
.agree { display: flex; gap: 8px; align-items: flex-start; margin: 12px 0; font-size: 14px; }
.pad-frame {
  position: relative;
  border: 1px dashed #d0d5dd;
  border-radius: 12px;
  height: 140px;
  background: #fafafa;
}
.pad { width: 100%; height: 100%; display: block; }
.pad-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #98a2b3;
  pointer-events: none;
}
.btn {
  border: 0;
  border-radius: 12px;
  padding: 12px 16px;
  background: #f2f4f7;
}
.btn-primary { background: #2563eb; color: #fff; }
.btn-block { width: 100%; margin-top: 12px; }
.link { color: #2563eb; background: transparent; border: 0; }
</style>
