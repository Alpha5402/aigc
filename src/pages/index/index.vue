<template>
  <view class="page">
    <scroll-view
      class="page-scroll"
      scroll-y
      refresher-enabled
      :refresher-triggered="isRefreshing"
      @refresherrefresh="onRefresh"
    >
      <!-- 页面头部 -->
      <view class="header">
        <view class="header-top">
          <view class="user-info" @click="handleUserClick">
            <view v-if="isLoggedIn" class="user-avatar">
              <SvgIcon name="user" :size="24" color="var(--acm-white)" />
            </view>
            <view v-else class="user-avatar user-avatar-default">
              <SvgIcon name="user" :size="24" color="var(--acm-primary)" />
            </view>
            <view class="user-text">
              <text v-if="isLoggedIn" class="user-name">{{ userDisplayName }}</text>
              <text v-else class="user-name">未登录</text>
              <text class="user-subtitle">{{ todayDate }}</text>
            </view>
          </view>
          <button class="user-notice-bell" @click="showNotice">
            <SvgIcon name="bell" :size="20" color="var(--acm-text-secondary)" />
            <view v-if="hasUnreadNotice" class="notice-dot"></view>
          </button>
        </view>

        <!-- 今日天气卡片 -->
        <view class="weather-card">
          <view class="weather-main">
            <view class="weather-left">
              <view class="weather-icon">
                <SvgIcon :name="weatherIcon" :size="34" color="var(--acm-white)" />
              </view>
              <view>
                <text class="weather-temp">{{ weatherData.temp }}</text>
                <text class="weather-desc">{{ weatherData.condition }}</text>
              </view>
            </view>
            <view class="weather-right">
              <view class="weather-meta">
                <SvgIcon name="droplets" :size="14" color="var(--acm-text-secondary)" />
                <text>{{ weatherData.humidity }}</text>
              </view>
              <view class="weather-meta">
                <SvgIcon name="wind" :size="14" color="var(--acm-text-secondary)" />
                <text>{{ weatherData.wind }}</text>
              </view>
            </view>
          </view>
          <view v-if="currentLocationLabel" class="weather-location">
            <SvgIcon name="map-pin" :size="14" color="var(--acm-white)" />
            <text>{{ currentLocationLabel }}</text>
          </view>
          <view class="weather-tip">
            <SvgIcon name="check-circle-2" :size="15" color="var(--acm-primary)" />
            <text>{{ weatherData.suggestion }}</text>
          </view>
        </view>
      </view>

      <view class="content">
        <!-- 未登录引导卡片 -->
        <view v-if="!isLoggedIn" class="login-guide-card">
          <view class="login-guide-content">
            <SvgIcon name="log-in" :size="32" color="var(--acm-primary)" />
            <view class="login-guide-text">
              <text class="login-guide-title">登录解锁更多功能</text>
              <text class="login-guide-desc">登录后可查看您的地块、任务和价格预警</text>
            </view>
          </view>
          <button class="login-guide-btn" @click="goLogin">立即登录</button>
        </view>

        <!-- 快捷入口卡片区域 -->
        <view class="section">
          <view class="section-head">
            <view class="section-title-wrap">
              <SvgIcon name="layout-grid" :size="18" color="var(--acm-primary)" />
              <text class="section-title">快捷入口</text>
            </view>
          </view>
          <view class="quick-entry-grid">
            <view
              v-for="entry in quickEntries"
              :key="entry.path"
              class="quick-entry-item"
              @click="navigateTo(entry.path)"
            >
              <view :class="['quick-entry-icon', entry.bgClass]">
                <SvgIcon :name="entry.icon" :size="24" color="var(--acm-white)" />
              </view>
              <text class="quick-entry-title">{{ entry.title }}</text>
            </view>
          </view>
        </view>

        <!-- 待办任务摘要卡片 -->
        <view class="section">
          <view class="section-head">
            <view class="section-title-wrap">
              <SvgIcon name="calendar-check" :size="18" color="var(--acm-primary)" />
              <text class="section-title">今日待办</text>
            </view>
            <text class="section-sub">{{ todayTasks.length }}项任务</text>
          </view>

          <view v-if="todayTasks.length === 0" class="card-empty">
            <EmptyState
              iconName="check-circle-2"
              title="今日无待办任务"
              description="所有任务已完成，继续保持"
            />
          </view>

          <view v-else class="task-list">
            <view
              v-for="task in displayTasks"
              :key="task.localId"
              class="task-item"
            >
              <view :class="['task-priority', task.priority === 'high' ? 'task-priority-high' : 'task-priority-medium']"></view>
              <view class="task-content">
                <text class="task-title">{{ task.title }}</text>
                <view class="task-meta">
                  <text class="task-crop">{{ task.crop }}</text>
                  <text class="task-time">{{ task.time }}</text>
                </view>
              </view>
            </view>
            <view v-if="todayTasks.length > 3" class="task-more" @click="goToMyField">
              <text>查看全部 {{ todayTasks.length }} 项任务</text>
              <SvgIcon name="chevron-right" :size="14" color="var(--acm-primary)" />
            </view>
          </view>
        </view>

        <!-- 价格预警摘要卡片 -->
        <view class="section">
          <view class="section-head">
            <view class="section-title-wrap">
              <SvgIcon name="bell-ring" :size="18" color="var(--acm-warning)" />
              <text class="section-title">价格预警</text>
            </view>
          </view>

          <view v-if="priceAlerts.length === 0" class="card-empty">
            <EmptyState
              iconName="trending-up"
              title="暂无价格预警"
              description="价格波动较大时会及时提醒您"
            />
          </view>

          <view v-else class="alert-list">
            <view
              v-for="(alert, index) in displayAlerts"
              :key="index"
              :class="['alert-item', alert.urgency === 'high' ? 'alert-item-high' : 'alert-item-normal']"
            >
              <view :class="['alert-icon', alert.urgency === 'high' ? 'alert-icon-high' : 'alert-icon-normal']">
                <SvgIcon
                  :name="alert.urgency === 'high' ? 'triangle-alert' : 'target'"
                  :size="16"
                  color="var(--acm-white)"
                />
              </view>
              <view class="alert-content">
                <view class="alert-title-row">
                  <text :class="['alert-title', alert.urgency === 'high' ? 'alert-title-high' : 'alert-title-normal']">{{ alert.title }}</text>
                  <text class="alert-tag">{{ alert.crop }}</text>
                </view>
                <text class="alert-message">{{ alert.message }}</text>
              </view>
            </view>
            <view v-if="priceAlerts.length > 2" class="alert-more" @click="goToMarket">
              <text>查看全部预警</text>
              <SvgIcon name="chevron-right" :size="14" color="var(--acm-primary)" />
            </view>
          </view>
        </view>

        <view class="bottom-text">农业云管理 · 智慧种植</view>
      </view>
    </scroll-view>
    <BottomNav />
    <AssistantFloat current-page="/pages/index/index" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import EmptyState from '../../components/common/EmptyState.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import BottomNav from '../../components/layout/BottomNav.vue'
