<template>
  <div v-if="open" class="modal-mask">
    <div class="modal narrow" role="dialog">
      <header>
        <h3>{{ title }}</h3>
        <button class="modal-close" type="button" @click="$emit('cancel')">×</button>
      </header>
      <p class="confirm-text">{{ message }}</p>
      <div class="form-actions" style="padding: 0 20px 20px">
        <button class="btn" type="button" @click="$emit('cancel')">取消</button>
        <button class="btn danger-fill" type="button" @click="$emit('ok')">删除</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  open: Boolean,
  title: { type: String, default: '确认删除' },
  message: { type: String, default: '' },
});
defineEmits(['cancel', 'ok']);
</script>
