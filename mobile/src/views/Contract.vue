<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="goBack(router, '/my')">‹ 返回</button>
      <span>教师服务合同</span>
    </header>

    <div v-if="!loaded" class="card muted">加载中…</div>

    <div v-else-if="wrongTeacher" class="card wait">
      <h2>链接无效</h2>
      <p class="sub">此合同签订链接仅供指定教师使用。请使用管理员发给您的链接，并用本人账号登录后打开。</p>
      <button class="btn btn-primary btn-block" type="button" @click="goBack(router, '/my')">返回</button>
    </div>

    <div v-else-if="paper.contractPending" class="card wait">
      <div class="badge amber">审核中</div>
      <h2>签名已提交</h2>
      <p class="sub">{{ paper.tip }}</p>
      <button class="btn btn-primary btn-block" type="button" @click="exportPdf()">导出 PDF</button>
    </div>

    <div v-else-if="paper.signed" class="card done">
      <div class="badge">本学期已生效</div>
      <h2>{{ paper.title }}</h2>
      <p class="sub">{{ paper.tip }}</p>
      <div class="doc"><div class="md" v-html="html"></div></div>
      <div v-if="signUrl" class="sign-box"><img :src="signUrl" alt="签名" /></div>
      <button class="btn btn-primary btn-block" type="button" @click="exportPdf()">导出 PDF</button>
    </div>

    <div v-else-if="paper.status !== 'approved'" class="card wait">
      <h2>还不能签订</h2>
      <p class="sub">请先完成教师认证，审核通过后再签订合同</p>
      <button class="btn btn-primary btn-block" type="button" @click="router.push('/certify')">去认证</button>
    </div>

    <!-- 人工审身份 -->
    <div v-else-if="identity.ocrStatus === 'manual_review'" class="card wait">
      <div class="badge amber">信息处理中</div>
      <h2>身份信息需要人工确认</h2>
      <p class="sub">您的身份证照片已提交后台人工处理。处理完成后即可继续签署合同。</p>
      <ul class="progress-list">
        <li class="done">已读取认证资料</li>
        <li class="done">OCR 识别</li>
        <li class="on">人工确认</li>
        <li>合同信息填写</li>
        <li>合同预览</li>
        <li>签字确认</li>
      </ul>
    </div>

    <template v-else>
      <div v-if="showResume && resume" class="card resume">
        <h2>{{ resume.title }}</h2>
        <p class="sub">{{ resume.message }}</p>
        <button class="btn btn-primary btn-block" type="button" @click="continueResume">{{ resume.action }}</button>
      </div>

      <template v-else>
        <div class="steps">
          <span :class="{ on: step === 1, done: step > 1 }">① 信息确认</span>
          <em>→</em>
          <span :class="{ on: step === 2, done: step > 2 }">② 合同预览</span>
          <em>→</em>
          <span :class="{ on: step === 3 }">③ 签字确认</span>
        </div>

        <!-- Step 1 -->
        <template v-if="step === 1">
          <div class="card">
            <h3>身份证信息</h3>
            <p class="hint">已使用教师认证资料。如信息有误，请修改后再提交。</p>

            <div v-if="!identity.hasPhotos" class="warn-box">
              <strong>身份证资料不完整</strong>
              <p>当前教师认证资料中缺少身份证照片，无法自动生成合同信息。</p>
              <button class="btn btn-primary" type="button" @click="router.push('/certify')">前往教师认证补充资料</button>
            </div>

            <template v-else>
              <div class="id-status">
                <span class="ok">已认证 ✓</span>
                <span v-if="identity.ocrStatus === 'success' || identity.ocrStatus === 'manual_confirmed'" class="ok">已识别 ✓</span>
                <span v-else-if="identity.ocrStatus === 'partial'" class="warn">部分识别</span>
                <span v-else-if="ocrRunning" class="muted">正在识别…</span>
                <span v-else-if="identity.ocrStatus === 'failed'" class="warn">识别失败</span>
                <button type="button" class="link" @click="viewPhotos = !viewPhotos">{{ viewPhotos ? '收起照片' : '查看认证身份证' }}</button>
              </div>

              <div v-if="viewPhotos" class="photo-row">
                <img v-if="identity.idCard" :src="assetUrl(identity.idCard)" alt="人像面" />
                <img v-if="identity.idCardBack" :src="assetUrl(identity.idCardBack)" alt="国徽面" />
              </div>

              <div v-if="ocrRunning" class="ocr-bar"><i /><span>正在识别身份证信息……</span></div>
              <p v-else-if="identity.ocrStatus === 'success' || identity.ocrStatus === 'manual_confirmed'" class="ok-tip">身份证信息已自动识别，请核对</p>
              <p v-else-if="identity.ocrStatus === 'partial'" class="warn-tip">部分识别成功，请补全高亮字段</p>
              <p v-else-if="identity.ocrStatus === 'failed'" class="warn-tip">{{ identity.ocrError || '识别失败，请手动填写或重新识别' }}</p>

              <div v-if="identity.ocrStatus === 'failed'" class="actions-row">
                <button class="btn" type="button" :disabled="ocrRunning" @click="retryOcr">重新识别</button>
                <button class="btn" type="button" @click="requestManual">转人工处理</button>
              </div>

              <div class="sec-title">认证资料</div>
              <label class="field" :class="{ miss: missing('name') }">姓名<input v-model="form.identity.name" /></label>
              <label class="field">性别
                <select v-model="form.identity.gender">
                  <option value="">请选择</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </label>
              <label class="field">民族<input v-model="form.identity.ethnicity" placeholder="如：汉" /></label>
              <label class="field">出生日期<input v-model="form.identity.birthday" type="date" /></label>
              <label class="field" :class="{ miss: missing('idNumber') }">身份证号码<input v-model="form.identity.idNumber" maxlength="18" /></label>
              <label class="field" :class="{ miss: missing('address') }">身份证住址<input v-model="form.identity.address" /></label>

              <div class="sec-title">本次合同补充信息</div>
              <label class="field">联系地址<input v-model="form.contactAddress" placeholder="可与身份证住址不同" /></label>
              <label class="field">电子邮箱<input v-model="form.email" placeholder="选填" /></label>
              <label class="field" :class="{ miss: !form.bankName.trim() }">
                收款开户行<em>*</em>
                <input v-model="form.bankName" placeholder="如中国银行某某支行" />
              </label>
              <label class="field" :class="{ miss: !form.bankAccountName.trim() }">
                收款名<em>*</em>
                <input v-model="form.bankAccountName" placeholder="与银行卡户名一致" />
              </label>
              <label class="field" :class="{ miss: !form.bankAccount.trim() }">
                银行账号<em>*</em>
                <input v-model="form.bankAccount" placeholder="劳务报酬收款账号" />
              </label>
            </template>
          </div>

          <div v-if="paper.courseAnnex" class="card annex">
            <div class="annex-title">预分配课程（写入合同附件）</div>
            <pre>{{ paper.courseAnnex }}</pre>
          </div>

          <div class="foot-actions">
            <button class="btn" type="button" :disabled="saving" @click="saveDraft(false)">保存草稿</button>
            <button class="btn btn-primary" type="button" :disabled="saving || !canAdvance" @click="goPreview">确认信息，生成合同</button>
          </div>
        </template>

        <!-- Step 2 -->
        <template v-else-if="step === 2">
          <div class="card paper">
            <div class="paper-head">
              <span class="seal">合同</span>
              <h2>{{ paper.title }}</h2>
            </div>
            <div class="doc"><div class="md" v-html="html"></div></div>
          </div>
          <label class="agree">
            <input v-model="previewOk" type="checkbox" />
            <span>我已确认以上合同内容及个人信息准确无误</span>
          </label>
          <div class="foot-actions">
            <button class="btn" type="button" @click="step = 1">返回修改</button>
            <button class="btn btn-primary" type="button" :disabled="!previewOk || saving" @click="goSign">确认合同，进入签字</button>
          </div>
        </template>

        <!-- Step 3 -->
        <template v-else>
          <div class="card">
            <h3>甲方签字</h3>
            <p class="sub">法定代表人 / 授权代表：{{ paper.partyA?.legalRep || '（后台配置）' }}</p>
            <p class="muted">甲方信息由后台合同模板控制，教师不可修改。</p>
          </div>
          <div class="pad-wrap card">
            <div class="pad-label">乙方签字 <em>*</em></div>
            <p class="pad-hint">请在框内手写签名</p>
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
              <span v-if="!drew" class="pad-placeholder">请在此处签名</span>
            </div>
            <button type="button" class="link" @click="clearPad">重签</button>
          </div>
          <button class="btn btn-primary btn-block" type="button" :disabled="saving" @click="submit">
            {{ saving ? '提交中…' : '确认签署' }}
          </button>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  advanceContractPreview,
  confirmContractPreview,
  exportContract,
  getContract,
  requestContractManualReview,
  runContractOcr,
  saveContractDraft,
  signContract,
} from '../api';
import { showToast } from '../api/request';
import { assetUrl, getUser } from '../store';
import { goBack, requireLogin } from '../utils/helpers';
import { renderMarkdown } from '../utils/markdown';