import AssistantFloat from '../../components/assistant/AssistantFloat.vue'
import { getMyFieldData, getMarketData, type TaskInfo, type PriceAlertItem, type WeatherInfo } from '../../api/agri'
import { getCurrentLocationPayload } from '../../utils/location'
import { useAuthStore } from '../../stores/auth'

interface TaskItem extends TaskInfo {
  localId: string
}

const authStore = useAuthStore()

const isLoggedIn = computed(() => authStore.isLoggedIn)
const userInfo = computed(() => authStore.userInfo)

const userDisplayName = computed(() => {
  if (!userInfo.value) return ''
  return userInfo.value.nickname || userInfo.value.name || (userInfo.value.phone ? userInfo.value.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '用户')
})

const todayDate = computed(() => {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekDay = weekDays[now.getDay()]
  return `${month}月${day}日 ${weekDay}`
})

const weatherData = ref<WeatherInfo>({
  temp: '--',
  condition: '--',
  humidity: '--',
  wind: '--',
  suggestion: '--',
})

const weatherIcon = computed(() => {
  const condition = weatherData.value.condition
  if (condition.includes('雨')) return 'cloud-rain'
  if (condition.includes('雪')) return 'cloud-snow'
  if (condition.includes('阴')) return 'cloud'
  if (condition.includes('多云')) return 'cloud-sun'
  return 'sun'
})

