<template>
  <view class="profile-page">
    <scroll-view class="profile-scroll" scroll-y :show-scrollbar="false">
      <view class="profile-hero">
        <view class="profile-hero__bg"></view>
        <view class="profile-hero__nav">
          <button class="nav-back acm-touchable" @click="goBack">
            <SvgIcon name="chevron-left" :size="22" color="var(--acm-text-inverse)" />
          </button>
          <text class="profile-hero__title">个人中心</text>
          <view class="nav-spacer"></view>
        </view>

        <view class="profile-card">
          <view class="profile-avatar">
            <image class="profile-avatar__image" :src="avatarSrc" mode="aspectFill" />
          </view>
          <view class="profile-info">
            <text class="profile-name">{{ displayName }}</text>
            <text class="profile-meta">{{ userMeta }}</text>
            <view class="profile-tags">
              <text class="profile-tag">云上农管家用户</text>
              <text class="profile-tag profile-tag--soft">{{ authStore.isLoggedIn ? '已登录' : '未登录' }}</text>
            </view>
          </view>
        </view>

        <view class="profile-stats">
          <view class="profile-stat">
            <text class="profile-stat__value">档案</text>
            <text class="profile-stat__label">作物管理</text>
          </view>
          <view class="profile-stat">
            <text class="profile-stat__value">问诊</text>
            <text class="profile-stat__label">农技记录</text>
          </view>
          <view class="profile-stat">
            <text class="profile-stat__value">行情</text>
            <text class="profile-stat__label">价格关注</text>
          </view>
        </view>
      </view>

      <view class="profile-content">
        <view class="quick-grid">
          <button class="quick-item" @click="handleEditProfile">
            <SvgIcon name="user-pen" :size="22" color="var(--acm-brand-primary)" />
            <text>修改个人信息</text>
          </button>
          <button class="quick-item" @click="handleCertification">
            <SvgIcon name="badge-check" :size="22" color="var(--acm-warning)" />
            <text>上传认证</text>
          </button>
          <button class="quick-item" @click="goNotification">
            <SvgIcon name="bell" :size="22" color="var(--acm-info)" />
            <text>消息通知</text>
          </button>
        </view>

        <view class="section-block">
          <view class="section-head">
            <text class="section-title">我的农服</text>
            <text class="section-desc">围绕种植、问诊、行情和销路沉淀个人记录</text>
          </view>
          <view class="service-list">
            <button
              v-for="item in farmServices"
              :key="item.title"
              class="service-row"
              @click="openService(item)"
            >
              <view class="service-icon">
                <SvgIcon :name="item.icon" :size="20" :color="item.color" />
              </view>
              <view class="service-main">
                <text class="service-title">{{ item.title }}</text>
                <text class="service-desc">{{ item.desc }}</text>
              </view>
              <SvgIcon name="chevron-right" :size="18" color="var(--acm-text-placeholder)" />
            </button>
          </view>
        </view>

        <view class="section-block">
          <view class="section-head">
            <text class="section-title">服务与设置</text>
          </view>
          <view class="service-list">
            <button class="service-row" @click="showPlaceholder('帮助与反馈')">
              <view class="service-icon service-icon--info">
                <SvgIcon name="message-circle-question-mark" :size="20" color="var(--acm-info)" />
              </view>
              <view class="service-main">
                <text class="service-title">帮助与反馈</text>
                <text class="service-desc">提交使用建议或查看常见问题</text>
              </view>
              <SvgIcon name="chevron-right" :size="18" color="var(--acm-text-placeholder)" />
            </button>
            <button class="service-row" @click="showPlaceholder('账号设置')">
              <view class="service-icon service-icon--soil">
                <SvgIcon name="settings" :size="20" color="var(--acm-soil-earth)" />
              </view>
              <view class="service-main">
                <text class="service-title">账号设置</text>
                <text class="service-desc">登录安全、隐私和偏好设置</text>
              </view>
              <SvgIcon name="chevron-right" :size="18" color="var(--acm-text-placeholder)" />
            </button>
          </view>
        </view>

        <button v-if="authStore.isLoggedIn" class="logout-btn" @click="confirmLogout">
          <SvgIcon name="log-out" :size="18" color="var(--acm-danger-text)" />
          <text>退出登录</text>
        </button>
        <button v-else class="login-btn" @click="goLogin">
          <SvgIcon name="log-in" :size="18" color="var(--acm-text-inverse)" />
          <text>去登录</text>
        </button>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { useAuthStore } from '../../stores/auth'

interface ServiceItem {
  title: string
  desc: string
  icon: string
  color: string
  url?: string
}

const authStore = useAuthStore()

const DEFAULT_AVATAR = '/static/images/profile/default-farmer-avatar.svg'

const avatarSrc = computed(() => String(authStore.userInfo?.avatar || DEFAULT_AVATAR).trim())

