<template>
  <div v-if="location" class="card loc">
    <div class="h">上课地点</div>
    <div v-if="hasPoint && mapState !== 'off'" class="map-wrap" @click="sheet = true">
      <div ref="mapEl" class="map" />
      <div v-if="mapState === 'loading'" class="map-tip">地图加载中…</div>
      <div v-else-if="mapState === 'error'" class="map-tip">地图加载失败，可直接导航</div>
    </div>
    <div class="info">
      <div class="text">
        <div class="name">{{ location.name }}<span v-if="location.classroom" class="room"> · {{ location.classroom }}</span></div>
        <div v-if="location.address && location.address !== location.name" class="addr">{{ location.address }}</div>
      </div>
      <button type="button" class="copy" @click="copyAddress">复制</button>
    </div>
    <button type="button" class="btn btn-primary btn-block nav-btn" @click="sheet = true">导航到这里</button>

    <Teleport to="body">
      <div v-if="sheet" class="sheet-mask" @click.self="sheet = false">
        <div class="sheet">
          <div class="sheet-title">选择地图导航</div>
          <a v-for="app in apps" :key="app.key" class="sheet-item" :href="app.url" target="_blank" rel="noopener" @click="sheet = false">
            {{ app.label }}
          </a>
          <button type="button" class="sheet-item cancel" @click="sheet = false">取消</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { loadAmap, navApps } from '../utils/amap';
import { showToast } from '../api/request';

const props = defineProps({ location: { type: Object, default: null } });

const mapEl = ref(null);
const mapState = ref('loading');
const sheet = ref(false);
let map = null;

const hasPoint = computed(() => props.location?.lng != null && props.location?.lat != null);
const apps = computed(() => navApps(props.location));

async function render() {
  destroy();
  if (!hasPoint.value) return;
  mapState.value = 'loading';
  try {
    const AMap = await loadAmap();
    if (!AMap) {
      mapState.value = 'off';
      return;
    }
    await nextTick();
    if (!mapEl.value) return;
    const center = [props.location.lng, props.location.lat];
    map = new AMap.Map(mapEl.value, {
      center,
      zoom: 16,
      dragEnable: false,
      zoomEnable: false,
      doubleClickZoom: false,
      keyboardEnable: false,
      scrollWheel: false,
      touchZoom: false,
    });
    map.add(new AMap.Marker({ position: center, title: props.location.name }));
    map.on('click', () => { sheet.value = true; });
    mapState.value = 'ready';
  } catch {
    mapState.value = 'error';
  }
}

function destroy() {
  if (map) {
    map.destroy();
    map = null;
  }
}

async function copyAddress() {
  const loc = props.location;
  const text = [loc.address || loc.name, loc.classroom].filter(Boolean).join(' ');
  try {
    await navigator.clipboard.writeText(text);
    showToast('地址已复制');
  } catch {
    showToast(text);
  }
}

watch(() => (props.location ? `${props.location.lng},${props.location.lat}` : ''), render, { immediate: true });
onBeforeUnmount(destroy);
</script>

<style scoped>
.loc { margin: 0 calc(24 * var(--r)) calc(24 * var(--r)); }
.h { font-weight: 650; margin-bottom: calc(16 * var(--r)); }
.map-wrap {
  position: relative;
  height: calc(320 * var(--r));
  border-radius: calc(12 * var(--r));
  overflow: hidden;
  background: #eef2f7;
}
.map { width: 100%; height: 100%; }
.map-tip {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #98a2b3;
  font-size: calc(24 * var(--r));
}
.info {
  display: flex;
  align-items: flex-start;
  gap: calc(16 * var(--r));
  margin-top: calc(16 * var(--r));
}
.text { flex: 1; min-width: 0; }
.name { font-weight: 600; color: #101828; }
.room { color: #667085; font-weight: 400; }
.addr { margin-top: calc(4 * var(--r)); color: #667085; font-size: calc(24 * var(--r)); line-height: 1.5; }
.copy {
  flex: none;
  padding: calc(6 * var(--r)) calc(18 * var(--r));
  border-radius: calc(24 * var(--r));
  background: #f2f4f7;
  color: #475467;
  font-size: calc(24 * var(--r));
}
.nav-btn { margin-top: calc(20 * var(--r)); }
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  background: #fff;
  border-radius: calc(24 * var(--r)) calc(24 * var(--r)) 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  overflow: hidden;
}
.sheet-title {
  padding: calc(24 * var(--r));
  text-align: center;
  color: #98a2b3;
  font-size: calc(24 * var(--r));
  border-bottom: 1px solid #f2f4f7;
}
.sheet-item {
  display: block;
  width: 100%;
  padding: calc(28 * var(--r));
  text-align: center;
  font-size: calc(30 * var(--r));
  color: #101828;
  border-bottom: 1px solid #f2f4f7;
}
.sheet-item.cancel { border-bottom: 0; border-top: calc(12 * var(--r)) solid #f7f8fa; color: #667085; }
</style>