const currentLocationLabel = computed(() => {
  if (weatherData.value.city && weatherData.value.locationAddress) {
    return `${weatherData.value.city} · ${weatherData.value.locationAddress}`
  }
  if (weatherData.value.city) return `当前区域：${weatherData.value.city}`
  if (weatherData.value.locationAddress) return `当前位置：${weatherData.value.locationAddress}`
  return ''
})

const todayTasks = ref<TaskItem[]>([])
const priceAlerts = ref<PriceAlertItem[]>([])
const isRefreshing = ref(false)
const hasUnreadNotice = ref(true)

const displayTasks = computed(() => todayTasks.value.slice(0, 3))
const displayAlerts = computed(() => priceAlerts.value.slice(0, 2))

const canVisitAdmin = computed(() => ['admin', 'demo'].includes(String(userInfo.value?.role || '')))

const quickEntries = computed(() => {
  const entries = [
  { title: '我的地', icon: 'sprout', path: '/pages/my-field/index', bgClass: 'quick-entry-icon-green' },
  { title: '查行情', icon: 'trending-up', path: '/pages/market/index', bgClass: 'quick-entry-icon-blue' },
  { title: '问诊', icon: 'stethoscope', path: '/pages/ai-consult/index', bgClass: 'quick-entry-icon-orange' },
  { title: '找老板', icon: 'users', path: '/pages/buyer/index', bgClass: 'quick-entry-icon-purple' },
  { title: '发广告', icon: 'megaphone', path: '/pages/ads/index', bgClass: 'quick-entry-icon-red' },
  ]
  if (canVisitAdmin.value) {
    entries.push({ title: '管理后台', icon: 'shield-check', path: '/pages/admin/index', bgClass: 'quick-entry-icon-blue' })
  }
  return entries
})

