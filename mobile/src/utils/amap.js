import { getMapConfig } from '../api';

let loading = null;

/** 加载高德 JS API；未配置 Key 时返回 null，页面只展示地址与导航 */
export function loadAmap() {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loading) return loading;
  loading = getMapConfig()
    .then((config) => {
      if (!config?.enabled || !config.key) return null;
      window._AMapSecurityConfig = { serviceHost: `${window.location.origin}${config.serviceHost}` };
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.key)}`;
        script.async = true;
        script.onload = () => (window.AMap ? resolve(window.AMap) : reject(new Error('地图加载失败')));
        script.onerror = () => reject(new Error('地图加载失败'));
        document.head.appendChild(script);
      });
    })
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** 导航目标：有坐标走坐标（GCJ-02），否则按地址搜索 */
export function navApps(loc) {
  if (!loc) return [];
  const name = encodeURIComponent(loc.name || loc.address || '上课地点');
  const keyword = encodeURIComponent(loc.address || loc.name || '');
  const hasPoint = loc.lng != null && loc.lat != null;
  const apps = [
    {
      key: 'amap',
      label: '高德地图',
      url: hasPoint
        ? `https://uri.amap.com/navigation?to=${loc.lng},${loc.lat},${name}&mode=car&coordinate=gaode&callnative=1&src=novis`
        : `https://uri.amap.com/search?keyword=${keyword}&callnative=1&src=novis`,
    },
    {
      key: 'baidu',
      label: '百度地图',
      url: hasPoint
        ? `https://api.map.baidu.com/marker?location=${loc.lat},${loc.lng}&title=${name}&content=${keyword}&coord_type=gcj02&output=html&src=webapp.novis.course`
        : `https://api.map.baidu.com/geocoder?address=${keyword}&output=html&src=webapp.novis.course`,
    },
  ];
  if (isIOS()) {
    apps.push({
      key: 'apple',
      label: 'Apple 地图',
      url: hasPoint ? `https://maps.apple.com/?daddr=${loc.lat},${loc.lng}&q=${name}` : `https://maps.apple.com/?q=${keyword}`,
    });
  }
  return apps;
}
