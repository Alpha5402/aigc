<template>
  <view class="assistant-panel">
    <view class="panel-head">
      <view>
        <text class="panel-title">智能语音助手</text>
        <text class="panel-subtitle">辅助填表和快捷操作，保存前仍由你确认</text>
      </view>
      <button class="close-btn" @click="$emit('close')">
        <text>×</text>
      </button>
    </view>

    <AssistantMessageList :messages="messages" @execute="runAction" />

    <view class="quick-row">
      <button v-for="item in quickCommands" :key="item" class="quick-btn" @click="useQuick(item)">
        {{ item }}
      </button>
    </view>

    <view class="input-row">
      <button :class="['voice-btn', listening ? 'voice-btn-active' : '']" :disabled="listening" @click="startVoice">
        {{ listening ? '听' : '语音' }}
      </button>
      <input
        class="assistant-input"
        v-model="inputText"
        confirm-type="send"
        placeholder="例如：帮我添加橘子 3 亩，3 月 15 号种"
        @confirm="submit"
      />
      <button class="send-btn" :disabled="loading" @click="submit">
        {{ loading ? '...' : '发送' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AssistantMessageList from './AssistantMessageList.vue'
import { useAssistant } from '../../composables/useAssistant'
import { useAssistantSpeech } from '../../composables/useAssistantSpeech'

const props = defineProps<{
  currentPage?: string
}>()

defineEmits<{
  (event: 'close'): void
}>()

const inputText = ref('')
const quickCommands = ['添加橘子 3 亩', '苹果现在适合卖吗', '帮我找收苹果的老板', '生成苹果广告']
const { messages, loading, sendMessage, runAction } = useAssistant(props.currentPage)
const { listening, listenOnce } = useAssistantSpeech()

const submit = async () => {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''
  await sendMessage(text)
}

const useQuick = (text: string) => {
  inputText.value = text
}

const startVoice = async () => {
  const result = await listenOnce()
  if (!result) return
  inputText.value = result
  inputText.value = ''
  await sendMessage(result)
}
</script>

<style scoped lang="scss">
.assistant-panel {
  width: 100%;
  max-height: 74vh;
  padding: 32rpx;
  border-radius: var(--acm-radius-sheet) var(--acm-radius-sheet) 28rpx 28rpx;
  background: var(--acm-bg-elevated);
  border: 2rpx solid var(--acm-border-soft);
  box-shadow: var(--acm-shadow-elevated);
  box-sizing: border-box;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 12rpx;
}

.panel-head > view {
  min-width: 0;
  flex: 1;
}

.panel-title,
.panel-subtitle {
  display: block;
}

.panel-title {
  font-size: 30rpx;
  font-weight: 800;
  color: var(--acm-text-primary);
}

.panel-subtitle {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--acm-text-secondary);
}

.close-btn {
  flex: 0 0 auto;
  margin-left: auto;
  margin-right: 4rpx;
  transform: translateX(8rpx);
  position: relative;
  z-index: 3;
  width: 56rpx;
  height: 56rpx;
  border: 0;
  border-radius: 999rpx;
  background: var(--acm-neutral-soft);
  color: var(--acm-text-secondary);
  font-size: 34rpx;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.close-btn::after {
  border: 0;
}

.close-btn text {
  display: block;
  line-height: 1;
  transform: translateY(-1rpx);
}

.quick-row {
  display: flex;
  gap: 10rpx;
  overflow-x: auto;
  padding: 8rpx 2rpx 16rpx;
  white-space: nowrap;
  box-sizing: border-box;
}

.quick-btn {
  flex: 0 0 auto;
  height: 62rpx;
  padding: 0 22rpx;
  border: 1rpx solid rgba(54, 125, 73, 0.16);
  border-radius: 999rpx;
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.96), #ecfdf5);
  color: var(--acm-brand-primary);
  font-size: 24rpx;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  box-shadow: 0 4rpx 10rpx rgba(31, 42, 35, 0.04);
}

.quick-btn::after {
  border: 0;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding-top: 16rpx;
  border-top: 2rpx solid var(--acm-border-soft);
}

.voice-btn,
.send-btn {
  height: 76rpx;
  border: 0;
  border-radius: 999rpx;
  font-size: 25rpx;
  font-weight: 800;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.voice-btn {
  width: 96rpx;
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary);
}

.voice-btn-active {
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
}

.assistant-input {
  flex: 1;
  height: 76rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: var(--acm-bg-card-soft);
  font-size: 25rpx;
  box-sizing: border-box;
}

.send-btn {
  width: 98rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
}
</style>
