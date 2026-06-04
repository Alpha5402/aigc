<template>
  <view :class="['loading-skeleton', `loading-skeleton--${type}`]">
    <view v-for="item in count" :key="item" class="loading-skeleton__item">
      <view class="loading-skeleton__line loading-skeleton__line--title"></view>
      <view class="loading-skeleton__line"></view>
      <view class="loading-skeleton__line loading-skeleton__line--short"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: 'card' | 'list' | 'form' | 'detail'
    count?: number
  }>(),
  {
    type: 'card',
    count: 3,
  },
)
</script>

<style scoped lang="scss">
.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--acm-space-card-gap);
}

.loading-skeleton__item {
  border: 2rpx solid var(--acm-border-soft);
  border-radius: var(--acm-radius-card);
  background: var(--acm-bg-card);
  padding: var(--acm-space-card);
}

.loading-skeleton__line {
  height: 24rpx;
  border-radius: var(--acm-radius-pill);
  background: linear-gradient(90deg, var(--acm-bg-card-soft), var(--acm-neutral-soft), var(--acm-bg-card-soft));
  background-size: 240% 100%;
  animation: acm-skeleton 1.6s ease-in-out infinite;
  margin-top: 18rpx;
}

.loading-skeleton__line--title {
  width: 44%;
  height: 32rpx;
  margin-top: 0;
}

.loading-skeleton__line--short {
  width: 62%;
}

@keyframes acm-skeleton {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}
</style>
