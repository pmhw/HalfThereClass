<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="goBack(router, '/my')" aria-label="返回" />
      <span class="nav-title">教师认证</span>
    </header>

    <div class="steps">
      <div class="step" :class="{ on: step >= 1 }">
        <div class="n">1</div>
        <span>基本信息</span>
      </div>
      <div class="bar" :class="{ on: step >= 2 }" />
      <div class="step" :class="{ on: step >= 2 }">
        <div class="n">2</div>
        <span>证明材料</span>
      </div>
      <div class="bar" :class="{ on: step >= 3 }" />
      <div class="step" :class="{ on: step >= 3 }">
        <div class="n">3</div>
        <span>认证完成</span>
      </div>
    </div>
    <p class="page-hint">请填写真实信息并上传相关证明材料</p>

    <!-- 认证完成 -->
    <div v-if="isDone" class="card done">
      <div class="h">认证完成</div>
      <div class="sub">{{ cert.realName }} · {{ cert.teacherNo }}</div>
      <div v-if="cert.contractSigned" class="sub">合同已签订，可以抢课，后台也可以安排课程</div>
      <template v-else>
        <div class="sub">请签订教师服务合同。签订前不能抢课，后台也不能安排课程</div>
        <button type="button" class="btn btn-primary btn-block sign" @click="router.push('/contract')">
          去签订合同
        </button>
      </template>
    </div>

    <!-- 审核中：不再显示编辑表单 -->
    <div v-else-if="isPending" class="card wait">
      <div class="h">审核中</div>
      <div v-if="cert.clearancePending" class="sub">本学期无犯罪证明已提交，请等待后台审核</div>
      <div v-else class="sub">资料已提交，请等待后台审核。通过后即可授课</div>
    </div>

    <!-- 待填写 / 驳回重提 / 补材料 -->
    <template v-else>
      <div v-if="cert.profileIncomplete && cert.status === 'approved'" class="card form">
        <div class="warn">请补全身份证号，签署合同时将自动填入合同</div>
      </div>
      <div v-if="cert.rejectReason && cert.status === 'rejected'" class="card form">
        <div class="warn">上次未通过：{{ cert.rejectReason }}</div>
      </div>
      <div v-if="cert.clearanceStatus === 'rejected'" class="card form">
        <div class="warn">无犯罪证明未通过：{{ cert.rejectReason || '请重新上传' }}</div>
      </div>

      <div class="card form">
        <template v-if="cert.status !== 'approved' || cert.profileIncomplete">
          <div class="label">真实姓名<em class="req">*</em></div>
          <div class="input">
            <span class="person" />
            <input v-model="realName" type="text" placeholder="请输入姓名" />
          </div>
          <div class="label gap">身份证号码<em class="req">*</em></div>
          <div class="input">
            <input v-model="idNumber" type="text" maxlength="18" placeholder="18位身份证号" />
          </div>
          <div class="label gap">电子邮箱</div>
          <div class="input">
            <input v-model="email" type="email" placeholder="选填，用于合同送达" />
          </div>
          <p class="desc gap">收款开户行、收款名与银行账号将在签订合同时填写（必填）。</p>
        </template>

        <template v-if="cert.status !== 'approved'">
          <div class="label gap">上传证明材料<em class="req">*</em></div>
          <p class="desc">请上传清晰、完整的证件照片或扫描件，支持 JPG、PNG、PDF 格式</p>

          <div class="row id-row">
            <div class="badge id"><div class="id-card"><div class="id-face" /></div></div>
            <div class="txt">
              <div>身份证<em class="req">*</em></div>
              <div class="sub">拍摄、相册或文件，正反面都要上传</div>
            </div>
          </div>
          <div class="slots">
            <label class="slot">
              <img v-if="preview('idCard')" :src="preview('idCard')" alt="" />
              <span v-if="preview('idCard') || files.idCard" class="slot-tag">
                {{ uploading === 'idCard' ? '上传中' : '人像面 · 点击重拍' }}
              </span>
              <template v-else>
                <i class="mark tl" /><i class="mark tr" /><i class="mark bl" /><i class="mark br" />
                <span class="slot-name">人像面</span>
                <span class="slot-tip">{{ uploading === 'idCard' ? '上传中' : '横向拍摄' }}</span>
              </template>
              <input type="file" accept="image/*,.pdf" hidden @change="(e) => onFile('idCard', e)" />
            </label>
            <label class="slot">
              <img v-if="preview('idCardBack')" :src="preview('idCardBack')" alt="" />
              <span v-if="preview('idCardBack') || files.idCardBack" class="slot-tag">
                {{ uploading === 'idCardBack' ? '上传中' : '国徽面 · 点击重拍' }}
              </span>
              <template v-else>
                <i class="mark tl" /><i class="mark tr" /><i class="mark bl" /><i class="mark br" />
                <span class="slot-name">国徽面</span>
                <span class="slot-tip">{{ uploading === 'idCardBack' ? '上传中' : '横向拍摄' }}</span>
              </template>
              <input type="file" accept="image/*,.pdf" hidden @change="(e) => onFile('idCardBack', e)" />
            </label>
          </div>
          <div class="cam-links">
            <router-link :to="{ path: '/id-shot', query: { key: 'idCard', side: 'portrait' } }">摄像头拍人像面</router-link>
            <router-link :to="{ path: '/id-shot', query: { key: 'idCardBack', side: 'emblem' } }">摄像头拍国徽面</router-link>
          </div>

          <div class="row">
            <div class="badge edu"><div class="cap" /><div class="tassel" /></div>
            <div class="txt">
              <div>学历证明<em class="req">*</em></div>
              <div class="sub">请上传毕业证书或学历证明</div>
            </div>
            <label class="plus" :class="{ done: !!files.diploma }">
              {{ uploading === 'diploma' ? '…' : (files.diploma ? '✓' : '+') }}
              <input type="file" accept="image/*,.pdf" hidden @change="(e) => onFile('diploma', e)" />
            </label>
          </div>

          <div class="row">
            <div class="badge cert"><div class="sheet"><div class="seal" /></div></div>
            <div class="txt">
              <div>教师资格证</div>
              <div class="sub">选填，有则上传</div>
            </div>
            <label class="plus" :class="{ done: !!files.certificate }">
              {{ files.certificate ? '✓' : '+' }}
              <input type="file" accept="image/*,.pdf" hidden @change="(e) => onFile('certificate', e)" />
            </label>
          </div>
        </template>

        <div v-if="cert.status !== 'approved' || cert.clearanceDue" class="row">
          <div class="badge law"><div class="doc" /></div>
          <div class="txt">
            <div>无犯罪证明<em class="req">*</em></div>
            <div class="sub">每学期更新一次{{ cert.semesterName ? ` · ${cert.semesterName}` : '' }}</div>
          </div>
          <label class="plus" :class="{ done: !!files.clearance }">
            {{ uploading === 'clearance' ? '…' : (files.clearance ? '✓' : '+') }}
            <input type="file" accept="image/*,.pdf" hidden @change="(e) => onFile('clearance', e)" />
          </label>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-primary btn-block submit"
        :disabled="saving"
        @click="submit"
      >
        {{
          saving
            ? '提交中…'
            : (cert.profileIncomplete ? '保存身份信息' : (cert.clearanceDue ? '提交本学期证明' : '提交认证'))
        }}
      </button>
      <p class="foot">提交后将进入审核流程，请耐心等待审核结果</p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getCert, submitCert, uploadCertFile } from '../api';