const displayName = computed(() => {
  const user = authStore.userInfo
  return String(user?.nickname || user?.name || user?.phone || '农管家用户')
})

const userMeta = computed(() => {
  const user = authStore.userInfo
  if (user?.phone) return `账号 ${user.phone}`
  if (user?.id) return `ID ${user.id}`
  return '登录后同步你的作物、行情和销路记录'
})

const farmServices: ServiceItem[] = [
  {
    title: '我的作物档案',
    desc: '查看地块、作物和经营提醒',
    icon: 'sprout',
    color: 'var(--acm-brand-primary)',
    url: '/pages/my-field/index',
  },
  {
    title: '我的问诊记录',
    desc: '进入农技问诊工具查看历史结果',
    icon: 'stethoscope',
    color: 'var(--acm-crop-leaf)',
    url: '/pages/ai-consult/index',
  },
  {
    title: '我的行情关注',
    desc: '管理已关注作物价格',
    icon: 'chart-line',
    color: 'var(--acm-info)',
    url: '/pages/market/index',
  },
  {
    title: '我的意向商户',
    desc: '查看已记录感兴趣的收购方',
    icon: 'heart-handshake',
    color: 'var(--acm-fruit-orange)',
    url: '/pages/buyer-interests/index',
  },
  {
    title: '我的推广素材',
    desc: '继续生成农产品标题、文案和话术',
    icon: 'files',
    color: 'var(--acm-warning)',
    url: '/pages/ads/index',
  },
]

const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.reLaunch({ url: '/pages/my-field/index' })
}

const goLogin = () => {
  uni.reLaunch({ url: '/pages/login/index' })
}

const goNotification = () => {
  uni.navigateTo({ url: '/pages/notification/index' })
}

const openService = (item: ServiceItem) => {
  if (!item.url) {
    showPlaceholder(item.title)
    return
  }
  uni.navigateTo({ url: item.url })
}

const showPlaceholder = (title: string) => {
  uni.showToast({ title: `${title}暂未接入完整页面`, icon: 'none' })
}

