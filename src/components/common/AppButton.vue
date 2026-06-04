<template>
  <button
    :class="['app-button', `app-button--${variant}`, block ? 'app-button--block' : '', size === 'sm' ? 'app-button--sm' : '']"
    :disabled="disabled || loading"
    @click="emit('click')"
  >
    <SvgIcon v-if="icon && !loading" :name="icon" :size="iconSize" color="currentColor" />
    <view v-if="loading" class="app-button__spinner"></view>
    <text>{{ loading ? loadingText : text }}</text>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SvgIcon from '../SvgIcon.vue'

const props = withDefaults(
  defineProps<{
    text: string
    variant?: 'primary' | 'secondary' | 'text' | 'danger' | 'harvest'
    icon?: string
    loading?: boolean
    disabled?: boolean
    block?: boolean
    size?: 'md' | 'sm'
    loadingText?: string
  }>(),
  {
    variant: 'primary',
    icon: '',
    loading: false,
    disabled: false,
    block: false,
    size: 'md',
    loadingText: '处理中',
  },
)

const emit = defineEmits<{
  click: []
}>()

const iconSize = computed(() => (props.size === 'sm' ? 14 : 16))
</script>

<style scoped lang="scss">
.app-button {
  min-width: 0;
  min-height: 88rpx;
  border: 0;
  border-radius: var(--acm-radius-input);
  padding: 0 28rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  font-size: var(--acm-font-button);
  font-weight: 800;
  line-height: 1;
  box-sizing: border-box;
  transition: transform var(--acm-motion-fast) var(--acm-motion-ease), opacity var(--acm-motion-fast) var(--acm-motion-ease);
}

.app-button:active {
  transform: scale(0.98);
  opacity: 0.92;
}

.app-button[disabled] {
  opacity: 0.58;
}

.app-button--block {
  width: 100%;
}

.app-button--sm {
  min-height: 64rpx;
  border-radius: 16rpx;
  padding: 0 20rpx;
  font-size: 24rpx;
}

.app-button--primary {
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
  box-shadow: 0 8rpx 18rpx rgba(54, 125, 73, 0.18);
}

.app-button--secondary {
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary-dark);
}

.app-button--text {
  min-height: 56rpx;
  background: transparent;
  color: var(--acm-brand-primary);
  padding: 0 8rpx;
}

.app-button--danger {
  background: var(--acm-danger);
  color: var(--acm-text-inverse);
}

.app-button--harvest {
  background: var(--acm-fruit-orange);
  color: var(--acm-text-inverse);
}

.app-button__spinner {
  width: 24rpx;
  height: 24rpx;
  border-radius: 999rpx;
  border: 3rpx solid currentColor;
  border-right-color: transparent;
  animation: acm-button-spin 0.9s linear infinite;
}

@keyframes acm-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
