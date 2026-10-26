<template>
  <section>
    <div v-if="!embedded" class="page-head">
      <div>
        <h1>课程分成规则</h1>
        <p>直接读取课程设置，在这里修改会同步写回课程。承接机构课：平台利润 = 校方价格 − 课时费；机构利润按课时费抽成；教师所得 = 课时费 − 机构利润。机构设为「不看金额」时课时费直接结算给机构。抽成在「机构管理」按课配置。</p>
      </div>
    </div>

    <p v-if="embedded" class="muted embedded-tip">承接机构课：平台利润 = 校方价格 − 课时费；机构利润按课时费抽成；教师所得 = 课时费 − 机构利润。机构设为「不看金额」时课时费直接结算给机构。抽成在「机构管理」按课配置。</p>
    <PageLoad :loading="loading" :ready="ready" :error="error" :columns="8" @retry="load">
      <article class="card" :class="{ flat: embedded }">
        <table>
          <thead>
            <tr>
              <th>课程</th>
              <th>校方价格</th>
              <th>课时费<CalcTip name="rules.sessionFee" /></th>
              <th>机构 / 分佣<CalcTip name="rules.commission" /></th>
              <th>预估教师<CalcTip name="rules.teacher" /></th>
              <th>预估机构<CalcTip name="rules.org" /></th>
              <th>预估平台<CalcTip name="rules.platform" /></th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.id">
              <td>
                <strong>{{ item.title }}</strong>
                <div class="muted">{{ item.teacherName }} · {{ item.school || '未绑定学校' }}</div>
              </td>
              <td>{{ money(item.price) }}</td>
              <td>{{ item.sessionFee == null ? '未配置' : money(item.sessionFee) }}</td>
              <td>
                <div>{{ item.organizationName }}</div>
                <div class="muted">{{ commissionText(item) }}</div>
              </td>
              <td>
                <template v-if="item.settleToOrg">
                  <span class="tag amber">结算给机构</span>
                  <div class="muted">{{ money(item.preview?.orgSettleAmount) }}</div>
                </template>
                <template v-else>{{ money(item.preview?.teacherAmount) }}</template>
              </td>
              <td>{{ money(item.preview?.institutionAmount) }}</td>
              <td>{{ money(item.preview?.platformAmount) }}</td>
              <td class="col-actions">
                <button class="link" type="button" @click="edit(item)">编辑</button>
              </td>
            </tr>
            <tr v-if="!list.length"><td colspan="8" class="empty">暂无课程</td></tr>
          </tbody>
        </table>
      </article>
    </PageLoad>

    <PageModal :open="!!form" size="narrow" title="编辑课程收益参数" icon="gear" @close="form = null">
      <form v-if="form" class="form-grid" @submit.prevent="save">
        <label>
          校方价格（元/课时）
          <input v-model.number="form.price" type="number" min="0" step="0.01" required />
        </label>
        <label>
          课时费（元/节）
          <input
            v-model="form.sessionFee"
            type="number"
            min="0"
            step="0.01"
            :required="form.splitMode === 'course_org'"
          />
        </label>
        <p v-if="form.splitMode === 'course_org' && rulePreview" class="ok-tip">{{ rulePreview }}</p>
        <p class="muted">
          <template v-if="form.splitMode === 'course_org'">
            本课已承接机构（{{ form.organizationName }}）：平台利润 = 校方价 − 课时费；机构按课时费抽成，剩余为教师课时费。抽成请到机构详情调整。
          </template>
          <template v-else>
            机构分佣请到「机构管理」设置。全职分佣一般为 0，利润 = 校方价格 − 课时费；
            兼职固定抽成时，利润 = 校方价格 − 课时费 − 分佣值。
          </template>
        </p>
        <div class="actions">
          <button class="btn" type="button" @click="form = null">取消</button>
          <button class="btn primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </form>
    </PageModal>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { api } from '../api';
import { money } from '../format';
import PageLoad from '../components/PageLoad.vue';
import CalcTip from '../components/CalcTip.vue';
import PageModal from '../components/PageModal.vue';
import { usePageLoad } from '../composables/usePageLoad';
import { notifyFinanceChanged } from '../composables/useFinanceLive';
import { notify } from '../notify';

defineProps({ embedded: { type: Boolean, default: false } });

const list = ref([]);
const form = ref(null);
const saving = ref(false);
const { loading, ready, error, run, bindLoad } = usePageLoad();

function commissionText(item) {
  if (item.splitMode === 'course_org') {
    if (item.commissionMode === 'fixed') return `承接 · 固定 ¥${item.commissionValue}/节`;
    return `承接 · 课时费 ${item.commissionValue}%`;
  }
  if (!item.commissionMode) return '无分佣';
  if (item.commissionMode === 'fixed') return `固定 ¥${item.commissionValue}/节`;
  return `${item.commissionValue}%`;
}

const rulePreview = computed(() => {
  const f = form.value;
  if (!f || f.splitMode !== 'course_org') return '';
  const price = Number(f.price || 0);
  const fee = Number(f.sessionFee || 0);
  if (!fee) return '请填写课时费';
  const round = (value) => Math.round(value * 100) / 100;
  const raw = Number(f.commissionValue || 0);
  const commission = Math.min(fee, round(f.commissionMode === 'fixed' ? raw : fee * raw / 100));
  const tail = f.settleToOrg
    ? `课时费 ¥${fee.toFixed(2)} 结算给机构（机构利润 ¥${commission.toFixed(2)}）`
    : `机构 ¥${commission.toFixed(2)}、教师 ¥${round(fee - commission).toFixed(2)}`;
  return `平台 ¥${round(price - fee).toFixed(2)}；${tail}`;
});

function edit(item) {
  form.value = {
    id: item.id,
    price: item.price ?? 0,
    sessionFee: item.sessionFee ?? '',
    splitMode: item.splitMode || 'none',
    organizationName: item.organizationName,
    commissionMode: item.commissionMode,
    commissionValue: item.commissionValue,
    settleToOrg: !!item.settleToOrg,
  };
}

async function load() {
  await run(async () => {
    list.value = await api.financeRules();
  });
}

async function save() {
  saving.value = true;
  try {
    await api.financeSaveRule(form.value.id, { price: form.value.price, sessionFee: form.value.sessionFee });
    notify.success('已保存');
    form.value = null;
    notifyFinanceChanged('rule');
    await load();
  } catch (e) {
    notify.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

bindLoad(load);
</script>

<style scoped>
.embedded-tip { margin: 0 0 12px; font-size: 13px; line-height: 1.6; }
.card.flat { box-shadow: none; overflow-x: auto; }
.form-grid { display: grid; gap: 12px; }
.form-grid label { display: grid; gap: 6px; font-size: 13px; color: #475467; }
.form-grid input { height: 40px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; }
</style>
