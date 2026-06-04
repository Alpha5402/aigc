<template>
  <view :class="['app-header', transparent ? 'app-header--transparent' : '', elevated ? 'app-header--elevated' : '']">
    <button v-if="showBack" class="app-header__back acm-touchable" @click="goBack">
      <SvgIcon name="chevron-left" :size="20" color="var(--acm-brand-primary-dark)" />
    </button>
    <view class="app-header__main">
      <text class="app-header__title">{{ title }}</text>
      <text v-if="subtitle" class="app-header__subtitle">{{ subtitle }}</text>
    </view>
    <view v-if="$slots.action" class="app-header__action">
      <slot name="action"></slot>
    </view>
  </view>
</template>

<script setup lang="ts">
import SvgIcon from '../SvgIcon.vue'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    showBack?: boolean
    transparent?: boolean
    elevated?: boolean
  }>(),
  {
    subtitle: '',
    showBack: false,
    transparent: false,
    elevated: false,
  },
)

const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.redirectTo({ url: '/pages/my-field/index' })
  }
}
</script>

<style scoped lang="scss">
.app-header {
  min-height: 112rpx;
  padding: calc(28rpx + constant(safe-area-inset-top)) 0 24rpx;
  padding: calc(28rpx + env(safe-area-inset-top)) 0 24rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
  background: var(--acm-bg-app);
}

.app-header--transparent {
  background: transparent;
}

.app-header--elevated {
  border-bottom: 2rpx solid var(--acm-border-soft);
  box-shadow: var(--acm-shadow-card);
}

.app-header__back {
  width: 72rpx;
  height: 72rpx;
  border: 0;
  border-radius: var(--acm-radius-pill);
  background: var(--acm-bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-header__main {
  min-width: 0;
  flex: 1;
}

.app-header__title {
  display: block;
  color: var(--acm-text-primary);
  font-size: var(--acm-font-page-title);
  font-weight: 800;
  line-height: 1.15;
}

.app-header__subtitle {
  display: block;
  margin-top: 8rpx;
  color: var(--acm-text-secondary);
  font-size: var(--acm-font-page-subtitle);
  line-height: 1.45;
}

.app-header__action {
  flex-shrink: 0;
}
</style>