const router = useRouter();
const route = useRoute();
const paper = ref({ title: '教师服务合同', status: 'none', signed: false, content: '', tip: '', partyA: {} });
const identity = ref({ hasPhotos: false, ocrStatus: 'none', fields: {}, idCard: '', idCardBack: '' });
const draft = ref({ step: 1, formData: {} });
const resume = ref(null);
const showResume = ref(false);
const loaded = ref(false);
const wrongTeacher = ref(false);
const step = ref(1);
const ocrRunning = ref(false);
const viewPhotos = ref(false);
const previewOk = ref(false);
const saving = ref(false);
const drew = ref(false);
const canvasRef = ref(null);
let ctx = null;
let last = null;
let drawing = false;
let saveTimer = null;

const form = reactive({
  identity: { name: '', gender: '', ethnicity: '', birthday: '', idNumber: '', address: '' },
  contactAddress: '',
  email: '',
  bankName: '',
  bankAccountName: '',
  bankAccount: '',
});

const html = computed(() => renderMarkdown(paper.value.content || ''));
const signUrl = computed(() => assetUrl(paper.value.sign || ''));
const canAdvance = computed(() => {
  if (!identity.value.hasPhotos) return false;
  const id = form.identity;
  const bankOk = !!(form.bankName?.trim() && form.bankAccountName?.trim() && form.bankAccount?.trim());
  return !!(id.name?.trim() && /^[0-9]{17}[0-9Xx]$/.test(id.idNumber || '') && id.address?.trim() && bankOk);
});

