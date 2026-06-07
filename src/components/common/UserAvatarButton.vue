<template>
  <button class="user-avatar-button acm-touchable" @click="goProfile">
    <view class="user-avatar-button__avatar">
      <image class="user-avatar-button__image" :src="avatarSrc" mode="aspectFill" />
    </view>
    <!-- <view class="user-avatar-button__badge">
      <SvgIcon name="user" :size="13" color="var(--acm-brand-primary-dark)" />
    </view> -->
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SvgIcon from '../SvgIcon.vue'
import { useAuthStore } from '../../stores/auth'

const authStore = useAuthStore()

const DEFAULT_AVATAR = '/static/images/profile/default-farmer-avatar.svg'

const avatarSrc = computed(() => String(authStore.userInfo?.avatar || DEFAULT_AVATAR).trim())

const goProfile = () => {
  uni.navigateTo({ url: '/pages/profile/index' })
}
</script>

<style scoped lang="scss">
.user-avatar-button {
  position: relative;
  width: 72rpx;
  height: 72rpx;
  flex: 0 0 72rpx;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  box-sizing: border-box;
}

.user-avatar-button::after {
  border: 0;
}

.user-avatar-button__avatar {
  width: 72rpx;
  height: 72rpx;
  flex: 0 0 72rpx;
  border-radius: 50%;
  background: transparent;
  overflow: hidden;
}

.user-avatar-button__image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: block;
}

.user-avatar-button__badge {
  position: absolute;
  right: -4rpx;
  bottom: -4rpx;
  width: 26rpx;
  height: 26rpx;
  border: 2rpx solid rgba(255, 254, 247, 0.96);
  border-radius: 50%;
  background: rgba(255, 254, 249, 0.96);
  box-shadow: 0 4rpx 10rpx rgba(37, 84, 58, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

// .user-avatar-button__image {
//   width: 100%;
//   height: 100%;
//   border-radius: 50%;
//   display: block;
// }

</style>
