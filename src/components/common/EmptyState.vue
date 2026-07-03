<template>
  <view class="empty-state">
    <view class="empty-state__icon-wrap">
      <SvgIcon v-if="iconName" :name="iconName" :size="34" color="var(--acm-brand-primary)" />
      <text v-else class="empty-state__icon">{{ icon }}</text>
    </view>
    <text class="empty-state__title">{{ title }}</text>
    <text class="empty-state__description">{{ description }}</text>
    <AppButton v-if="actionText" class="empty-state__action" :text="actionText" icon="plus" @click="emit('action')" />
  </view>
</template>

<script setup lang="ts">
import SvgIcon from '../SvgIcon.vue'
import AppButton from './AppButton.vue'

interface Props {
  iconName?: string
  icon?: string
  title?: string
  description?: string
  actionText?: string
}

withDefaults(defineProps<Props>(), {
  iconName: 'inbox',
  icon: '空',
  title: '暂无数据',
  description: '当前没有可展示的数据',
  actionText: '',
})

const emit = defineEmits<{
  action: []
}>()
</script>

<style scoped lang="scss">
.empty-state {
  width: 100%;
  border: 2rpx solid var(--acm-border-soft);
  border-radius: var(--acm-radius-card);
  background: var(--acm-bg-card);
  box-shadow: var(--acm-shadow-card);
  padding: 56rpx 36rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.empty-state__icon-wrap {
  width: 92rpx;
  height: 92rpx;
  border-radius: 28rpx;
  background: var(--acm-brand-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
}

.empty-state__icon {
  font-size: 56rpx;
  color: var(--acm-brand-primary);
}

.empty-state__title {
  display: block;
  font-size: var(--acm-font-card-title);
  font-weight: 800;
  color: var(--acm-text-primary);
  margin-bottom: 8rpx;
}

.empty-state__description {
  display: block;
  max-width: 520rpx;
  font-size: var(--acm-font-caption);
  color: var(--acm-text-secondary);
  line-height: 1.55;
}

.empty-state__action {
  margin-top: 28rpx;
}
</style>
