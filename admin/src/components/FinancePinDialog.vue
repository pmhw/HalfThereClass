<template>
  <PageModal
    :open="financeGate.open"
    size="narrow"
    icon="lock"
    :title="financeGate.unset ? '还没有设置财务密码' : '输入财务密码'"
    :desc="financeGate.unset ? '财务功能需要 6 位财务密码保护，所有管理员共用一个' : '查看和操作财务数据前需要验证'"
    :close-on-backdrop="false"
    @close="cancel"
  >
    <div v-if="financeGate.unset" class="pin-body">
      <p v-if="canManage" class="pin-tip">请先到「系统设置 → 财务密码」设置一个 6 位数字密码，所有管理员共用，设置后即可进入财务功能。</p>
      <p v-else class="pin-tip">财务密码由系统管理员统一设置，请联系管理员在「系统设置 → 财务密码」中设置后再进入。</p>
      <div class="pin-actions">
        <button class="btn" :class="{ primary: !canManage }" type="button" @click="cancel">{{ canManage ? '取消' : '知道了' }}</button>
        <button v-if="canManage" class="btn primary" type="button" @click="goSettings">去设置</button>
      </div>
    </div>
    <form v-else class="pin-body" @submit.prevent="submit(pin)">
      <PinInput ref="pinRef" v-model="pin" autofocus :disabled="busy" :error="errorTick" @complete="submit" />
      <p class="pin-error" :class="{ show: error }">{{ error || ' ' }}</p>
      <p class="pin-tip">验证通过后，本浏览器所有标签页共用；只要还在后台操作就一直有效，连续 2 小时无操作才需重新输入。所有管理员共用一个财务密码，忘记请联系系统管理员。</p>
      <div class="pin-actions">
        <button class="btn" type="button" @click="cancel">取消</button>
        <button class="btn primary" type="submit" :disabled="busy || pin.length !== 6">{{ busy ? '验证中' : '确定' }}</button>
      </div>
    </form>
  </PageModal>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import PageModal from './PageModal.vue';
import PinInput from './PinInput.vue';
import { api, getProfile } from '../api';
import { allow } from '../access';
import { financeGate, setFinanceToken, settleFinancePin } from '../financePin';

const router = useRouter();
const pin = ref('');
const busy = ref(false);
const error = ref('');
const errorTick = ref(0);
const pinRef = ref(null);
const canManage = ref(false);

watch(() => financeGate.open, async (open) => {
  if (!open) return;
  pin.value = '';
  error.value = '';
  canManage.value = allow(getProfile(), 'admin.settings');
  nextTick(() => pinRef.value?.focus());
  try {
    const status = await api.financePinStatus();
    canManage.value = !!status.canManage;
    if (!status.set) financeGate.unset = true;
  } catch {
    /* 状态查询失败时按输入框处理，提交时后端会再判断 */
  }
});

async function submit(value) {
  if (busy.value || String(value || '').length !== 6) return;
  busy.value = true;
  error.value = '';
  try {
    const data = await api.verifyFinancePin({ pin: value });
    setFinanceToken(data.token, data.expiresAt);
    settleFinancePin(true);
  } catch (err) {
    const message = err.message || '验证失败';
    if (/还没有设置财务密码/.test(message)) {
      financeGate.unset = true;
      return;
    }
    error.value = message;
    errorTick.value += 1;
    pin.value = '';
    pinRef.value?.focus();
  } finally {
    busy.value = false;
  }
}

function cancel() {
  settleFinancePin(false);
}

function goSettings() {
  settleFinancePin(false);
  router.push({ path: '/settings', query: { pin: '1' } });
}
</script>

<style scoped>
.pin-body {
  display: grid;
  gap: 12px;
  padding: 4px 0;
}

.pin-error {
  min-height: 20px;
  margin: 0;
  color: var(--red);
  font-size: 13px;
  text-align: center;
  visibility: hidden;
}

.pin-error.show {
  visibility: visible;
}

.pin-tip {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.pin-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
