# Admin 页面加载约定

后续新建/改造后台页面时，统一使用以下封装，**不要**手写 loading 文案或空表闪烁。

## 组件

| 组件 | 用途 |
|------|------|
| `PageLoad` | 首屏骨架 → 成功后渲染内容；失败展示重试；刷新时顶部细进度条 |
| `TableSkeleton` | 列表骨架（可选 KPI / 筛选条） |
| `LoadSpinner` | 按钮/局部加载转圈 |

## Composable

```js
import { usePageLoad } from '../composables/usePageLoad';
import PageLoad from '../components/PageLoad.vue';

const { loading, ready, error, run } = usePageLoad();

async function load() {
  await run(async () => {
    result.value = await api.xxx({ page: page.value });
  });
}
```

## 模板

```vue
<div class="page-head">…标题与操作始终可见…</div>

<PageLoad
  :loading="loading"
  :ready="ready"
  :error="error"
  :columns="8"
  kpis
  filters
  @retry="load"
>
  <!-- 筛选 + 表格 + 分页等真实内容 -->
</PageLoad>
```

规则：

1. **网络成功后再展示业务内容**（`ready === true`）
2. 列表首屏用骨架，不要用空白 table
3. 二次刷新（搜索/翻页）保留旧内容 + 顶部进度条（`PageLoad` 已处理）
4. 表单提交继续用按钮 `disabled` +「保存中」，不必整页骨架