function missing(key) {
  if (identity.value.ocrStatus !== 'partial') return false;
  const map = { name: form.identity.name, idNumber: form.identity.idNumber, address: form.identity.address };
  return !String(map[key] || '').trim();
}

function cacheKey() {
  return `contract-draft:v1:${paper.value.semesterId || 0}`;
}

function writeLocal() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({
      step: step.value,
      form: JSON.parse(JSON.stringify(form)),
      previewOk: previewOk.value,
      updatedAt: new Date().toISOString(),
    }));
  } catch { /* ignore */ }
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(cacheKey()) || 'null');
  } catch {
    return null;
  }
}

onMounted(async () => {
  if (!requireLogin(router)) return;
  const expectId = Number(route.query.for || 0);
  const me = getUser();
  if (expectId && me?.id && Number(me.id) !== expectId) {
    wrongTeacher.value = true;
    loaded.value = true;
    return;
  }
  await load();
});

watch(step, async (value) => {
  writeLocal();
  if (value === 3) {
    await nextTick();
    initCanvas();
  }
});

watch(form, () => {
  writeLocal();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(true), 1200);
}, { deep: true });

async function load() {
  try {
    const data = await getContract();
    paper.value = data;
    identity.value = data.identity || identity.value;
    draft.value = data.draft || draft.value;
    resume.value = data.resume || null;
    applyIdentity(identity.value.fields || {});
    const serverForm = draft.value.formData || {};
    if (serverForm.identity) Object.assign(form.identity, serverForm.identity);
    form.contactAddress = serverForm.contactAddress || form.contactAddress;
    form.email = serverForm.email || form.email || '';
    form.bankName = serverForm.bankName || data.bankName || form.bankName || '';
    form.bankAccountName = serverForm.bankAccountName || data.bankAccountName || form.bankAccountName || form.identity.name || '';
    form.bankAccount = serverForm.bankAccount || data.bankAccount || form.bankAccount || '';
    const local = readLocal();
    if (local?.form) {
      Object.assign(form.identity, local.form.identity || {});
      form.contactAddress = local.form.contactAddress || form.contactAddress;
      form.email = local.form.email || form.email;
      form.bankName = local.form.bankName || form.bankName;
      form.bankAccountName = local.form.bankAccountName || form.bankAccountName;
      form.bankAccount = local.form.bankAccount || form.bankAccount;
    }
    const s = Number(draft.value.step || local?.step || 1);
    step.value = Math.min(3, Math.max(1, s));
    if (data.contractDue && resume.value && ['step1', 'step2', 'step3'].includes(resume.value.kind)) {
      showResume.value = true;
    }
    if (data.contractDue && identity.value.hasPhotos && ['none', 'failed', 'processing'].includes(identity.value.ocrStatus)) {
      await retryOcr(false);
    }
  } catch (err) {
    showToast(err.message || '加载失败');
  } finally {
    loaded.value = true;
  }
}

