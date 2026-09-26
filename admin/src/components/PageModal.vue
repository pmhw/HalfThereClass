<template>
  <Teleport to="body">
    <Transition name="page-modal">
      <div
        v-if="open"
        class="page-modal-mask"
        role="presentation"
        @mousedown.self="onBackdrop"
      >
        <div
          class="page-modal"
          :class="[sizeClass, panelClass]"
          role="dialog"
          aria-modal="true"
          :aria-label="title || '对话框'"
          @keydown.esc.prevent="close"
        >
          <header v-if="showHeader" class="page-modal-head">
            <div class="page-modal-titles">
              <slot name="title">
                <div v-if="icon || title || desc" class="page-modal-title-row">
                  <span v-if="icon" class="page-modal-icon"><Icon :name="icon" /></span>
                  <div>
                    <h3 v-if="title">{{ title }}</h3>
                    <p v-if="desc">{{ desc }}</p>
                  </div>
                </div>
              </slot>
            </div>
            <button
              v-if="closable"
              class="modal-close"
              type="button"
              aria-label="关闭"
              @click="close"
            >×</button>
          </header>
          <div class="page-modal-body" :class="{ padded: bodyPad }">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="page-modal-foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, watch } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
  icon: { type: String, default: '' },
  /** narrow | default | wide | plan */
  size: { type: String, default: 'default' },
  panelClass: { type: String, default: '' },
  closable: { type: Boolean, default: true },
  closeOnBackdrop: { type: Boolean, default: true },
  bodyPad: { type: Boolean, default: true },
  showHeader: { type: Boolean, default: true },
});

const emit = defineEmits(['close', 'update:open']);

const sizeClass = computed(() => {
  if (props.size === 'narrow') return 'is-narrow';
  if (props.size === 'wide' || props.size === 'course') return 'is-wide';
  if (props.size === 'plan') return 'is-plan';
  return 'is-default';
});

function close() {
  if (!props.closable) return;
  emit('update:open', false);
  emit('close');
}

function onBackdrop() {
  if (props.closeOnBackdrop) close();
}

let locked = false;
function lockScroll(on) {
  if (typeof document === 'undefined') return;
  if (on && !locked) {
    document.documentElement.classList.add('page-modal-open');
    locked = true;
  } else if (!on && locked) {
    document.documentElement.classList.remove('page-modal-open');
    locked = false;
  }
}

watch(() => props.open, (v) => lockScroll(!!v), { immediate: true });
onBeforeUnmount(() => lockScroll(false));
</script>
