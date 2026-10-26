<template>
  <section class="setup-page">
    <div class="page-head">
      <div>
        <h1>配置检查</h1>
        <p>把系统运行和财务计算依赖的配置集中检查。新系统按 1 → 5 的顺序配置即可；缺了哪项，这里和左侧菜单都会提示，点「去处理」直达对应页面。</p>
      </div>
      <div class="actions">
        <div class="tabs">
          <button type="button" :class="{ on: filter === 'todo' }" @click="filter = 'todo'">只看待处理</button>
          <button type="button" :class="{ on: filter === 'all' }" @click="filter = 'all'">全部</button>
        </div>
        <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '检查中…' : '重新检查' }}</button>
      </div>
    </div>

    <PageLoad :loading="loading" :ready="ready" :error="error" kpis :kpi-count="1" @retry="load">
      <article class="card hero">
        <div class="hero-main">
          <div class="ring" :class="heroTone" :style="{ '--p': `${progress}%` }">
            <span>{{ progress }}%</span>
          </div>
          <div class="hero-text">
            <strong>{{ heroTitle }}</strong>
            <p>已完成 {{ doneCount }} / {{ summary.total }} 项<span v-if="checkedAt"> · 检查于 {{ checkedAt }}</span></p>
            <div class="chips">
              <span v-if="summary.error" class="chip error">必须处理 {{ summary.error }}</span>
              <span v-if="summary.warn" class="chip warn">建议处理 {{ summary.warn }}</span>
              <span v-if="summary.info" class="chip info">提示 {{ summary.info }}</span>
              <span v-if="summary.ignored" class="chip muted">已忽略 {{ summary.ignored }}</span>
              <span v-if="!summary.error && !summary.warn && !summary.info" class="chip ok">全部配置完成</span>
            </div>
          </div>
        </div>
        <ul class="legend">
          <li><i class="dot error" />必须处理：会导致金额算错或功能不可用，不能忽略</li>
          <li><i class="dot warn" />建议处理：可能少算、无法打款或体验受影响</li>
          <li><i class="dot info" />提示：按实际业务决定，不需要的可以忽略</li>
        </ul>
      </article>

      <div class="steps">
        <article v-for="group in groups" :key="group.key" class="card step" :class="{ done: group.done, bad: group.errorCount }">
          <header class="step-head">
            <span class="step-no">
              <Icon v-if="group.done" name="check" />
              <template v-else>{{ group.step }}</template>
            </span>
            <div class="step-title">
              <strong>{{ group.title }}</strong>
              <small>{{ group.desc }}</small>
            </div>
            <span class="step-state" :class="group.done ? 'ok' : group.errorCount ? 'error' : 'warn'">
              {{ group.done ? '已完成' : `${group.todo} 项待处理` }}
            </span>
          </header>

          <ul v-if="group.visible.length" class="items">
            <li v-for="item in group.visible" :key="item.id" class="item" :class="[item.status, item.status === 'issue' ? item.level : '']">
              <span class="item-icon">
                <Icon :name="item.status === 'ok' ? 'check' : item.status === 'ignored' ? 'eye' : item.level === 'info' ? 'info' : 'x'" />
              </span>
              <div class="item-body">
                <div class="item-title">
                  <strong>{{ item.title }}</strong>
                  <span v-if="item.status === 'issue'" class="level" :class="item.level">{{ levelText[item.level] }}</span>
                  <span v-else-if="item.status === 'ignored'" class="level muted">已忽略</span>
                  <span v-if="item.status !== 'ok' && item.count > 1" class="count">{{ item.count }} 项</span>
                </div>
                <p v-if="item.status === 'ok'" class="ok-text">{{ item.okText }}</p>
                <p v-else class="desc">{{ item.desc }}</p>
                <div v-if="item.status !== 'ok' && item.samples.length" class="samples">
                  <router-link v-for="(s, idx) in item.samples" :key="idx" :to="s.to || item.link?.to || '/'" class="sample">{{ s.label }}</router-link>
                  <span v-if="item.count > item.samples.length" class="more">等 {{ item.count }} 项</span>
                </div>
              </div>
              <div class="item-ops">
                <router-link
                  v-if="item.link && item.status !== 'ok'"
                  :to="item.link.to"
                  class="btn tiny"
                  :class="{ primary: item.status === 'issue' && item.level === 'error' }"
                >{{ item.link.label }}</router-link>
                <button
                  v-if="item.ignorable && item.status !== 'ok'"
                  type="button"
                  class="link"
                  :disabled="busy === item.id"
                  @click="toggleIgnore(item)"
                >{{ item.status === 'ignored' ? '取消忽略' : '忽略' }}</button>
              </div>
            </li>
          </ul>
          <p v-else class="all-done">这一步的 {{ group.items.length }} 项都已完成。</p>
        </article>
      </div>
    </PageLoad>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { api } from '../api';
