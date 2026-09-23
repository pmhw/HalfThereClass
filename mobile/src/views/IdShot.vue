<template>
  <div class="page">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>{{ sideLabel }}拍摄</span>
    </header>

    <div v-if="phase === 'preview'" class="preview">
      <img :src="previewUrl" alt="预览" />
      <div class="actions">
        <button type="button" class="btn btn-outline" @click="retake">重拍</button>
        <button type="button" class="btn btn-primary" @click="usePhoto">使用照片</button>
      </div>
    </div>

    <template v-else>
      <div class="cam-wrap">
        <video ref="videoRef" autoplay playsinline muted class="video" />
        <div class="frame">请将身份证放入框内</div>
      </div>
      <p class="status">{{ camError || '点击快门拍摄' }}</p>
      <button type="button" class="shutter" @click="shoot">拍摄</button>
    </template>

    <canvas ref="canvasRef" class="hidden" />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from '../api/request';

const ID_SHOT_KEY = 'novis_id_shot';

const route = useRoute();
const router = useRouter();
const side = computed(() => (route.query.side === 'emblem' ? 'emblem' : 'portrait'));
const fileKey = computed(() => (route.query.key === 'idCardBack' ? 'idCardBack' : 'idCard'));
const sideLabel = computed(() => (side.value === 'emblem' ? '国徽面' : '人像面'));

const videoRef = ref(null);
const canvasRef = ref(null);
const phase = ref('cam');
const previewUrl = ref('');
const camError = ref('');
let stream = null;

onMounted(startCamera);
onUnmounted(stopCamera);

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
    }
  } catch {
    camError.value = '无法打开摄像头，请检查权限';
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

function shoot() {
  const video = videoRef.value;
  const canvas = canvasRef.value;
  if (!video || !canvas) return;
  const w = video.videoWidth || 856;
  const h = video.videoHeight || Math.round(856 / 1.585);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  previewUrl.value = canvas.toDataURL('image/jpeg', 0.92);
  phase.value = 'preview';
  stopCamera();
}

function retake() {
  previewUrl.value = '';
  phase.value = 'cam';
  startCamera();
}

function usePhoto() {
  if (!previewUrl.value) return;
  sessionStorage.setItem(
    ID_SHOT_KEY,
    JSON.stringify({ key: fileKey.value, dataUrl: previewUrl.value }),
  );
  showToast('已保存，返回认证页上传');
  router.back();
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #111827;
  color: #fff;
  padding: calc(24 * var(--r));
}
.nav { display: flex; align-items: center; gap: calc(16 * var(--r)); margin-bottom: calc(24 * var(--r)); }
.back { color: #93c5fd; }
.cam-wrap { position: relative; border-radius: calc(16 * var(--r)); overflow: hidden; background: #000; }
.video { width: 100%; display: block; min-height: calc(420 * var(--r)); object-fit: cover; }
.frame {
  position: absolute;
  inset: 10%;
  border: calc(4 * var(--r)) solid rgba(255, 255, 255, 0.85);
  border-radius: calc(12 * var(--r));
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.9);
  font-size: calc(26 * var(--r));
  pointer-events: none;
}
.status { text-align: center; color: #9ca3af; margin: calc(24 * var(--r)) 0; }
.shutter {
  display: block;
  width: calc(120 * var(--r));
  height: calc(120 * var(--r));
  margin: 0 auto;
  border-radius: 50%;
  border: calc(8 * var(--r)) solid #fff;
  background: #2563eb;
}
.preview img { width: 100%; border-radius: calc(12 * var(--r)); }
.actions { display: flex; gap: calc(16 * var(--r)); margin-top: calc(24 * var(--r)); }
.actions .btn { flex: 1; }
.hidden { display: none; }
</style>
