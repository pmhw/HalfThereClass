<template>
  <section class="finance-hub">
    <div class="hub-tabs">
      <div class="tabs">
        <button
          v-for="item in tabs"
          :key="item.key"
          type="button"
          :class="{ on: tab === item.key }"
          @click="setTab(item.key)"
        >{{ item.label }}</button>
      </div>
    </div>
    <KeepAlive>
      <component :is="current.component" v-if="current && synced" :key="current.key" />
    </KeepAlive>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getProfile } from '../api';
import { allow } from '../access';
import Finance from './Finance.vue';
import FinanceTeachers from './FinanceTeachers.vue';
import FinanceOrgProfit from './FinanceOrgProfit.vue';

const ALL_TABS = [
  { key: 'overview', label: '收益概览', perm: 'finance.overview', component: Finance },
  { key: 'teachers', label: '教师收益', perm: 'finance.teacher', component: FinanceTeachers },
  { key: 'org', label: '机构利润', perm: 'finance.org', component: FinanceOrgProfit },
];

const route = useRoute();
const router = useRouter();
const tabs = computed(() => ALL_TABS.filter((item) => allow(getProfile(), item.perm)));
/** 页面被缓存在后台时不跟随其他页面地址里的 tab */
const queryTab = ref(String(route.query.tab || ''));
const tab = computed(() => {
  const want = queryTab.value || 'overview';
  return tabs.value.some((item) => item.key === want) ? want : tabs.value[0]?.key;
});
const current = computed(() => tabs.value.find((item) => item.key === tab.value));
/** 地址里的 tab 与实际显示一致后再渲染，月份栏按 tab 判断能否选「全部月份」 */
const synced = computed(() => (queryTab.value || 'overview') === tab.value);

function setTab(key) {
  if (route.path !== '/finance') return;
  router.replace({ query: { ...route.query, tab: key === 'overview' ? undefined : key } }).catch(() => {});
}

watch(() => [route.path, route.query.tab], ([path, value]) => {
  if (path !== '/finance') return;
  queryTab.value = String(value || '');
  if (!synced.value && tab.value) setTab(tab.value);
}, { immediate: true });
</script>

<style scoped>
.hub-tabs {
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}

.hub-tabs .tabs {
  margin: 0;
}
</style>