const handleEditProfile = () => {
  if (!authStore.isLoggedIn) {
    uni.showToast({ title: '请先登录后修改资料', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/pages/profile/edit' })
}

const handleCertification = () => {
  if (!authStore.isLoggedIn) {
    uni.showToast({ title: '请先登录后上传认证', icon: 'none' })
    return
  }
  uni.showModal({
    title: '上传认证',
    content: '当前项目暂未提供认证材料上传流程，本入口仅做占位提示，不会模拟认证成功。',
    showCancel: false,
    confirmText: '知道了',
    confirmColor: '#367d49',
  })
}

const confirmLogout = () => {
  uni.showModal({
    title: '退出登录',
    content: '确认退出当前账号吗？退出后需要重新登录才能同步个人数据。',
    confirmText: '退出',
    cancelText: '取消',
    confirmColor: '#bd554d',
    success: async (res) => {
      if (!res.confirm) return
      await authStore.logout()
      uni.reLaunch({ url: '/pages/login/index' })
    },
  })
}
</script>

<style scoped lang="scss">
.profile-page {
  height: 100vh;
  background:
    radial-gradient(circle at 80% 4%, rgba(214, 168, 58, 0.18), transparent 26%),
    var(--acm-bg-app);
  overflow: hidden;
}

.profile-scroll {
  height: 100%;
  box-sizing: border-box;
}

.profile-hero {
  position: relative;
  overflow: hidden;
  padding: calc(26rpx + constant(safe-area-inset-top)) 24rpx 34rpx;
  padding: calc(26rpx + env(safe-area-inset-top)) 24rpx 34rpx;
  border-bottom-left-radius: 42rpx;
  border-bottom-right-radius: 42rpx;
  background:
    linear-gradient(110deg, rgba(37, 84, 58, 0.96), rgba(54, 125, 73, 0.72) 58%, rgba(214, 168, 58, 0.22)),
    url('/static/images/field-command/field-focus-orchard.jpg');
  background-size: cover;
  background-position: center;
  box-shadow: 0 16rpx 38rpx rgba(37, 84, 58, 0.17);
}

.profile-hero__bg {
  position: absolute;
  right: -80rpx;
  bottom: 26rpx;
  width: 300rpx;
  height: 128rpx;
  border-radius: 999rpx;
  background:
    repeating-linear-gradient(100deg, rgba(255, 254, 247, 0.16) 0 3rpx, transparent 3rpx 22rpx),
    linear-gradient(90deg, transparent, rgba(255, 254, 247, 0.16));
  transform: rotate(-8deg);
  pointer-events: none;
}

.profile-hero__nav {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-back,
.nav-spacer {
  width: 72rpx;
  height: 72rpx;
}

.nav-back {
  margin: 0;
  padding: 0;
  border: 1rpx solid rgba(255, 254, 247, 0.26);
  border-radius: 50%;
  background: rgba(255, 254, 247, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-back::after {
  border: 0;
}

.profile-hero__title {
  color: var(--acm-text-inverse);
  font-size: 34rpx;
  font-weight: 850;
}

.profile-card {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 22rpx;
  margin-top: 34rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(255, 254, 247, 0.28);
  border-radius: 32rpx;
  background: rgba(255, 254, 249, 0.88);
  box-shadow: 0 12rpx 30rpx rgba(37, 84, 58, 0.14);
  box-sizing: border-box;
}

.profile-avatar {
  width: 112rpx;
  height: 112rpx;
  padding: 0;
  border: 0;
  border-radius: 30rpx;
  background: transparent;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
}

.profile-avatar__image {
  width: 100%;
  height: 100%;
  border-radius: 30rpx;
  display: block;
}

.profile-info {
  min-width: 0;
  flex: 1;
}

.profile-name,
.profile-meta {
  display: block;
}

.profile-name {
  color: var(--acm-text-primary);
  font-size: 38rpx;
  font-weight: 860;
  line-height: 1.15;
}

.profile-meta {
  margin-top: 8rpx;
  color: var(--acm-text-secondary);
  font-size: 24rpx;
  line-height: 1.35;
}

.profile-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 14rpx;
}

.profile-tag {
  padding: 7rpx 14rpx;
  border-radius: 999rpx;
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary-dark);
  font-size: 21rpx;
  font-weight: 800;
}

.profile-tag--soft {
  background: var(--acm-harvest-gold-soft);
  color: var(--acm-warning-text);
}

.profile-stats {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 18rpx;
}

.profile-stat {
  min-height: 92rpx;
  border: 1rpx solid rgba(255, 254, 247, 0.24);
  border-radius: 24rpx;
  background: rgba(255, 254, 249, 0.2);
  padding: 14rpx;
  box-sizing: border-box;
}

.profile-stat__value,
.profile-stat__label {
  display: block;
  text-align: center;
}

.profile-stat__value {
  color: var(--acm-text-inverse);
  font-size: 28rpx;
  font-weight: 850;
}

.profile-stat__label {
  margin-top: 8rpx;
  color: rgba(255, 254, 247, 0.78);
  font-size: 22rpx;
}

.profile-content {
  padding: 24rpx 24rpx calc(46rpx + constant(safe-area-inset-bottom));
  padding: 24rpx 24rpx calc(46rpx + env(safe-area-inset-bottom));
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14rpx;
  margin-bottom: 22rpx;
}

.quick-item {
  min-height: 138rpx;
  margin: 0;
  padding: 18rpx 12rpx;
  border: 1rpx solid rgba(207, 222, 202, 0.86);
  border-radius: 28rpx;
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  color: var(--acm-text-primary);
  font-size: 23rpx;
  font-weight: 800;
  line-height: 1.25;
  box-sizing: border-box;
}

.quick-item::after,
.service-row::after,
.logout-btn::after,
.login-btn::after {
  border: 0;
}

.section-block {
  margin-bottom: 22rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(207, 222, 202, 0.86);
  border-radius: 32rpx;
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
  box-sizing: border-box;
}

.section-head {
  margin-bottom: 18rpx;
}

.section-title,
.section-desc {
  display: block;
}

.section-title {
  color: var(--acm-text-primary);
  font-size: 32rpx;
  font-weight: 850;
}

.section-desc {
  margin-top: 8rpx;
  color: var(--acm-text-secondary);
  font-size: 24rpx;
  line-height: 1.45;
}

.service-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.service-row {
  min-height: 96rpx;
  margin: 0;
  padding: 16rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.58);
  border-radius: 22rpx;
  background: rgba(255, 254, 249, 0.76);
  display: flex;
  align-items: center;
  gap: 16rpx;
  box-sizing: border-box;
  text-align: left;
}

.service-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 20rpx;
  background: var(--acm-brand-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.service-icon--info {
  background: var(--acm-info-soft);
}

.service-icon--soil {
  background: var(--acm-soil-earth-soft);
}

.service-main {
  min-width: 0;
  flex: 1;
}

.service-title,
.service-desc {
  display: block;
}

.service-title {
  color: var(--acm-text-primary);
  font-size: 28rpx;
  font-weight: 820;
  line-height: 1.25;
}

.service-desc {
  margin-top: 6rpx;
  color: var(--acm-text-secondary);
  font-size: 23rpx;
  line-height: 1.4;
}

.logout-btn,
.login-btn {
  width: 100%;
  min-height: 88rpx;
  margin: 0;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  font-size: 28rpx;
  font-weight: 850;
  box-sizing: border-box;
}

.logout-btn {
  border: 1rpx solid rgba(189, 85, 77, 0.22);
  background: rgba(249, 232, 229, 0.9);
  color: var(--acm-danger-text);
}

.login-btn {
  border: 0;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
}
</style>
