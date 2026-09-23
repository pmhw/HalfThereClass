<template>
  <article class="course-card card" @click="emit('tap', course)">
    <div v-if="course.cover" class="cover">
      <img :src="assetUrl(course.cover)" alt="" />
    </div>
    <div v-else class="cover placeholder">{{ initial }}</div>
    <div class="info">
      <div class="title">{{ course.title }}</div>
      <div class="meta">{{ course.gradeLabel || '不限年级' }}<template v-if="course.classroom"> · {{ course.classroom }}</template></div>
      <div v-if="course.school" class="meta">{{ course.school }}</div>
      <div class="tags">
        <span v-if="course.category?.name" class="tag">{{ course.category.name }}</span>
        <span v-if="!course.teacherId" class="tag blue">可抢课</span>
        <span v-else class="tag">已排课</span>
      </div>
      <div class="bottom">
        <span v-if="course.startTime" class="time">{{ week }} {{ course.startTime }}</span>
        <span v-if="course.canGrab" class="grab">去抢课</span>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import { assetUrl } from '../store';
import { weekdayText } from '../utils/helpers';

const props = defineProps({
  course: { type: Object, required: true },
});
const emit = defineEmits(['tap']);

const initial = computed(() => (props.course.title || '课').slice(0, 1));
const week = computed(() => weekdayText(props.course.weekday));
</script>

<style scoped>
.course-card {
  display: flex;
  gap: calc(20 * var(--r));
  padding: calc(20 * var(--r));
  margin-bottom: calc(16 * var(--r));
}
.cover {
  width: calc(160 * var(--r));
  height: calc(160 * var(--r));
  border-radius: calc(12 * var(--r));
  overflow: hidden;
  flex-shrink: 0;
}
.cover img { width: 100%; height: 100%; object-fit: cover; }
.cover.placeholder {
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #9ec0ff, #2563eb);
  color: #fff;
  font-size: calc(48 * var(--r));
  font-weight: 700;
}
.info { flex: 1; min-width: 0; }
.title {
  font-size: calc(30 * var(--r));
  font-weight: 650;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta { margin-top: calc(6 * var(--r)); color: #98a2b3; font-size: calc(24 * var(--r)); }
.tags { margin-top: calc(10 * var(--r)); display: flex; flex-wrap: wrap; gap: calc(8 * var(--r)); }
.tag {
  padding: 0 calc(12 * var(--r));
  height: calc(36 * var(--r));
  line-height: calc(36 * var(--r));
  border-radius: calc(8 * var(--r));
  background: #f3f5f8;
  color: #667085;
  font-size: calc(22 * var(--r));
}
.tag.blue { background: #e8f0ff; color: #2563eb; }
.bottom {
  margin-top: calc(12 * var(--r));
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.time { color: #98a2b3; font-size: calc(24 * var(--r)); }
.grab { color: #2563eb; font-weight: 600; font-size: calc(26 * var(--r)); }
</style>
