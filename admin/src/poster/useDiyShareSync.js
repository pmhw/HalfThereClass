import { onUnmounted, ref } from 'vue';
import { api } from '../api';

/**
 * DIY 临时链接实时同步：本地改动防抖上传，定时拉取他人改动。
 */
export function useDiyShareSync({
  mode, // 'admin' | 'public'
  getIdOrToken,
  getSnapshot,
  applyRemote,
  onStatus,
}) {
  const revision = ref(0);
  const syncing = ref(false);
  const lastError = ref('');
  let saveTimer = null;
  let pollTimer = null;
  let pushing = false;
  let applying = false;
  let disposed = false;

  function setStatus(text) {
    onStatus?.(text);
  }

  function applyPayload(data) {
    if (!data || data.unchanged) return;
    applying = true;
    try {
      revision.value = Number(data.revision) || 0;
      applyRemote(data);
    } finally {
      queueMicrotask(() => { applying = false; });
    }
  }

  async function pull() {
    const key = getIdOrToken();
    if (!key || pushing) return;
    try {
      const data = mode === 'public'
        ? await api.publicDiyShare(key, revision.value || undefined)
        : await api.diyShare(key, revision.value || undefined);
      lastError.value = '';
      applyPayload(data);
    } catch (err) {
      lastError.value = err?.message || '同步失败';
      setStatus(lastError.value);
    }
  }

  async function pushNow() {
    const key = getIdOrToken();
    if (!key || applying) return;
    const snap = getSnapshot();
    pushing = true;
    syncing.value = true;
    setStatus('同步中…');
    try {
      const body = {
        revision: revision.value,
        cfg: snap.cfg,
        entries: snap.entries,
        title: snap.title,
      };
      const data = mode === 'public'
        ? await api.updatePublicDiyShare(key, body)
        : await api.updateDiyShare(key, body);
      revision.value = Number(data.revision) || revision.value + 1;
      lastError.value = '';
      setStatus('已同步');
    } catch (err) {
      lastError.value = err?.message || '保存失败';
      setStatus(lastError.value);
      // 冲突时拉一次最新
      if (/其他端|冲突|刷新/.test(String(err?.message || ''))) {
        revision.value = 0;
        await pull();
      }
    } finally {
      pushing = false;
      syncing.value = false;
    }
  }

  function schedulePush() {
    if (applying || !getIdOrToken()) return;
    setStatus('待同步…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { pushNow(); }, 600);
  }

  function start(initial) {
    disposed = false;
    if (initial) applyPayload(initial);
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { pull(); }, 2000);
  }

  function stop() {
    disposed = true;
    clearTimeout(saveTimer);
    clearInterval(pollTimer);
    saveTimer = null;
    pollTimer = null;
  }

  onUnmounted(() => {
    if (!disposed) stop();
  });

  return {
    revision,
    syncing,
    lastError,
    start,
    stop,
    pull,
    pushNow,
    schedulePush,
    get applying() { return applying; },
  };
}

export function diyPublicUrl(token) {
  if (typeof window === 'undefined' || !token) return '';
  return `${window.location.origin}/diy/${token}`;
}
