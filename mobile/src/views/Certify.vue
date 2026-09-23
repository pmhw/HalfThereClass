<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>教师认证</span>
    </header>

    <div v-if="cert.status === 'approved' && !cert.clearanceDue && !cert.clearancePending" class="card ok">
      认证已通过 · 教师编号 {{ cert.teacherNo || '—' }}
      <button v-if="!cert.contractSigned" type="button" class="link" @click="router.push('/contract')">去签订合同</button>
    </div>

    <div class="card">
      <div class="steps">
        <span :class="{ on: step >= 1 }">资料</span>
        <span :class="{ on: step >= 2 }">审核</span>
        <span :class="{ on: step >= 3 }">完成</span>
      </div>
      <label v-if="!onlyClearance" class="field">
        <span>真实姓名</span>
        <input v-model="realName" type="text" placeholder="与身份证一致" />
      </label>

      <div v-for="item in uploadFields" :key="item.key" class="upload">
        <div class="label">
          {{ item.label }}
          <router-link
            v-if="item.key === 'idCard' || item.key === 'idCardBack'"
            :to="{ path: '/id-shot', query: { key: item.key, side: item.key === 'idCardBack' ? 'emblem' : 'portrait' } }"
            class="cam-link"
          >
            摄像头拍摄
          </router-link>
        </div>
        <label class="box">
          <img v-if="preview(item.key)" :src="preview(item.key)" alt="" />
          <span v-else>{{ uploading === item.key ? '上传中…' : '点击上传' }}</span>
          <input type="file" accept="image/*,.pdf" hidden @change="(e) => onFile(item.key, e)" />
        </label>
      </div>

      <button class="btn btn-primary btn-block" type="button" :disabled="saving" @click="submit">
        {{ saving ? '提交中…' : '提交认证' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getCert, submitCert, uploadCertFile } from '../api';
import { showToast } from '../api/request';
import { assetUrl } from '../store';
import { requireLogin } from '../utils/helpers';

const ID_SHOT_KEY = 'novis_id_shot';

const router = useRouter();

const cert = ref({ status: 'none' });
const step = ref(1);
const realName = ref('');
const files = reactive({
  idCard: '',
  idCardBack: '',
  diploma: '',
  clearance: '',
  certificate: '',
});
const previews = reactive({
  idCard: '',
  idCardBack: '',
  diploma: '',
  clearance: '',
  certificate: '',
});
const uploading = ref('');
const saving = ref(false);

const uploadFields = [
  { key: 'idCard', label: '身份证人像面' },
  { key: 'idCardBack', label: '身份证国徽面' },
  { key: 'diploma', label: '学历证明' },
  { key: 'clearance', label: '无犯罪证明' },
  { key: 'certificate', label: '教师资格证（选填）' },
];

const onlyClearance = computed(
  () => cert.value.status === 'approved' && cert.value.clearanceDue,
);

onMounted(async () => {
  if (!requireLogin(router)) return;
  await load();
  await consumeIdShot();
});

function preview(key) {
  if (previews[key]) return previews[key];
  if (files[key] && !/\.pdf$/i.test(files[key])) return assetUrl(files[key]);
  return '';
}

async function load() {
  try {
    const data = await getCert();
    cert.value = data;
    step.value =
      data.status === 'approved' && !data.clearanceDue && !data.clearancePending
        ? 3
        : data.status === 'pending' || data.clearancePending
          ? 2
          : 1;
    realName.value = data.realName || realName.value;
    files.idCard = files.idCard || data.idCard || '';
    files.idCardBack = files.idCardBack || data.idCardBack || '';
    files.diploma = files.diploma || data.diploma || '';
    files.clearance =
      data.clearanceStatus === 'rejected' ? '' : files.clearance || data.clearance || '';
    files.certificate = files.certificate || data.certificate || '';
  } catch (err) {
    showToast(err.message || '加载失败');
  }
}

async function consumeIdShot() {
  const raw = sessionStorage.getItem(ID_SHOT_KEY);
  if (!raw) return;
  sessionStorage.removeItem(ID_SHOT_KEY);
  try {
    const { key, dataUrl } = JSON.parse(raw);
    if (!key || !dataUrl) return;
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], `${key}.jpg`, { type: 'image/jpeg' });
    await uploadKey(key, file, dataUrl);
  } catch {
    showToast('证件照处理失败');
  }
}

function onFile(key, event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const local = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
  uploadKey(key, file, local);
}

async function uploadKey(key, file, localPreview) {
  uploading.value = key;
  if (localPreview) previews[key] = localPreview;
  try {
    const data = await uploadCertFile(file);
    files[key] = data.url;
  } catch (err) {
    previews[key] = '';
    showToast(err.message || '上传失败');
  } finally {
    uploading.value = '';
  }
}

async function submit() {
  if (saving.value) return;
  if (!onlyClearance.value && !realName.value.trim()) {
    showToast('请填写姓名');
    return;
  }
  if (!onlyClearance.value && (!files.idCard || !files.idCardBack)) {
    showToast('请上传身份证正反面');
    return;
  }
  if (!onlyClearance.value && !files.diploma) {
    showToast('请上传学历证明');
    return;
  }
  if (!files.clearance) {
    showToast('请上传无犯罪证明');
    return;
  }
  saving.value = true;
  try {
    await submitCert({
      realName: realName.value.trim(),
      idCard: files.idCard,
      idCardBack: files.idCardBack,
      diploma: files.diploma,
      clearance: files.clearance,
      certificate: files.certificate,
    });
    showToast('已提交，等待审核');
    await load();
  } catch (err) {
    showToast(err.message || '提交失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); }
.nav { display: flex; align-items: center; gap: calc(16 * var(--r)); margin-bottom: calc(24 * var(--r)); font-weight: 650; }
.back { color: #2563eb; }
.ok { margin-bottom: calc(20 * var(--r)); line-height: 1.6; }
.link { color: #2563eb; margin-left: calc(12 * var(--r)); }
.steps {
  display: flex;
  justify-content: space-between;
  margin-bottom: calc(28 * var(--r));
  color: #98a2b3;
  font-size: calc(24 * var(--r));
}
.steps .on { color: #2563eb; font-weight: 650; }
.field { display: block; margin-bottom: calc(24 * var(--r)); }
.field span { display: block; margin-bottom: calc(8 * var(--r)); color: #667085; }
.field input {
  width: 100%;
  height: calc(80 * var(--r));
  padding: 0 calc(20 * var(--r));
  border: 1px solid #e7edf5;
  border-radius: calc(12 * var(--r));
  background: #fff;
}
.upload { margin-bottom: calc(24 * var(--r)); }
.upload .label { display: flex; justify-content: space-between; margin-bottom: calc(8 * var(--r)); color: #344054; }
.cam-link { color: #2563eb; font-size: calc(24 * var(--r)); }
.box {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(160 * var(--r));
  border: 1px dashed #d0d5dd;
  border-radius: calc(12 * var(--r));
  background: #fafafa;
  overflow: hidden;
  color: #98a2b3;
}
.box img { width: 100%; max-height: calc(320 * var(--r)); object-fit: contain; }
</style>
