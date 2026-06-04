<template>
  <view class="image-fallback">
    <image
      v-if="!hasTerminalError"
      class="image-fallback__inner"
      :src="currentSrc"
      :mode="mode"
      @error="onError"
    />
    <view v-else class="image-fallback__placeholder">
      <text class="image-fallback__text">图片加载失败</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  src?: string
  fallbackSrc?: string
  mode?: string
}

const props = withDefaults(defineProps<Props>(), {
  src: '',
  fallbackSrc: '/static/images/placeholder.png',
  mode: 'aspectFill',
})

const currentSrc = ref('')
const didFallback = ref(false)
const hasTerminalError = ref(false)

watch(
  () => props.src,
  (value) => {
    currentSrc.value = value || props.fallbackSrc
    didFallback.value = false
    hasTerminalError.value = false
  },
  { immediate: true },
)

const onError = () => {
  if (!didFallback.value && currentSrc.value !== props.fallbackSrc) {
    currentSrc.value = props.fallbackSrc
    didFallback.value = true
    return
  }

  hasTerminalError.value = true
}
</script>

<style scoped lang="scss">
.image-fallback {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.image-fallback__inner {
  width: 100%;
  height: 100%;
}

.image-fallback__placeholder {
  width: 100%;
  height: 100%;
  background: var(--acm-bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-fallback__text {
  font-size: 24rpx;
  color: var(--acm-text-muted);
}
</style>
