import { onActivated, onMounted, ref } from 'vue';

/**
 * 页面异步加载约定（后续新页面请复用）：
 *
 * const { loading, error, ready, run, bindLoad } = usePageLoad();
 * async function load() {
 *   await run(async () => {
 *     result.value = await api.xxx();
 *   });
 * }
 * bindLoad(load); // = onMounted + keep-alive 切回时静默刷新
 *
 * 模板：
 * <PageLoad :loading="loading" :ready="ready" :error="error" @retry="load">
 *   <template #skeleton><TableSkeleton :columns="8" /></template>
 *   ...真实内容...
 * </PageLoad>
 */
export function usePageLoad() {
  const loading = ref(false);
  const ready = ref(false);
  const error = ref('');

  async function run(task) {
    loading.value = true;
    error.value = '';
    try {
      const result = await task();
      ready.value = true;
      return result;
    } catch (err) {
      error.value = err?.message || '加载失败';
      return undefined;
    } finally {
      loading.value = false;
    }
  }

  function reset() {
    loading.value = false;
    ready.value = false;
    error.value = '';
  }

  /**
   * 绑定页面加载：首次 onMounted；之后 keep-alive 激活时再静默刷新。
   * （弹窗改完数据切回标签页时，列表会自动跟上最新数据）
   */
  function bindLoad(load, opts = {}) {
    if (typeof load !== 'function') return;
    const skipFirstActivate = opts.skipFirstActivate !== false;
    let firstActivate = true;
    onMounted(() => {
      load();
    });
    onActivated(() => {
      if (skipFirstActivate && firstActivate) {
        firstActivate = false;
        return;
      }
      firstActivate = false;
      load();
    });
  }

  return { loading, ready, error, run, reset, bindLoad };
}
