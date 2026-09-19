let loaded = { key: '', security: '' };

function plugins(AMap) {
  return new Promise((resolve, reject) => {
    if (!AMap?.plugin) {
      reject(new Error('高德地图没有加载成功'));
      return;
    }
    AMap.plugin(['AMap.AutoComplete', 'AMap.PlaceSearch', 'AMap.Geocoder'], () => resolve(AMap));
  });
}

export function loadAmap(config) {
  const key = String(config?.key || '').trim();
  const security = String(config?.security || '').trim();
  if (!key || !security) {
    return Promise.reject(new Error('请先在系统设置里填写高德 Key 和安全密钥'));
  }
  if (window.AMap && loaded.key === key && loaded.security === security) return plugins(window.AMap);
  if (window.AMap && loaded.key && (loaded.key !== key || loaded.security !== security)) {
    return Promise.reject(new Error('密钥已更新，请刷新页面后再打开地图'));
  }
  window._AMapSecurityConfig = { securityJsCode: security };
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => {
      loaded = { key, security };
      plugins(window.AMap).then(resolve, reject);
    };
    script.onerror = () => reject(new Error('高德地图加载失败，请检查网络和密钥'));
    document.head.appendChild(script);
  });
}

export function pointOf(location) {
  if (!location) return null;
  if (typeof location === 'string' && location.includes(',')) {
    const [lng, lat] = location.split(',').map(Number);
    if (!Number.isNaN(lng) && !Number.isNaN(lat)) return { lng, lat };
    return null;
  }
  const lng = typeof location.getLng === 'function' ? location.getLng() : location.lng;
  const lat = typeof location.getLat === 'function' ? location.getLat() : location.lat;
  if (typeof lng !== 'number' || typeof lat !== 'number' || Number.isNaN(lng) || Number.isNaN(lat)) return null;
  return { lng, lat };
}

export function regionOf(component, formatted = '') {
  const province = component?.province || '';
  const rawCity = Array.isArray(component?.city) ? '' : (component?.city || '');
  const city = rawCity || (/市$/.test(province) ? province : (component?.district || ''));
  return { province, city, address: formatted || '' };
}
