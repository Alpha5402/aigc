<template>
  <view class="acm-bottom-nav">
    <view class="acm-bottom-nav__inner">
      <view
        v-for="item in leftItems"
        :key="item.path"
        class="acm-bottom-nav__item"
        @click="switchPage(item.path)"
      >
        <SvgIcon :name="item.icon" :size="20" :color="isActive(item.path) ? activeColor : normalColor" />
        <text :class="['acm-bottom-nav__label', isActive(item.path) ? 'acm-bottom-nav__label-active' : '']">{{ item.label }}</text>
      </view>

      <view class="acm-bottom-nav__item acm-bottom-nav__item-center" @click="switchPage(centerItem.path)">
        <view class="acm-bottom-nav__center-btn">
          <SvgIcon name="camera" :size="25" color="var(--acm-text-inverse)" :stroke-width="2.45" />
        </view>
        <text :class="['acm-bottom-nav__label', isActive(centerItem.path) ? 'acm-bottom-nav__label-active' : '']">{{ centerItem.label }}</text>
      </view>

      <view
        v-for="item in rightItems"
        :key="item.path"
        class="acm-bottom-nav__item"
        @click="switchPage(item.path)"
      >
        <SvgIcon :name="item.icon" :size="20" :color="isActive(item.path) ? activeColor : normalColor" />
        <text :class="['acm-bottom-nav__label', isActive(item.path) ? 'acm-bottom-nav__label-active' : '']">{{ item.label }}</text>
      </view>
    </view>
    <view class="acm-bottom-nav__safe"></view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SvgIcon from '../SvgIcon.vue'

interface NavItem {
  path: string
  label: string
  icon: string
}

const activeColor = 'var(--acm-brand-primary)'
const normalColor = 'var(--acm-text-secondary)'

const leftItems: NavItem[] = [
  { path: '/pages/my-field/index', label: '我的地', icon: 'sprout' },
  { path: '/pages/market/index', label: '查行情', icon: 'trending-up' },
]

const centerItem: NavItem = { path: '/pages/ai-consult/index', label: '问诊', icon: 'camera' }

const rightItems: NavItem[] = [
  { path: '/pages/buyer/index', label: '销路匹配', icon: 'users' },
  { path: '/pages/ads/index', label: '营销助手', icon: 'megaphone' },
]

const currentPath = ref('')

const refreshCurrentPath = () => {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  currentPath.value = current?.route ? `/${current.route}` : '/pages/my-field/index'
}

onShow(() => {
  refreshCurrentPath()
})

const isActive = (path: string) => currentPath.value === path

const switchPage = (path: string) => {
  if (isActive(path)) return
  uni.redirectTo({
    url: path,
    fail: () => {
      uni.reLaunch({ url: path })
    },
  })
}
</script>

<style scoped lang="scss">
.acm-bottom-nav {
  position: fixed;
  left: 20rpx;
  right: 20rpx;
  bottom: calc(12rpx + constant(safe-area-inset-bottom));
  bottom: calc(12rpx + env(safe-area-inset-bottom));
  border: 2rpx solid rgba(229, 223, 208, 0.82);
  border-radius: 30rpx;
  background: rgba(255, 254, 249, 0.94);
  box-shadow: 0 -4rpx 18rpx rgba(64, 84, 62, 0.045), 0 12rpx 32rpx rgba(64, 84, 62, 0.1);
  overflow: visible;
  z-index: 999;
}

.acm-bottom-nav__inner {
  height: 98rpx;
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  padding: 7rpx 8rpx 8rpx;
  box-sizing: border-box;
}

.acm-bottom-nav__item {
  flex: 1;
  height: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6rpx;
  padding-bottom: 5rpx;
  border-radius: 22rpx;
}

.acm-bottom-nav__item-center {
  margin-top: -22rpx;
  padding-bottom: 0;
}

.acm-bottom-nav__center-btn {
  width: 94rpx;
  height: 94rpx;
  border: 5rpx solid var(--acm-bg-card);
  border-radius: 30rpx;
  background: linear-gradient(145deg, var(--acm-brand-primary-dark), var(--acm-brand-primary) 72%, var(--acm-crop-leaf));
  box-shadow: 0 13rpx 30rpx rgba(54, 125, 73, 0.19);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6rpx;
}

.acm-bottom-nav__label {
  font-size: 19rpx;
  color: var(--acm-text-secondary);
  line-height: 1.1;
  margin-bottom: 0;
}

.acm-bottom-nav__label-active {
  color: var(--acm-brand-primary-dark);
  font-weight: 800;
}

.acm-bottom-nav__item-center .acm-bottom-nav__label {
  margin-bottom: 6rpx;
}

.acm-bottom-nav__safe {
  display: none;
}
</style>
