import { reactive } from 'vue';
import { api } from '../api';

/** 配置检查结果（侧边栏角标、顶部提醒、配置检查页共用） */
export const setupStatus = reactive({
  data: null,
  loading: false,
  at: 0,
});

let pending = null;

export function refreshSetupStatus(force = false) {
  if (!force && setupStatus.data && Date.now() - setupStatus.at < 60_000) return Promise.resolve(setupStatus.data);
  if (pending) return pending;
  setupStatus.loading = true;
  pending = api.setupCheck()
    .then((data) => {
      setupStatus.data = data;
      setupStatus.at = Date.now();
      return data;
    })
    .finally(() => {
      setupStatus.loading = false;
      pending = null;
    });
  return pending;
}

/** 配置改动后调用，让角标与提醒尽快刷新 */
export function markSetupDirty() {
  setupStatus.at = 0;
}
