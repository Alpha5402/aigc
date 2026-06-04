<template>
  <view class="assistant-float">
    <button v-if="!open" class="float-btn" @click="open = true">
      <SvgIcon class="float-btn__icon" name="mic" :size="24" color="var(--acm-brand-primary-dark)" :stroke-width="2.35" />
    </button>
    <view v-if="open" class="assistant-mask" @click="open = false"></view>
    <view v-if="open" class="assistant-sheet">
      <AssistantPanel :current-page="currentPage" @close="open = false" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SvgIcon from '../SvgIcon.vue'
import AssistantPanel from './AssistantPanel.vue'

defineProps<{
  currentPage?: string
}>()

const open = ref(false)
</script>

<style scoped lang="scss">
.assistant-float {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1000;
}

.float-btn {
  position: fixed;
  right: 26rpx;
  bottom: calc(218rpx + env(safe-area-inset-bottom));
  width: 96rpx;
  height: 96rpx;
  min-width: 96rpx;
  padding: 0;
  border: 1rpx solid rgba(200, 222, 197, 0.86);
  border-radius: 999rpx;
  background: rgba(255, 254, 249, 0.9);
  color: var(--acm-brand-primary-dark);
  box-shadow: 0 12rpx 28rpx rgba(37, 84, 58, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  opacity: 0.96;
}

.float-btn__icon {
  width: 44rpx;
  height: 44rpx;
  flex: 0 0 44rpx;
}

.float-btn__icon :deep(svg) {
  width: 44rpx;
  height: 44rpx;
}

.assistant-mask {
  position: fixed;
  inset: 0;
  background: rgba(33, 53, 40, 0.28);
  pointer-events: auto;
}

.assistant-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 24rpx calc(18rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  pointer-events: auto;
}
</style>
