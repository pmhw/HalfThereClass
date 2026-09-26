<template>
  <section>
    <div class="page-head">
      <div>
        <p class="crumb">课程管理 / 学校管理</p>
        <h1>学校管理</h1>
        <p>用高德地图搜索或点选，自动记录坐标、省份和城市。</p>
      </div>
      <button class="btn primary" @click="openForm()">新增学校</button>
    </div>
    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="6" @retry="load">
    <article class="card">
      <table>
        <thead>
          <tr><th>学校</th><th>省份</th><th>城市</th><th>地址</th><th>课程</th><th class="col-actions">操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in list" :key="item.id">
            <td>{{ item.name }}</td>
            <td>{{ item.province || '—' }}</td>
            <td>{{ item.city || '—' }}</td>
            <td>{{ item.address || '—' }}</td>
            <td>{{ item._count?.courses || 0 }}</td>
            <td class="col-actions">
              <div class="row-actions">
                <ActionBtn icon="pencil" tip="编辑" @click="openForm(item)" />
                <ActionBtn
                  icon="trash"
                  tip="删除"
                  tone="danger"
                  :disabled="!!item._count?.courses"
                  disabled-tip="学校下还有课程，不能删除"
                  @click="remove(item)"
                />
              </div>
            </td>
          </tr>
          <tr v-if="!list.length"><td colspan="6" class="empty">还没有学校</td></tr>
        </tbody>
      </table>
    </article>
    </PageLoad>

    <PageModal
      :open="!!form"
      size="wide"
      :title="form?.id ? '编辑学校' : '新增学校'"
      @close="closeForm"
    >
      <form class="form" @submit.prevent="save">
        <label>学校名称<input v-model="form.name" required placeholder="请输入学校名称" /></label>
        <label>学校地址
          <div class="school-address">
            <div class="school-search" ref="searchBox">
              <input
                v-model="form.address"
                placeholder="搜索学校或地址"
                @input="onSearchInput"
                @focus="onSearchInput"
              />
              <div v-if="tips.length" class="amap-tips">
                <button v-for="(tip, index) in tips" :key="tip.id || index" type="button" @mousedown.prevent="pickTip(tip)">
                  <strong>{{ tip.name }}</strong>
                  <small>{{ tip.district }}{{ tip.address }}</small>
                </button>
              </div>
            </div>
            <button class="btn" type="button" @click="searchNow">搜索</button>
          </div>
        </label>
        <div>
          <div class="school-map-label">地图选点</div>
          <div class="school-map-wrap">
            <div ref="mapBox" class="school-map"></div>
            <div v-if="mapError" class="school-map-empty">
              <p>{{ mapError }}</p>
              <router-link v-if="canSettings" class="btn" to="/settings">去系统设置</router-link>
            </div>
          </div>
          <p class="muted">输入地址选择搜索结果，或直接在地图上点选。点位会返回经纬度。</p>
        </div>
        <div class="form-row">
          <label>经度<input :value="coordText(form.lng)" readonly /></label>
          <label>纬度<input :value="coordText(form.lat)" readonly /></label>
        </div>
        <div class="form-row">
          <label>省份<input :value="form.province || '选点后自动记录'" readonly /></label>
          <label>城市<input :value="form.city || '选点后自动记录'" readonly /></label>
        </div>
        <p v-if="hint" class="muted">{{ hint }}</p>
        <p v-if="formError" class="error">{{ formError }}</p>
        <div class="form-actions">
          <button class="btn primary" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存' }}</button>
          <button class="btn" type="button" @click="closeForm">取消</button>
        </div>
      </form>
    </PageModal>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, getProfile } from '../api';
import { allow } from '../access';
import { loadAmap, pointOf, regionOf } from '../amap';
import ActionBtn from '../components/ActionBtn.vue';
import PageModal from '../components/PageModal.vue';
import PageLoad from '../components/PageLoad.vue';
import { usePageLoad } from '../composables/usePageLoad';

const list = ref([]);
const { loading, ready, error, run } = usePageLoad();
const form = ref(null);
const formError = ref('');
const hint = ref('');
const saving = ref(false);
const mapBox = ref(null);
const searchBox = ref(null);
const tips = ref([]);
const mapError = ref('');
const canSettings = allow(getProfile(), 'admin');
let map;
let marker;
let geocoder;
let autoComplete;
let searchTimer;

function blank() {
  return { id: null, name: '', address: '', province: '', city: '', lng: '', lat: '', status: 1 };
}

function coordText(value) {
  return value === '' || value == null ? '选点后返回' : value;
}

function round6(value) {
  return Number(Number(value).toFixed(6));
}

async function load() {
  await run(async () => {
    list.value = await api.schools();
  });
}

function destroyMap() {
  clearTimeout(searchTimer);
  map?.destroy?.();
  map = null;
  marker = null;
  geocoder = null;
  autoComplete = null;
  tips.value = [];
}

function setMarker(lng, lat) {
  if (!map || !window.AMap) return;
  const pos = [lng, lat];
  if (!marker) marker = new window.AMap.Marker({ position: pos, map });
  else marker.setPosition(pos);
  map.setCenter(pos);
  if (map.getZoom() < 15) map.setZoom(16);
}