function applyIdentity(fields) {
  form.identity.name = fields.name || form.identity.name || '';
  form.identity.gender = fields.gender || form.identity.gender || '';
  form.identity.ethnicity = fields.ethnicity || form.identity.ethnicity || '';
  form.identity.birthday = fields.birthday || form.identity.birthday || '';
  form.identity.idNumber = fields.idNumber || form.identity.idNumber || '';
  form.identity.address = fields.address || form.identity.address || '';
}

function continueResume() {
  showResume.value = false;
  step.value = Number(resume.value?.step || draft.value.step || 1);
}

async function retryOcr(force = true) {
  ocrRunning.value = true;
  try {
    const data = await runContractOcr(force);
    identity.value = data;
    applyIdentity(data.fields || {});
    if (data.ocrStatus === 'success') showToast('身份证信息已自动识别，请核对');
  } catch (err) {
    showToast(err.message || '识别失败');
  } finally {
    ocrRunning.value = false;
  }
}

async function requestManual() {
  try {
    identity.value = await requestContractManualReview('教师申请人工处理');
    showToast('已提交人工处理');
  } catch (err) {
    showToast(err.message || '提交失败');
  }
}

async function saveDraft(silent = false) {
  saving.value = true;
  try {
    const res = await saveContractDraft({
      step: step.value,
      flowStatus: step.value === 1 ? 'filling' : step.value === 2 ? 'preview' : 'waiting_signature',
      formData: {
        identity: { ...form.identity },
        contactAddress: form.contactAddress,
        email: form.email,
        bankName: form.bankName.trim(),
        bankAccountName: form.bankAccountName.trim(),
        bankAccount: form.bankAccount.trim().replace(/[\s\-]/g, ''),
        previewConfirmed: previewOk.value,
      },
    });
    identity.value = res.identity || identity.value;
    draft.value = res.draft || draft.value;
    writeLocal();
    if (res.blockedByManualReview) {
      showToast('核心身份信息已变更，已转人工确认');
      return false;
    }
    if (!silent) showToast('草稿已保存');
    return true;
  } catch (err) {
    if (!silent) showToast(err.message || '保存失败');
    return false;
  } finally {
    saving.value = false;
  }
}

async function goPreview() {
  if (!canAdvance.value) {
    if (!form.bankName?.trim() || !form.bankAccountName?.trim() || !form.bankAccount?.trim()) {
      showToast('请填写收款开户行、收款名与银行账号');
      return;
    }
    showToast('请完整填写姓名、身份证号、住址');
    return;
  }
  const ok = await saveDraft(true);
  if (!ok) return;
  saving.value = true;
  try {
    const res = await advanceContractPreview();
    draft.value = res;
    step.value = 2;
    // 刷新合同正文（身份已写入）
    const data = await getContract();
    paper.value.content = data.content;
    paper.value.courseAnnex = data.courseAnnex;
  } catch (err) {
    showToast(err.message || '无法进入预览');
  } finally {
    saving.value = false;
  }
}

