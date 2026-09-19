<template>
  <div class="pager">
    <span>共 {{ total }} 条</span>
    <div class="actions">
      <button class="btn" :disabled="page <= 1" @click="$emit('change', page - 1)">上一页</button>
      <span>{{ page }} / {{ totalPages || 1 }}</span>
      <button class="btn" :disabled="page >= totalPages" @click="$emit('change', page + 1)">下一页</button>
      <select v-if="sizes.length" class="pager-size" :value="pageSize" @change="$emit('size', Number($event.target.value))">
        <option v-for="size in sizes" :key="size" :value="size">{{ size }} 条/页</option>
      </select>
    </div>
  </div>
</template>

<script setup>
defineProps({
  page: { type: Number, default: 1 },
  totalPages: { type: Number, default: 1 },
  total: { type: Number, default: 0 },
  pageSize: { type: Number, default: 10 },
  sizes: { type: Array, default: () => [] },
});
defineEmits(['change', 'size']);
</script>
