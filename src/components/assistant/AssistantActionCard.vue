<template>
  <view v-if="action" class="action-card">
    <view class="action-copy">
      <text class="action-title">{{ title }}</text>
      <text class="action-desc">{{ desc }}</text>
    </view>
    <button class="action-btn" @click="$emit('execute', action)">
      {{ action.confirmText || '立即执行' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssistantAction } from '../../types/assistant'

const props = defineProps<{
  action?: AssistantAction
}>()

defineEmits<{
  (event: 'execute', action: AssistantAction): void
}>()

const title = computed(() => {
  if (!props.action) return ''
  if (props.action.type === 'form_fill') return '打开表单并预填'
  if (props.action.type === 'navigate') return '打开相关页面'
  return '继续处理'
})

const desc = computed(() => {
  if (!props.action) return ''
  if (props.action.missingSlots?.length) return `还需要补充：${props.action.missingSlots.join('、')}`
  return props.action.targetPage ? '系统会先跳转页面，涉及保存仍需你手动确认。' : '可以继续输入补充信息。'
})
</script>

<style scoped lang="scss">
.action-card {
  margin-top: 12rpx;
  padding: 16rpx;
  border-radius: 16rpx;
  background: var(--acm-brand-primary-soft);
  border: 2rpx solid var(--acm-border-green);
}

.action-copy {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.action-title {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--acm-text-primary);
}

.action-desc {
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--acm-text-secondary);
}

.action-btn {
  height: 56rpx;
  margin-top: 14rpx;
  border: 0;
  border-radius: 999rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
  font-size: 24rpx;
}
</style>