async function goSign() {
  if (!previewOk.value) return;
  saving.value = true;
  try {
    await saveDraft(true);
    const res = await confirmContractPreview();
    draft.value = res;
    step.value = 3;
  } catch (err) {
    showToast(err.message || '无法进入签字');
  } finally {
    saving.value = false;
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
function startDraw(e) { drawing = true; last = pointFromEvent(e); }
function touchStart(e) { startDraw(e); }
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
function touchMove(e) { moveDraw(e); }
function endDraw() { drawing = false; last = null; }
function clearPad() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drew.value = false;
}

async function submit() {
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
    try { localStorage.removeItem(cacheKey()); } catch { /* ignore */ }
    showToast(result?.message || '已提交审核');
    await load();
  } catch (err) {
    showToast(err.message || '签订失败');
  } finally {
    saving.value = false;
  }
}

async function exportPdf(id) {
  try {
    const data = await exportContract(id);
    const html = data.html || '';
    if (!html) {
      showToast('合同内容为空');
      return;
    }
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.download = data.fileName || `教师服务合同-${data.id || 'export'}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('已下载合同文件，请打开后选择「打印 → 另存为 PDF」');
    } else {
      showToast('请在打开的页面中选择「打印 / 另存为 PDF」');
    }
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    showToast(err.message || '导出失败');
  }
}
</script>

<style scoped>
.page { padding: 12px 16px 40px; }
.nav { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-weight: 650; }
.back { border: 0; background: transparent; font-size: 18px; }
.card {
  background: #fff; border-radius: 16px; padding: 16px; margin-bottom: 12px;
  box-shadow: 0 2px 10px rgba(16, 24, 40, 0.04);
}
.badge { display: inline-block; background: #ecfdf3; color: #027a48; padding: 4px 10px; border-radius: 999px; font-size: 12px; margin-bottom: 8px; }
.badge.amber { background: #fff7ed; color: #9a3412; }
.sub, .foot, .muted, .hint { color: #667085; font-size: 13px; line-height: 1.5; }
.hint { margin: 0 0 12px; }
.steps {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin-bottom: 12px; font-size: 12px; color: #98a2b3; flex-wrap: wrap;
}
.steps span.on { color: #2563eb; font-weight: 700; }
.steps span.done { color: #027a48; }
.sec-title { margin: 14px 0 8px; font-weight: 650; font-size: 14px; }
.field em { color: #ef4444; font-style: normal; margin-left: 2px; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 13px; color: #344054; }
.field input, .field select {
  height: 40px; border: 1px solid #e7edf5; border-radius: 10px; padding: 0 12px; font-size: 14px;
}
.field.miss input { border-color: #f97316; background: #fff7ed; }
.id-status { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; font-size: 12px; }
.ok { color: #027a48; }
.warn { color: #c2410c; }
.ok-tip { color: #027a48; font-size: 13px; margin: 0 0 10px; }
.warn-tip { color: #c2410c; font-size: 13px; margin: 0 0 10px; }
.photo-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.photo-row img { width: 100%; border-radius: 10px; border: 1px solid #e7edf5; background: #f8fafc; }
.ocr-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: #2563eb; font-size: 13px; }
.ocr-bar i {
  width: 16px; height: 16px; border-radius: 50%; border: 2px solid #bfdbfe; border-top-color: #2563eb;
  animation: spin .7s linear infinite;
}
.warn-box { background: #fff7ed; border-radius: 12px; padding: 12px; }
.progress-list { margin: 12px 0 0; padding-left: 18px; color: #667085; font-size: 13px; line-height: 1.8; }
.progress-list .done { color: #027a48; }
.progress-list .on { color: #2563eb; font-weight: 650; }
.foot-actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 8px; margin-top: 8px; }
.actions-row { display: flex; gap: 8px; margin-bottom: 10px; }
.annex-title { font-weight: 650; margin-bottom: 8px; }
.annex pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; color: #344054; }
.agree { display: flex; gap: 8px; align-items: flex-start; margin: 12px 0; font-size: 14px; }
.pad-frame { position: relative; border: 1px dashed #d0d5dd; border-radius: 12px; height: 140px; background: #fafafa; }
.pad { width: 100%; height: 100%; display: block; }
.pad-placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: #98a2b3; pointer-events: none; }
.btn { border: 0; border-radius: 12px; padding: 12px 16px; background: #f2f4f7; }
.btn-primary { background: #2563eb; color: #fff; }
.btn-block { width: 100%; margin-top: 12px; }
.btn:disabled { opacity: .55; }
.link { color: #2563eb; background: transparent; border: 0; font-size: 12px; }
.sign-box img { max-width: 220px; border: 1px solid #e7edf5; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
