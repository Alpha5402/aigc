<template>
  <scroll-view class="message-list" scroll-y :scroll-into-view="lastMessageId">
    <view
      v-for="message in messages"
      :id="message.id"
      :key="message.id"
      :class="['message-row', message.role === 'user' ? 'message-row-user' : '']"
    >
      <view :class="['message-bubble', message.role === 'user' ? 'message-user' : 'message-assistant']">
        <text>{{ message.content }}</text>
        <AssistantActionCard
          v-if="message.action"
          :action="message.action"
          @execute="$emit('execute', $event)"
        />
      </view>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AssistantActionCard from './AssistantActionCard.vue'
import type { AssistantAction, AssistantMessage } from '../../types/assistant'

const props = defineProps<{
  messages: AssistantMessage[]
}>()

defineEmits<{
  (event: 'execute', action: AssistantAction): void
}>()

const lastMessageId = computed(() => props.messages[props.messages.length - 1]?.id || '')
</script>

<style scoped lang="scss">
.message-list {
  height: 46vh;
  padding: 8rpx 4rpx;
  box-sizing: border-box;
}

.message-row {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 16rpx;
}

.message-row-user {
  justify-content: flex-end;
}

.message-bubble {
  max-width: 86%;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  font-size: 25rpx;
  line-height: 1.55;
  word-break: break-word;
}

.message-assistant {
  color: var(--acm-text-primary);
  background: var(--acm-bg-card-soft);
}

.message-user {
  color: var(--acm-text-inverse);
  background: var(--acm-brand-primary);
}
</style>
