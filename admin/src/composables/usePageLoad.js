import { ref } from 'vue';

/**
 * 页面异步加载约定（后续新页面请复用）：
 *
 * const { loading, error, ready, run } = usePageLoad();
 * async function load() {
 *   await run(async () => {
 *     result.value = await api.xxx();
 *   });
 * }
 * onMounted(load);
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

  return { loading, ready, error, run, reset };
}
