<template>
  <PageModal
    :open="open"
    size="narrow"
    :title="title"
    icon="trash"
    @close="$emit('cancel')"
  >
    <p class="confirm-text">{{ message }}</p>
    <template #footer>
      <button class="btn" type="button" @click="$emit('cancel')">取消</button>
      <button class="btn danger-fill" type="button" @click="$emit('ok')">{{ okText }}</button>
    </template>
  </PageModal>
</template>

<script setup>
import PageModal from './PageModal.vue';

defineProps({
  open: Boolean,
  title: { type: String, default: '确认删除' },
  message: { type: String, default: '' },
  okText: { type: String, default: '删除' },
});
defineEmits(['cancel', 'ok']);
</script>

<style scoped>
.confirm-text {
  margin: 4px 0 8px;
  color: #344054;
  font-size: 14px;
  line-height: 1.6;
}
</style>
