<template>
  <view :class="['app-card', `app-card--${variant}`, clickable ? 'app-card--clickable acm-touchable' : '']" @click="emit('click')">
    <view v-if="title || subtitle || $slots.action" class="app-card__head">
      <view class="app-card__title-wrap">
        <text v-if="title" class="app-card__title">{{ title }}</text>
        <text v-if="subtitle" class="app-card__subtitle">{{ subtitle }}</text>
      </view>
      <view v-if="$slots.action" class="app-card__action">
        <slot name="action"></slot>
      </view>
    </view>
    <slot></slot>
    <view v-if="$slots.footer" class="app-card__footer">
      <slot name="footer"></slot>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    variant?: 'plain' | 'soft' | 'featured' | 'data' | 'harvest'
    clickable?: boolean
  }>(),
  {
    title: '',
    subtitle: '',
    variant: 'plain',
    clickable: false,
  },
)

const emit = defineEmits<{
  click: []
}>()
</script>

<style scoped lang="scss">
.app-card {
  border: 2rpx solid var(--acm-border-soft);
  border-radius: var(--acm-radius-card);
  background: var(--acm-bg-card);
  box-shadow: var(--acm-shadow-card);
  padding: var(--acm-space-card);
  box-sizing: border-box;
}

.app-card--soft {
  background: var(--acm-bg-card-soft);
}

.app-card--featured {
  background: linear-gradient(180deg, var(--acm-bg-card) 0%, var(--acm-brand-primary-soft) 100%);
  border-color: var(--acm-border-green);
}

.app-card--data {
  background: var(--acm-info-soft);
  border-color: var(--acm-border-info);
}

.app-card--harvest {
  background: var(--acm-harvest-gold-soft);
  border-color: var(--acm-border-warning);
}

.app-card--clickable {
  cursor: pointer;
}

.app-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 22rpx;
}

.app-card__title-wrap {
  min-width: 0;
}

.app-card__title {
  display: block;
  color: var(--acm-text-primary);
  font-size: var(--acm-font-card-title);
  font-weight: 800;
  line-height: 1.25;
}

.app-card__subtitle {
  display: block;
  margin-top: 8rpx;
  color: var(--acm-text-secondary);
  font-size: var(--acm-font-caption);
  line-height: 1.45;
}

.app-card__action {
  flex-shrink: 0;
}

.app-card__footer {
  margin-top: 22rpx;
}
</style>