const createTaskLocalId = (taskId: number, index: number) => {
  return `${taskId}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const loadData = async () => {
  try {
    const location = await getCurrentLocationPayload()
    const [fieldData, marketData] = await Promise.all([
      getMyFieldData(location || undefined),
      getMarketData(),
    ])

    weatherData.value = fieldData.weather
    todayTasks.value = fieldData.tasks.map((task, index) => ({
      localId: createTaskLocalId(task.id, index),
      ...task,
    }))
    priceAlerts.value = marketData.priceAlerts
  } catch (_error) {
    uni.showToast({ title: '加载失败', icon: 'error' })
  }
}

const initPage = async () => {
  uni.showLoading({ title: '加载中...' })
  await loadData()
  uni.hideLoading()
}

onLoad(() => {
  void initPage()
})

onShow(() => {
  // 每次显示页面时刷新数据
})

const onRefresh = async () => {
  isRefreshing.value = true
  await loadData()
  isRefreshing.value = false
}

const handleUserClick = () => {
  if (isLoggedIn.value) {
    uni.showToast({ title: '个人中心开发中', icon: 'none' })
  } else {
    goLogin()
  }
}

const showNotice = () => {
  hasUnreadNotice.value = false
  uni.navigateTo({ url: '/pages/notification/index' })
}

const goLogin = () => {
  uni.navigateTo({ url: '/pages/login/index' })
}

const navigateTo = (path: string) => {
  if (path === '/pages/admin/index') {
    uni.navigateTo({ url: path })
    return
  }
  if (path === '/pages/ai-consult/index') {
    uni.redirectTo({ url: path })
  } else {
    uni.redirectTo({
      url: path,
      fail: () => {
        uni.reLaunch({ url: path })
      },
    })
  }
}

const goToMyField = () => {
  uni.redirectTo({ url: '/pages/my-field/index' })
}

const goToMarket = () => {
  uni.redirectTo({ url: '/pages/market/index' })
}
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  background: var(--acm-bg-page);
  display: flex;
  flex-direction: column;
}

.page-scroll {
  flex: 1;
  height: auto;
  padding-bottom: calc(132rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(132rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.header {
  background: linear-gradient(135deg, var(--acm-primary), var(--acm-primary-light));
  padding: 96rpx 32rpx 48rpx;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.header-top > view:first-child {
  min-width: 0;
  flex: 1;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.user-avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: var(--acm-white-20);
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar-default {
  background: var(--acm-white);
}

.user-text {
  display: flex;
  flex-direction: column;
}

.user-name {
  display: block;
  color: var(--acm-white);
  font-size: 34rpx;
  font-weight: 600;
  margin-bottom: 4rpx;
}

.user-subtitle {
  display: block;
  color: var(--acm-white-80);
  font-size: 24rpx;
}

.notice-dot {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: var(--acm-danger);
  border: 4rpx solid var(--acm-white);
}

.weather-card {
  border-radius: 32rpx;
  background: var(--acm-white-95);
  padding: 32rpx;
}

.weather-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.weather-left {
  display: flex;
  align-items: center;
  gap: 32rpx;
}

.weather-icon {
  width: 112rpx;
  height: 112rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, var(--acm-bg-sun-1), var(--acm-bg-sun-2));
  display: flex;
  align-items: center;
  justify-content: center;
}

.weather-temp {
  display: block;
  font-size: 56rpx;
  color: var(--acm-text-primary);
  margin-bottom: 8rpx;
}

.weather-desc {
  display: block;
  font-size: 26rpx;
  color: var(--acm-text-secondary);
}

.weather-right {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  align-items: flex-end;
}

.weather-meta {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 26rpx;
  color: var(--acm-text-secondary);
}

.weather-location {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 20rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--acm-text-secondary);
}

.weather-tip {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 2rpx solid var(--acm-line-neutral);
  color: var(--acm-primary);
  font-size: 26rpx;
}

.content {
  padding: 24rpx 24rpx 0;
}

.section {
  margin-bottom: 24rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
  padding: 0 8rpx;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.section-title {
  font-size: 34rpx;
  color: var(--acm-text-primary);
  font-weight: 600;
}

.section-sub {
  font-size: 24rpx;
  color: var(--acm-text-muted);
}

.login-guide-card {
  background: linear-gradient(135deg, var(--acm-bg-success-soft), var(--acm-bg-success-soft-2));
  border: 2rpx solid var(--acm-border-success);
  border-radius: 32rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
}

.login-guide-content {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-bottom: 24rpx;
}

.login-guide-text {
  flex: 1;
}

.login-guide-title {
  display: block;
  font-size: 32rpx;
  color: var(--acm-primary);
  font-weight: 600;
  margin-bottom: 8rpx;
}

.login-guide-desc {
  display: block;
  font-size: 26rpx;
  color: var(--acm-text-secondary);
}

.login-guide-btn {
  width: 100%;
  height: 88rpx;
  border: 0;
  border-radius: 24rpx;
  background: var(--acm-primary);
  color: var(--acm-white);
  font-size: 30rpx;
  font-weight: 600;
}

.quick-entry-grid {
  display: flex;
  background: var(--acm-white);
  border-radius: 32rpx;
  padding: 32rpx 16rpx;
  box-shadow: var(--acm-shadow-sm);
}

.quick-entry-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.quick-entry-icon {
  width: 96rpx;
  height: 96rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quick-entry-icon-green {
  background: linear-gradient(135deg, var(--acm-primary), var(--acm-primary-dark));
}

.quick-entry-icon-blue {
  background: linear-gradient(135deg, var(--acm-info), var(--acm-sky-data));
}

.quick-entry-icon-orange {
  background: linear-gradient(135deg, var(--acm-harvest-gold), var(--acm-fruit-orange));
}

.quick-entry-icon-purple {
  background: linear-gradient(135deg, var(--acm-soil-earth), var(--acm-brand-primary-dark));
}

.quick-entry-icon-red {
  background: linear-gradient(135deg, var(--acm-warning), var(--acm-danger));
}

.quick-entry-title {
  font-size: 26rpx;
  color: var(--acm-text-primary);
}

.card-empty {
  background: var(--acm-white);
  border-radius: 32rpx;
  overflow: hidden;
}

.task-list {
  background: var(--acm-white);
  border-radius: 32rpx;
  padding: 8rpx 0;
  box-shadow: var(--acm-shadow-sm);
}

.task-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 32rpx;
  border-bottom: 2rpx solid var(--acm-border-soft);
}

.task-item:last-child {
  border-bottom: none;
}

.task-priority {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.task-priority-high {
  background: var(--acm-danger);
}

.task-priority-medium {
  background: var(--acm-warning);
}

.task-content {
  flex: 1;
}

.task-title {
  display: block;
  font-size: 30rpx;
  color: var(--acm-text-primary);
  margin-bottom: 8rpx;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.task-crop {
  font-size: 24rpx;
  color: var(--acm-primary);
  background: var(--acm-bg-success-soft);
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
}

.task-time {
  font-size: 24rpx;
  color: var(--acm-text-muted);
}

.task-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 24rpx;
  font-size: 26rpx;
  color: var(--acm-primary);
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.alert-item {
  background: var(--acm-white);
  border-radius: 24rpx;
  padding: 24rpx;
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  box-shadow: var(--acm-shadow-sm);
}

.alert-item-high {
  border: 2rpx solid var(--acm-border-warning);
  background: linear-gradient(135deg, var(--acm-bg-warning-soft), var(--acm-bg-warning-soft-2));
}

.alert-item-normal {
  border: 2rpx solid var(--acm-border-success);
  background: linear-gradient(135deg, var(--acm-bg-success-soft), var(--acm-bg-success-soft-2));
}

.alert-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.alert-icon-high {
  background: var(--acm-warning);
}

.alert-icon-normal {
  background: var(--acm-primary);
}

.alert-content {
  flex: 1;
}

.alert-title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}

.alert-title {
  font-size: 28rpx;
  font-weight: 600;
}

.alert-title-high {
  color: var(--acm-warning-deep);
}

.alert-title-normal {
  color: var(--acm-success);
}

.alert-tag {
  background: var(--acm-primary);
  color: var(--acm-white);
  border-radius: 8rpx;
  font-size: 20rpx;
  padding: 4rpx 12rpx;
}

.alert-message {
  display: block;
  font-size: 24rpx;
  color: var(--acm-text-secondary);
  line-height: 1.5;
}

.alert-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 20rpx;
  background: var(--acm-white);
  border-radius: 24rpx;
  font-size: 26rpx;
  color: var(--acm-primary);
}

.bottom-text {
  text-align: center;
  color: var(--acm-text-subtle);
  font-size: 24rpx;
  padding: 32rpx 0;
}

/* Round 2 visual convergence: product gateway follows Field Command */
.page {
  background: var(--acm-bg-app);
}

.header {
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(37, 84, 58, 0.86), rgba(54, 125, 73, 0.66)),
    url('/static/images/field-command/field-hero-cabbage.jpg');
  background-size: cover;
  background-position: center 60%;
  box-shadow: 0 18rpx 42rpx rgba(37, 84, 58, 0.15);
}

.weather-card,
.login-guide-card,
.section,
.task-item,
.alert-card {
  border-width: 1rpx;
  border-color: rgba(207, 222, 202, 0.86);
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
}

.weather-card {
  background: rgba(255, 254, 249, 0.86);
  backdrop-filter: blur(10rpx);
}

.quick-entry-item,
.task-item,
.alert-card {
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
}

.quick-entry-icon {
  box-shadow: none;
}
</style>
