<template>
  <view class="app-layout">
    <scroll-view v-if="scrollable" class="app-layout__scroll" scroll-y>
      <slot></slot>
      <view v-if="safeBottom" class="app-layout__safe-bottom"></view>
    </scroll-view>

    <view v-else class="app-layout__content">
      <slot></slot>
      <view v-if="safeBottom" class="app-layout__safe-bottom"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
interface Props {
  scrollable?: boolean
  safeBottom?: boolean
}

withDefaults(defineProps<Props>(), {
  scrollable: true,
  safeBottom: false,
})
</script>

<style scoped lang="scss">
.app-layout {
  height: 100%;
  width: 100%;
}

.app-layout__scroll {
  height: 100%;
}

.app-layout__content {
  height: 100%;
}

.app-layout__safe-bottom {
  height: 24rpx;
}
</style>