import Icon from '../components/Icon.vue';
import PageLoad from '../components/PageLoad.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { useFinanceLive } from '../composables/useFinanceLive';
import { refreshSetupStatus, setupStatus } from '../composables/useSetupStatus';
import { notify } from '../notify';

const levelText = { error: '必须处理', warn: '建议处理', info: '提示' };
const filter = ref('todo');
const busy = ref('');
const { loading, ready, error, run, bindLoad } = usePageLoad();
useFinanceLive(() => load());

const data = computed(() => setupStatus.data || { summary: {}, groups: [] });
const summary = computed(() => ({ total: 0, ok: 0, error: 0, warn: 0, info: 0, ignored: 0, ...(data.value.summary || {}) }));
const doneCount = computed(() => summary.value.ok + summary.value.ignored);
const progress = computed(() => (summary.value.total ? Math.round((doneCount.value / summary.value.total) * 100) : 0));
const heroTone = computed(() => (summary.value.error ? 'error' : summary.value.warn ? 'warn' : 'ok'));
const heroTitle = computed(() => {
  if (summary.value.error) return `还有 ${summary.value.error} 项必须处理的配置`;
  if (summary.value.warn) return `关键配置已完成，还有 ${summary.value.warn} 项建议处理`;
  if (summary.value.info) return '配置基本完成，剩下的是可选提示';
  return '全部配置完成';
});
const checkedAt = computed(() => (data.value.checkedAt ? new Date(data.value.checkedAt).toLocaleTimeString('zh-CN', { hour12: false }) : ''));

const groups = computed(() => (data.value.groups || []).map((g) => ({
  ...g,
  todo: g.items.filter((i) => i.status === 'issue').length,
  visible: filter.value === 'all' ? g.items : g.items.filter((i) => i.status === 'issue'),
})));

async function load() {
  await run(async () => {
    const result = await refreshSetupStatus(true);
    if (!ready.value && !(result?.summary?.error || result?.summary?.warn || result?.summary?.info)) filter.value = 'all';
  });
}

async function toggleIgnore(item) {
  busy.value = item.id;
  try {
    await api.setupIgnore(item.id, item.status !== 'ignored');
    notify.success(item.status === 'ignored' ? '已取消忽略' : '已忽略，这一项不再提醒');
    await refreshSetupStatus(true);
  } catch (err) {
    notify.error(err.message || '操作失败');
  } finally {
    busy.value = '';
  }
}

bindLoad(load);
</script>