function reversePoint(lng, lat) {
  return new Promise((resolve, reject) => {
    if (!geocoder) {
      reject(new Error('地图还没准备好'));
      return;
    }
    geocoder.getAddress([lng, lat], (status, result) => {
      if (status !== 'complete' || !result?.regeocode) {
        reject(new Error('没有解析到省份和城市'));
        return;
      }
      resolve(regionOf(result.regeocode.addressComponent, result.regeocode.formattedAddress));
    });
  });
}

async function applyPoint(lat, lng, fromMap) {
  form.value.lat = round6(lat);
  form.value.lng = round6(lng);
  setMarker(form.value.lng, form.value.lat);
  hint.value = `坐标 ${form.value.lng}, ${form.value.lat}`;
  try {
    const region = await reversePoint(form.value.lng, form.value.lat);
    form.value.province = region.province;
    form.value.city = region.city;
    if (fromMap && region.address) form.value.address = region.address;
    const place = [region.province, region.city].filter(Boolean).join(' / ');
    hint.value = place
      ? `坐标 ${form.value.lng}, ${form.value.lat} · ${place}`
      : `坐标 ${form.value.lng}, ${form.value.lat}`;
  } catch (err) {
    hint.value = `坐标 ${form.value.lng}, ${form.value.lat}。${err.message}`;
  }
}

async function mountMap() {
  await nextTick();
  if (!mapBox.value) return;
  destroyMap();
  mapError.value = '';
  try {
    const AMap = await loadAmap(await api.amapConfig());
    if (!form.value || !mapBox.value) return;
    const lng = Number(form.value.lng) || 121.4737;
    const lat = Number(form.value.lat) || 31.2304;
    const picked = form.value.lng !== '' && form.value.lat !== '';
    map = new AMap.Map(mapBox.value, { zoom: picked ? 16 : 11, center: [lng, lat] });
    geocoder = new AMap.Geocoder();
    autoComplete = new AMap.AutoComplete({ city: '全国' });
    if (picked) setMarker(lng, lat);
    map.on('click', (event) => {
      tips.value = [];
      applyPoint(event.lnglat.getLat(), event.lnglat.getLng(), true);
    });
    setTimeout(() => map?.resize(), 200);
  } catch (err) {
    mapError.value = err.message;
  }
}

function openForm(item) {
  formError.value = '';
  hint.value = '';
  mapError.value = '';
  form.value = item
    ? {
        id: item.id,
        name: item.name,
        address: item.address || '',
        province: item.province || '',
        city: item.city || '',
        lng: item.lng ?? '',
        lat: item.lat ?? '',
        status: item.status,
      }
    : blank();
  mountMap();
}

function closeForm() {
  form.value = null;
  destroyMap();
}

function onDocDown(event) {
  if (!searchBox.value?.contains(event.target)) tips.value = [];
}

function runSearch(keyword) {
  const query = keyword.trim();
  if (!query) {
    tips.value = [];
    return;
  }
  if (!autoComplete) {
    formError.value = mapError.value || '地图还没准备好';
    return;
  }
  formError.value = '';
  autoComplete.search(query, (status, result) => {
    if (!form.value || form.value.address.trim() !== query) return;
    if (status === 'no_data') {
      tips.value = [];
      formError.value = '没有找到相关地点';
      return;
    }
    if (status !== 'complete') {
      tips.value = [];
      formError.value = '地址搜索失败，请检查高德密钥';
      return;
    }
    tips.value = (result.tips || []).filter((item) => item?.name).slice(0, 8);
    if (!tips.value.length) formError.value = '没有找到相关地点';
  });
}

function onSearchInput() {
  clearTimeout(searchTimer);
  const query = form.value?.address?.trim() || '';
  if (!query) {
    tips.value = [];
    return;
  }
  searchTimer = setTimeout(() => runSearch(query), 250);
}

function searchNow() {
  clearTimeout(searchTimer);
  if (!form.value.address?.trim()) {
    formError.value = '请先输入学校或地址';
    return;
  }
  runSearch(form.value.address);
}

function searchPlace(tip) {
  return new Promise((resolve) => {
    const finder = new window.AMap.PlaceSearch({ city: tip.adcode || '全国', pageSize: 1 });
    finder.search(tip.name, (status, result) => {
      resolve(pointOf(result?.poiList?.pois?.[0]?.location));
    });
  });
}

async function pickTip(tip) {
  tips.value = [];
  formError.value = '';
  const text = [tip.district, tip.address, tip.name].filter(Boolean).join('');
  form.value.address = text || tip.name;
  let point = pointOf(tip.location);
  if (!point) point = await searchPlace(tip);
  if (!point) {
    formError.value = '这个结果没有坐标，换一个再试';
    return;
  }
  await applyPoint(point.lat, point.lng, false);
}

async function save() {
  saving.value = true;
  formError.value = '';
  try {
    if (form.value.id) await api.updateSchool(form.value.id, form.value);
    else await api.createSchool(form.value);
    closeForm();
    await load();
  } catch (err) {
    formError.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function remove(item) {
  if (item._count?.courses) return;
  error.value = '';
  try {
    await api.deleteSchool(item.id);
    await load();
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(() => {
  load();
  document.addEventListener('mousedown', onDocDown);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown);
  destroyMap();
});
</script>
