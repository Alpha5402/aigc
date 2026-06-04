<template>
  <view class="section-header">
    <view class="section-header__main">
      <view class="section-header__title-row">
        <SvgIcon v-if="icon" :name="icon" :size="18" :color="iconColor" />
        <text class="section-header__title">{{ title }}</text>
      </view>
      <text v-if="description" class="section-header__desc">{{ description }}</text>
    </view>
    <button v-if="actionText" class="section-header__action acm-touchable" @click="emit('action')">
      {{ actionText }}
    </button>
  </view>
</template>

<script setup lang="ts">
import SvgIcon from '../SvgIcon.vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    actionText?: string
    icon?: string
    iconColor?: string
  }>(),
  {
    description: '',
    actionText: '',
    icon: '',
    iconColor: 'var(--acm-brand-primary)',
  },
)

const emit = defineEmits<{
  action: []
}>()
</script>

<style scoped lang="scss">
.section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20rpx;
  margin: 0 0 18rpx;
}

.section-header__main {
  min-width: 0;
}

.section-header__title-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.section-header__title {
  color: var(--acm-text-primary);
  font-size: var(--acm-font-section-title);
  font-weight: 800;
  line-height: 1.25;
}

.section-header__desc {
  display: block;
  margin-top: 8rpx;
  color: var(--acm-text-secondary);
  font-size: var(--acm-font-caption);
  line-height: 1.45;
}

.section-header__action {
  flex-shrink: 0;
  border: 0;
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary-dark);
  font-size: 26rpx;
  font-weight: 700;
  padding: 0 18rpx;
  margin: 0;
  min-height: 52rpx;
  border-radius: 999rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-sizing: border-box;
}

.section-header__action::after {
  border: 0;
}
</style>
