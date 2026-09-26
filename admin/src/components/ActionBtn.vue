<template>
  <span
    class="tip-wrap"
    :data-tip="disabled && disabledTip ? disabledTip : tip"
  >
    <router-link
      v-if="to && !disabled"
      :to="to"
      class="action-btn"
      :class="[tone]"
    >
      <Icon :name="icon" />
    </router-link>
    <button
      v-else
      type="button"
      class="action-btn"
      :class="[tone]"
      :disabled="disabled"
      @click="$emit('click', $event)"
    >
      <Icon :name="icon" />
    </button>
  </span>
</template>

<script setup>
import Icon from './Icon.vue';

defineProps({
  icon: { type: String, required: true },
  tip: { type: String, default: '' },
  tone: { type: String, default: '' }, // '', danger, plan, wait
  to: { type: [String, Object], default: '' },
  disabled: { type: Boolean, default: false },
  disabledTip: { type: String, default: '' },
});

defineEmits(['click']);
</script>