<style scoped>
.tabs { display: inline-flex; gap: 4px; background: #f2f4f7; padding: 3px; border-radius: 10px; }
.tabs button {
  border: 0; background: transparent; padding: 6px 12px; border-radius: 8px; font-size: 13px; color: #475467; cursor: pointer;
}
.tabs button.on { background: #fff; color: #0f172a; font-weight: 600; box-shadow: 0 1px 2px rgba(16, 24, 40, .08); }

.hero { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; padding: 20px 24px; }
.hero-main { display: flex; align-items: center; gap: 20px; }
.ring {
  --c: #12b76a;
  width: 84px; height: 84px; border-radius: 50%; flex: none; display: grid; place-items: center;
  background: conic-gradient(var(--c) var(--p), #eaecf0 0);
}
.ring.warn { --c: #f79009; }
.ring.error { --c: #f04438; }
.ring span {
  width: 66px; height: 66px; border-radius: 50%; background: #fff; display: grid; place-items: center;
  font-size: 18px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums;
}
.hero-text strong { font-size: 17px; color: #0f172a; }
.hero-text p { margin: 4px 0 10px; color: #667085; font-size: 13px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.chip.error { background: #fef3f2; color: #b42318; }
.chip.warn { background: #fffaeb; color: #b54708; }
.chip.info { background: #eff8ff; color: #175cd3; }
.chip.muted { background: #f2f4f7; color: #667085; }
.chip.ok { background: #ecfdf3; color: #067647; }
.legend { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; align-content: center; color: #667085; font-size: 12px; }
.legend li { display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dot.error { background: #f04438; }
.dot.warn { background: #f79009; }
.dot.info { background: #2e90fa; }

.steps { display: grid; gap: 14px; margin-top: 16px; }
.step { padding: 0; overflow: hidden; border-left: 4px solid #f79009; }
.step.bad { border-left-color: #f04438; }
.step.done { border-left-color: #12b76a; }
.step-head { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #f2f4f7; }
.step-no {
  width: 28px; height: 28px; border-radius: 50%; flex: none; display: grid; place-items: center;
  background: #fffaeb; color: #b54708; font-weight: 700; font-size: 14px;
}
.step.bad .step-no { background: #fef3f2; color: #b42318; }
.step.done .step-no { background: #ecfdf3; color: #067647; }
.step-no :deep(svg) { width: 16px; height: 16px; }
.step-title { flex: 1; display: grid; gap: 2px; }
.step-title strong { color: #0f172a; font-size: 15px; }
.step-title small { color: #667085; font-size: 12px; }
.step-state { padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.step-state.ok { background: #ecfdf3; color: #067647; }
.step-state.warn { background: #fffaeb; color: #b54708; }
.step-state.error { background: #fef3f2; color: #b42318; }

.items { list-style: none; margin: 0; padding: 4px 0; }
.item { display: flex; gap: 12px; padding: 12px 18px; align-items: flex-start; }
.item + .item { border-top: 1px dashed #f2f4f7; }
.item-icon {
  width: 22px; height: 22px; border-radius: 50%; flex: none; display: grid; place-items: center; margin-top: 1px;
  background: #ecfdf3; color: #067647;
}
.item-icon :deep(svg) { width: 13px; height: 13px; stroke-width: 2.4; }
.item.issue.error .item-icon { background: #fef3f2; color: #d92d20; }
.item.issue.warn .item-icon { background: #fffaeb; color: #dc6803; }
.item.issue.info .item-icon { background: #eff8ff; color: #1570ef; }
.item.ignored .item-icon { background: #f2f4f7; color: #98a2b3; }
.item.ignored .item-body { opacity: .7; }
.item-body { flex: 1; min-width: 0; }
.item-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.item-title strong { color: #0f172a; font-size: 14px; }
.level { padding: 0 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.level.error { background: #fef3f2; color: #b42318; }
.level.warn { background: #fffaeb; color: #b54708; }
.level.info { background: #eff8ff; color: #175cd3; }
.level.muted { background: #f2f4f7; color: #667085; }
.count { font-size: 12px; color: #667085; }
.desc { margin: 4px 0 0; color: #475467; font-size: 13px; }
.ok-text { margin: 2px 0 0; color: #667085; font-size: 12px; }
.samples { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sample {
  padding: 2px 8px; border-radius: 6px; font-size: 12px; color: #344054; background: #f2f4f7; text-decoration: none;
}
.sample:hover { background: #eff4ff; color: var(--primary, #2563eb); }
.more { font-size: 12px; color: #98a2b3; align-self: center; }
.item-ops { display: flex; align-items: center; gap: 10px; flex: none; }
.all-done { margin: 0; padding: 12px 18px; color: #067647; font-size: 13px; }
</style>