import { showToast } from '../api/request';
import { assetUrl } from '../store';
import { goBack, requireLogin } from '../utils/helpers';

const ID_SHOT_KEY = 'novis_id_shot';

const router = useRouter();

const cert = ref({ status: 'none' });
const step = ref(1);
const realName = ref('');
const idNumber = ref('');
const email = ref('');
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

const onlyClearance = computed(
  () => cert.value.status === 'approved' && cert.value.clearanceDue,
);
const onlyProfile = computed(
  () => cert.value.status === 'approved' && cert.value.profileIncomplete && !onlyClearance.value,
);
const isDone = computed(
  () => step.value === 3 && !cert.value.profileIncomplete,
);
const isPending = computed(
  () => cert.value.status === 'pending' || !!cert.value.clearancePending,
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
      data.status === 'approved' && !data.clearanceDue && !data.clearancePending && !data.profileIncomplete
        ? 3
        : data.status === 'pending' || data.clearancePending
          ? 2
          : 1;
    realName.value = data.realName || realName.value;
    idNumber.value = data.idNumber || idNumber.value;
    email.value = data.email || email.value;
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
  if (!onlyClearance.value && !/^[0-9]{17}[0-9Xx]$/.test(idNumber.value.trim())) {
    showToast('请填写正确身份证号');
    return;
  }
  if (!onlyClearance.value && !onlyProfile.value && (!files.idCard || !files.idCardBack)) {
    showToast('请上传身份证正反面');
    return;
  }
  if (!onlyClearance.value && !onlyProfile.value && !files.diploma) {
    showToast('请上传学历证明');
    return;
  }
  if (!onlyProfile.value && !files.clearance) {
    showToast('请上传无犯罪证明');
    return;
  }
  saving.value = true;
  try {
    await submitCert({
      realName: realName.value.trim(),
      idNumber: idNumber.value.trim(),
      email: email.value.trim(),
      idCard: files.idCard,
      idCardBack: files.idCardBack,
      diploma: files.diploma,
      clearance: files.clearance,
      certificate: files.certificate,
    });
    showToast(onlyProfile.value ? '已保存' : '已提交，等待审核');
    await load();
  } catch (err) {
    showToast(err.message || '提交失败');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 0 calc(28 * var(--r)) calc(48 * var(--r));
  background: #f4f7fb;
  box-sizing: border-box;
}
.nav {
  display: flex;
  align-items: center;
  height: calc(88 * var(--r));
  padding-top: calc(8 * var(--r));
}
.back {
  width: calc(48 * var(--r));
  height: calc(48 * var(--r));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}
.back::before {
  content: '';
  width: calc(16 * var(--r));
  height: calc(16 * var(--r));
  margin-left: calc(6 * var(--r));
  border-left: 2px solid #111827;
  border-bottom: 2px solid #111827;
  transform: rotate(45deg);
}
.nav-title {
  margin-left: calc(4 * var(--r));
  font-size: calc(34 * var(--r));
  font-weight: 650;
  color: #111827;
}
.steps {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: calc(12 * var(--r)) calc(4 * var(--r)) 0;
}
.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(10 * var(--r));
  color: #98a2b3;
  font-size: calc(22 * var(--r));
  width: calc(140 * var(--r));
}
.step .n {
  width: calc(48 * var(--r));
  height: calc(48 * var(--r));
  border-radius: 50%;
  background: #e7edf5;
  color: #98a2b3;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(24 * var(--r));
  font-weight: 700;
}
.step.on { color: #2563eb; font-weight: 650; }
.step.on .n { background: #2563eb; color: #fff; }
.bar {
  flex: 1;
  height: 2px;
  background: #e7edf5;
  margin: calc(22 * var(--r)) 0 0;
}
.bar.on { background: #2563eb; }
.page-hint {
  margin: calc(22 * var(--r)) calc(8 * var(--r)) calc(18 * var(--r));
  color: #98a2b3;
  font-size: calc(24 * var(--r));
}
.card {
  background: #fff;
  border-radius: calc(24 * var(--r));
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
}
.form, .done, .wait {
  padding: calc(32 * var(--r)) calc(28 * var(--r));
  margin-bottom: calc(20 * var(--r));
}
.label {
  font-size: calc(30 * var(--r));
  font-weight: 650;
  color: #111827;
}
.label.gap { margin-top: calc(36 * var(--r)); }
.req { color: #ef4444; margin-left: 2px; font-style: normal; }
.desc {
  margin-top: calc(10 * var(--r));
  color: #98a2b3;
  font-size: calc(22 * var(--r));
  line-height: 1.55;
}
.desc.gap { margin-top: calc(28 * var(--r)); }
.input {
  margin-top: calc(16 * var(--r));
  height: calc(92 * var(--r));
  padding: 0 calc(24 * var(--r));
  border-radius: calc(16 * var(--r));
  background: #f3f5f8;
  display: flex;
  align-items: center;
  gap: calc(16 * var(--r));
}
.input input {
  flex: 1;
  height: calc(92 * var(--r));
  font-size: calc(28 * var(--r));
  color: #111827;
  background: transparent;
  border: 0;
  outline: none;
}
.person {
  width: calc(28 * var(--r));
  height: calc(28 * var(--r));
  border: 2px solid #b0b8c4;
  border-radius: 50%;
  box-sizing: border-box;
  position: relative;
  flex-shrink: 0;
}
.person::after {
  content: '';
  position: absolute;
  left: 2px;
  right: 2px;
  bottom: -10px;
  height: 8px;
  border: 2px solid #b0b8c4;
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
}
.row {
  display: flex;
  align-items: center;
  gap: calc(16 * var(--r));
  margin-top: calc(20 * var(--r));
  padding: calc(20 * var(--r));
  border-radius: calc(18 * var(--r));
  background: #f3f5f8;
}
.id-row {
  margin-bottom: 0;
  border-radius: calc(18 * var(--r)) calc(18 * var(--r)) 0 0;
  padding-bottom: calc(8 * var(--r));
}
.txt {
  flex: 1;
  min-width: 0;
  font-size: calc(28 * var(--r));
  font-weight: 650;
  color: #111827;
}
.sub {
  margin-top: calc(6 * var(--r));
  color: #98a2b3;
  font-size: calc(22 * var(--r));
  font-weight: 400;
}
.plus {
  width: calc(56 * var(--r));
  height: calc(56 * var(--r));
  border-radius: calc(16 * var(--r));
  background: #2563eb;
  color: #fff;
  font-size: calc(40 * var(--r));
  font-weight: 500;
  line-height: calc(52 * var(--r));
  text-align: center;
  flex-shrink: 0;
  cursor: pointer;
}
.plus.done {
  background: #dcfce7;
  color: #059669;
  font-size: calc(28 * var(--r));
  line-height: calc(56 * var(--r));
}
.badge {
  width: calc(72 * var(--r));
  height: calc(72 * var(--r));
  border-radius: calc(18 * var(--r));
  flex-shrink: 0;
  position: relative;
}
.id { background: #dbeafe; }
.edu { background: #ede9fe; }
.cert { background: #dcfce7; }
.law { background: #ffedd5; }
.id-card {
  position: absolute;
  left: calc(16 * var(--r));
  top: calc(22 * var(--r));
  width: calc(40 * var(--r));
  height: calc(28 * var(--r));
  border-radius: 2px;
  background: #fff;
  border: 2px solid #2563eb;
  box-sizing: border-box;
}
.id-face {
  position: absolute;
  right: 3px;
  top: 3px;
  width: calc(10 * var(--r));
  height: calc(14 * var(--r));
  border-radius: 1px;
  background: #2563eb;
}
.cap {
  position: absolute;
  left: calc(14 * var(--r));
  top: calc(22 * var(--r));
  width: calc(44 * var(--r));
  height: calc(14 * var(--r));
  background: #7c3aed;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}
.tassel {
  position: absolute;
  left: calc(32 * var(--r));
  top: calc(38 * var(--r));
  width: calc(8 * var(--r));
  height: calc(16 * var(--r));
  background: #7c3aed;
  border-radius: 0 0 2px 2px;
}
.sheet {
  position: absolute;
  left: calc(20 * var(--r));
  top: calc(16 * var(--r));
  width: calc(32 * var(--r));
  height: calc(40 * var(--r));
  border-radius: 2px;
  background: #fff;
  border: 2px solid #16a34a;
  box-sizing: border-box;
}
.seal {
  position: absolute;
  right: -5px;
  bottom: 3px;
  width: calc(16 * var(--r));
  height: calc(16 * var(--r));
  border-radius: 50%;
  border: 2px solid #16a34a;
  box-sizing: border-box;
}
.doc {
  position: absolute;
  left: calc(22 * var(--r));
  top: calc(16 * var(--r));
  width: calc(28 * var(--r));
  height: calc(36 * var(--r));
  border-radius: 2px;
  border: 2px solid #ea580c;
  box-sizing: border-box;
}
.doc::before, .doc::after {
  content: '';
  position: absolute;
  left: 4px;
  right: 4px;
  height: 2px;
  background: #ea580c;
  border-radius: 1px;
}
.doc::before { top: 8px; }
.doc::after { top: 14px; right: 8px; }
.slots {
  display: flex;
  gap: calc(16 * var(--r));
  padding: calc(8 * var(--r)) calc(20 * var(--r)) calc(20 * var(--r));
  background: #f3f5f8;
  border-radius: 0 0 calc(18 * var(--r)) calc(18 * var(--r));
}
.slot {
  position: relative;
  flex: 1;
  aspect-ratio: 1.586 / 1;
  min-height: calc(168 * var(--r));
  border-radius: calc(12 * var(--r));
  overflow: hidden;
  background: #fff;
  border: 1px dashed #93c5fd;
  box-sizing: border-box;
  cursor: pointer;
}
.slot img { width: 100%; height: 100%; object-fit: cover; }
.mark {
  position: absolute;
  width: calc(22 * var(--r));
  height: calc(22 * var(--r));
  border-color: #2563eb;
  border-style: solid;
}
.tl { left: calc(12 * var(--r)); top: calc(12 * var(--r)); border-width: 2px 0 0 2px; }
.tr { right: calc(12 * var(--r)); top: calc(12 * var(--r)); border-width: 2px 2px 0 0; }
.bl { left: calc(12 * var(--r)); bottom: calc(12 * var(--r)); border-width: 0 0 2px 2px; }
.br { right: calc(12 * var(--r)); bottom: calc(12 * var(--r)); border-width: 0 2px 2px 0; }
.slot-name {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(62 * var(--r));
  text-align: center;
  color: #1d4ed8;
  font-size: calc(26 * var(--r));
  font-weight: 650;
}
.slot-tip {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(102 * var(--r));
  text-align: center;
  color: #93a4bd;
  font-size: calc(20 * var(--r));
}
.slot-tag {
  position: absolute;
  left: calc(8 * var(--r));
  bottom: calc(8 * var(--r));
  padding: 1px calc(10 * var(--r));
  border-radius: calc(8 * var(--r));
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  font-size: calc(20 * var(--r));
}
.cam-links {
  display: flex;
  justify-content: space-between;
  gap: calc(12 * var(--r));
  margin: calc(10 * var(--r)) 0 calc(4 * var(--r));
  font-size: calc(22 * var(--r));
}
.cam-links a { color: #2563eb; }
.warn { color: #b45309; font-size: calc(26 * var(--r)); line-height: 1.5; }
.h { font-size: calc(34 * var(--r)); font-weight: 700; color: #059669; }
.wait .h { color: #2563eb; }
.done .sub, .wait .sub { margin-top: calc(8 * var(--r)); color: #6b7280; }
.sign {
  margin-top: calc(28 * var(--r));
  height: calc(88 * var(--r));
  border-radius: calc(44 * var(--r));
}
.submit {
  margin-top: calc(8 * var(--r));
  height: calc(96 * var(--r));
  border-radius: calc(48 * var(--r));
  font-size: calc(32 * var(--r));
  font-weight: 650;
}
.foot {
  margin-top: calc(18 * var(--r));
  text-align: center;
  color: #98a2b3;
  font-size: calc(22 * var(--r));
  line-height: 1.5;
}
</style>
