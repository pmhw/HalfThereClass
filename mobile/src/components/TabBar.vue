<template>
  <div class="bar">
    <div class="shell">
      <div class="shine"></div>
      <div class="pill" :style="{ left: pillLeft, width: pillWidth }"></div>
      <button
        v-for="(item, index) in list"
        :key="item.text"
        type="button"
        class="item"
        :class="{ on: index === selected }"
        @click="go(index)"
      >
        <img class="icon" :src="index === selected ? item.iconActive : item.icon" alt="" />
        <span class="label-box">
          <span class="label reflect">{{ item.text }}</span>
          <span class="label">{{ item.text }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({
  selected: { type: Number, default: 0 },
});

const router = useRouter();
const list = [
  { path: '/', text: '首页', icon: `${import.meta.env.BASE_URL}images/tab-home.png`, iconActive: `${import.meta.env.BASE_URL}images/tab-home-active.png` },
  { path: '/schedule', text: '课表', icon: `${import.meta.env.BASE_URL}images/tab-cal.png`, iconActive: `${import.meta.env.BASE_URL}images/tab-cal-active.png` },
  { path: '/teaching', text: '授课', icon: `${import.meta.env.BASE_URL}images/tab-teach.png`, iconActive: `${import.meta.env.BASE_URL}images/tab-teach-active.png` },
  { path: '/my', text: '我的', icon: `${import.meta.env.BASE_URL}images/tab-my.png`, iconActive: `${import.meta.env.BASE_URL}images/tab-my-active.png` },
];

const count = list.length;
const pillLeft = computed(() => `calc(${(props.selected * 100) / count}% + 3px)`);
const pillWidth = computed(() => `calc(${100 / count}% - 6px)`);

function go(index) {
  const item = list[index];
  if (!item || index === props.selected) return;
  router.push(item.path);
}
</script>

<style scoped>
.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
  box-sizing: border-box;
  padding: calc(16 * var(--r)) calc(28 * var(--r)) calc(16 * var(--r) + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.38);
  border-top: 1px solid rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
}
.shell {
  position: relative;
  width: 100%;
  height: calc(112 * var(--r));
  border-radius: 999px;
  overflow: hidden;
  display: flex;
  background: rgba(255, 255, 255, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.55);
  box-shadow: 0 calc(10 * var(--r)) calc(28 * var(--r)) rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
}
.shine {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 50%;
  border-radius: 999px 999px 0 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6), transparent);
  pointer-events: none;
  z-index: 0;
}
.pill {
  position: absolute;
  top: 50%;
  height: calc(96 * var(--r));
  margin-top: calc(-48 * var(--r));
  border-radius: calc(48 * var(--r));
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.16), rgba(37, 99, 235, 0.08));
  border: 1px solid rgba(37, 99, 235, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
  z-index: 1;
  pointer-events: none;
  transition: left 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.item {
  position: relative;
  z-index: 2;
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.icon {
  width: calc(48 * var(--r));
  height: calc(48 * var(--r));
  margin-bottom: 1px;
  opacity: 0.78;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
}
.item.on .icon {
  transform: scale(1.12) translateY(-1px);
  opacity: 1;
}
.label-box {
  position: relative;
  height: calc(32 * var(--r));
  max-width: 100%;
}
.label {
  display: block;
  font-size: calc(22 * var(--r));
  line-height: 1.2;
  font-weight: 500;
  color: rgba(30, 32, 36, 0.78);
  text-align: center;
  white-space: nowrap;
}
.label.reflect {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(8 * var(--r));
  color: rgba(30, 32, 36, 0.7);
  transform: scaleY(-1);
  opacity: 0.15;
  pointer-events: none;
}
.item.on .label {
  color: #2563eb;
  font-weight: 700;
}
.item.on .label.reflect {
  color: #2563eb;
  opacity: 0.22;
}
</style>
