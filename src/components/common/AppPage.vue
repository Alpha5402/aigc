<template>
  <view :class="['app-page', hasBottomNav ? 'app-page--with-nav' : '', compact ? 'app-page--compact' : '']">
    <scroll-view v-if="scrollable" class="app-page__scroll" scroll-y :show-scrollbar="false">
      <slot></slot>
      <view class="app-page__bottom-space"></view>
    </scroll-view>
    <view v-else class="app-page__content">
      <slot></slot>
      <view class="app-page__bottom-space"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    scrollable?: boolean
    hasBottomNav?: boolean
    compact?: boolean
  }>(),
  {
    scrollable: true,
    hasBottomNav: false,
    compact: false,
  },
)
</script>

<style scoped lang="scss">
.app-page {
  min-height: 100vh;
  height: 100vh;
  background: var(--acm-bg-app);
  color: var(--acm-text-primary);
  display: flex;
  flex-direction: column;
}

.app-page__scroll,
.app-page__content {
  flex: 1;
  height: 100%;
  box-sizing: border-box;
}

.app-page__scroll {
  padding: 0 var(--acm-space-page-x);
}

.app-page--compact .app-page__scroll {
  padding-left: 0;
  padding-right: 0;
}

.app-page__bottom-space {
  height: calc(48rpx + constant(safe-area-inset-bottom));
  height: calc(48rpx + env(safe-area-inset-bottom));
}

.app-page--with-nav .app-page__bottom-space {
  height: calc(var(--acm-space-bottom-nav) + constant(safe-area-inset-bottom));
  height: calc(var(--acm-space-bottom-nav) + env(safe-area-inset-bottom));
}
</style>
