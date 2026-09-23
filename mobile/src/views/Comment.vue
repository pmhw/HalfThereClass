<template>
  <div class="page safe-bottom">
    <header class="nav">
      <button type="button" class="back" @click="router.back()">‹ 返回</button>
      <span>课程评价</span>
    </header>
    <div class="stars">
      <button
        v-for="n in 5"
        :key="n"
        type="button"
        class="star"
        :class="{ on: n <= rating }"
        @click="rating = n"
      >
        ★
      </button>
    </div>
    <textarea v-model="content" class="area" placeholder="分享你的上课体验（选填）" maxlength="500" />
    <label class="anon">
      <input v-model="isAnonymous" type="checkbox" />
      <span>匿名评价</span>
    </label>
    <button class="btn btn-primary btn-block" type="button" :disabled="submitting" @click="submit">
      {{ submitting ? '提交中…' : '提交评价' }}
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { postComment } from '../api';
import { showToast } from '../api/request';
import { requireLogin } from '../utils/helpers';

const route = useRoute();
const router = useRouter();
const courseId = Number(route.query.courseId);

const rating = ref(5);
const content = ref('');
const isAnonymous = ref(false);
const submitting = ref(false);

if (!requireLogin(router)) {
  /* redirected */
}

async function submit() {
  if (!courseId) {
    showToast('缺少课程信息');
    return;
  }
  if (rating.value === 0) {
    showToast('请选择评分');
    return;
  }
  submitting.value = true;
  try {
    await postComment({
      courseId,
      rating: rating.value,
      content: content.value,
      images: [],
      isAnonymous: isAnonymous.value,
    });
    showToast('评价成功');
    setTimeout(() => router.back(), 800);
  } catch (err) {
    showToast(err.message || '提交失败');
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding: calc(24 * var(--r)); background: var(--bg-color); }
.nav { display: flex; align-items: center; gap: calc(16 * var(--r)); margin-bottom: calc(32 * var(--r)); font-weight: 650; }
.back { color: #2563eb; }
.stars { display: flex; gap: calc(12 * var(--r)); margin-bottom: calc(24 * var(--r)); }
.star { font-size: calc(56 * var(--r)); color: #d0d5dd; }
.star.on { color: #fbbf24; }
.area {
  width: 100%;
  min-height: calc(240 * var(--r));
  padding: calc(20 * var(--r));
  border: 1px solid #e7edf5;
  border-radius: calc(16 * var(--r));
  background: #fff;
  margin-bottom: calc(20 * var(--r));
  resize: vertical;
}
.anon { display: flex; gap: calc(12 * var(--r)); align-items: center; margin-bottom: calc(32 * var(--r)); color: #667085; }
</style>
