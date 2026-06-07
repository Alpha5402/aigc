<template>
  <AppPage class="notification-page">
    <view class="page-shell">
      <AppHeader
        title="通知中心"
        subtitle="查看问诊、行情、商户和系统消息"
        show-back
        @back="goBack"
      >
        <template #action>
          <button class="notice-action-btn read-all-btn" :disabled="!hasUnread || loading" @click="markAllAsRead">
            <text :class="['read-all-text', hasUnread && !loading ? '' : 'is-disabled']">全部已读</text>
          </button>
        </template>
      </AppHeader>

      <view class="summary-card">
        <view>
          <text class="summary-value">{{ unreadCount }}</text>
          <text class="summary-label">未读消息</text>
        </view>
        <view>
          <text class="summary-value muted">{{ notifications.length }}</text>
          <text class="summary-label">全部通知</text>
        </view>
        <view class="summary-icon">
          <SvgIcon name="bell-ring" :size="24" color="var(--acm-brand-primary)" />
        </view>
      </view>

      <view class="tabs notice-filter">
        <view
          v-for="tab in tabs"
          :key="tab.key"
          :class="['tab-item', 'notice-filter__item', activeTab === tab.key ? 'tab-item-active notice-filter__item--active' : '']"
          @click="switchTab(tab.key)"
        >
          <text class="tab-label">{{ tab.label }}</text>
          <text v-if="tab.count > 0" class="tab-count">{{ tab.count > 99 ? '99+' : tab.count }}</text>
        </view>
      </view>

      <scroll-view class="list-scroll" scroll-y>
        <view class="list-content">
          <LoadingSkeleton v-if="loading && !notifications.length" variant="list" :rows="5" />

          <EmptyState
            v-else-if="filteredList.length === 0"
            icon-name="bell-off"
            title="暂时没有新消息"
            description="问诊结果、行情提醒和商户意向会在这里集中展示。"
          />

          <view v-else class="notification-list">
            <AppCard
              v-for="item in filteredList"
              :key="item.id"
              :class="['notification-card', item.read ? 'is-read' : 'is-unread']"
              @click="markAsRead(item.id)"
            >
              <view :class="['type-icon', `type-${item.type}`]">
                <SvgIcon :name="getNotificationIcon(item.type)" :size="20" :color="getIconColor(item.type)" />
              </view>
              <view class="notification-main">
                <view class="notification-top">
                  <view class="title-wrap">
                    <view v-if="!item.read" class="unread-dot"></view>
                    <text class="notification-title">{{ item.title }}</text>
                  </view>
                  <StatusChip :type="getChipType(item.type)" :label="getNotificationLabel(item.type)" size="small" />
                </view>
                <text class="notification-desc">{{ item.content }}</text>
                <view class="notification-meta">
                  <text>{{ formatTime(item.createdAt) }}</text>
                  <text>{{ item.read ? '已读' : '未读' }}</text>
                </view>
              </view>
            </AppCard>
          </view>
        </view>
      </scroll-view>
    </view>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppCard from '../../components/common/AppCard.vue'
import AppHeader from '../../components/common/AppHeader.vue'
import AppPage from '../../components/common/AppPage.vue'
import EmptyState from '../../components/common/EmptyState.vue'
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue'
import StatusChip from '../../components/common/StatusChip.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '../../api/agri'

interface TabItem {
  key: string
  label: string
  count: number
}

const activeTab = ref<string>('all')
const notifications = ref<NotificationItem[]>([])
const loading = ref(false)

const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)
const hasUnread = computed(() => unreadCount.value > 0)

const tabs = computed<TabItem[]>(() => [
  { key: 'all', label: '全部', count: unreadCount.value },
  { key: 'unread', label: '未读', count: unreadCount.value },
  { key: 'system', label: '系统通知', count: notifications.value.filter((n) => n.type === 'system' && !n.read).length },
  { key: 'price', label: '行情提醒', count: notifications.value.filter((n) => n.type === 'price' && !n.read).length },
  { key: 'buyer', label: '商户意向', count: notifications.value.filter((n) => n.type === 'buyer' && !n.read).length },
])

const filteredList = computed(() => {
  let list = [...notifications.value]
  if (activeTab.value === 'unread') {
    list = list.filter((n) => !n.read)
  } else if (activeTab.value !== 'all') {
    list = list.filter((n) => n.type === activeTab.value)
  }
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
})

const loadNotifications = async () => {
  if (loading.value) return
  loading.value = true
  try {
    const data = await getNotifications({ type: 'all', page: 1, pageSize: 50 })
    notifications.value = data.list
  } catch (_error) {
    uni.showToast({ title: '通知加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

onShow(() => {
  void loadNotifications()
})

const switchTab = (key: string) => {
  activeTab.value = key
}

const getNotificationIcon = (type: string): string => {
  const iconMap: Record<string, string> = {
    price: 'trending-up',
    buyer: 'users',
    system: 'bell',
  }
  return iconMap[type] || 'bell'
}

const getNotificationLabel = (type: string): string => {
  const labelMap: Record<string, string> = {
    price: '行情',
    buyer: '商户',
    system: '系统',
  }
  return labelMap[type] || '通知'
}

const getIconColor = (type: string): string => {
  const colorMap: Record<string, string> = {
    price: 'var(--acm-warning)',
    buyer: 'var(--acm-brand-primary)',
    system: 'var(--acm-info)',
  }
  return colorMap[type] || 'var(--acm-neutral)'
}

const getChipType = (type: string) => {
  const chipMap: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
    price: 'warning',
    buyer: 'success',
    system: 'info',
  }
  return chipMap[type] || 'neutral'
}

const formatTime = (value: string): string => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const markAsRead = async (id: number) => {
  const notification = notifications.value.find((n) => n.id === id)
  if (!notification || notification.read) return

  try {
    await markNotificationRead(id)
    notification.read = true
    notification.readAt = new Date().toISOString()
  } catch (_error) {
    uni.showToast({ title: '操作失败', icon: 'none' })
  }
}

const markAllAsRead = () => {
  if (!hasUnread.value) return

  uni.showModal({
    title: '全部标记已读',
    content: activeTab.value === 'all' || activeTab.value === 'unread' ? '确定将所有通知标记为已读吗？' : '确定将当前分类通知标记为已读吗？',
    confirmText: '确定',
    cancelText: '取消',
    confirmColor: '#367d49',
    success: (res) => {
      if (!res.confirm) return
      const type = activeTab.value === 'unread' ? 'all' : activeTab.value
      void markAllNotificationsRead(type).then(() => {
        notifications.value.forEach((n) => {
          if (type === 'all' || n.type === type) {
            n.read = true
            n.readAt = new Date().toISOString()
          }
        })
        uni.showToast({ title: '已标记为已读', icon: 'success', duration: 1500 })
      }).catch(() => {
        uni.showToast({ title: '操作失败', icon: 'none' })
      })
    },
  })
}

const goBack = () => {
  uni.navigateBack()
}
</script>

<style scoped lang="scss">
.notification-page {
  min-height: 100vh;
}

.page-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.read-all-btn {
  min-height: 56rpx;
  padding: 0 20rpx;
}

.read-all-text {
  font-size: 24rpx;
  color: inherit;
}

.read-all-text.is-disabled {
  color: var(--acm-text-disabled);
}

.summary-card {
  margin: 8rpx var(--acm-space-page-x) 20rpx;
  padding: 26rpx 28rpx;
  border: 2rpx solid var(--acm-border-soft);
  border-radius: var(--acm-radius-card);
  background: linear-gradient(135deg, var(--acm-bg-card), var(--acm-brand-primary-soft));
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  gap: 20rpx;
  box-shadow: var(--acm-shadow-card);
}

.summary-value,
.summary-label {
  display: block;
}

.summary-value {
  font-size: 42rpx;
  line-height: 1;
  font-weight: 800;
  color: var(--acm-brand-primary-dark);
}

.summary-value.muted {
  color: var(--acm-soil-earth);
}

.summary-label {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--acm-text-secondary);
}

.summary-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 24rpx;
  background: var(--acm-brand-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: calc(100% - var(--acm-space-page-x) * 2);
  padding: 8rpx;
  margin: 0 var(--acm-space-page-x) 24rpx;
  box-sizing: border-box;
}

.tab-item {
  min-width: 0;
  height: 58rpx;
  padding: 0 12rpx;
  border-radius: 999rpx;
  border: 0;
  background: transparent;
  color: var(--acm-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  font-size: 24rpx;
  font-weight: 700;
  box-sizing: border-box;
  overflow: hidden;
}

.tab-item-active {
  background: #ffffff;
  color: var(--acm-brand-primary);
  box-shadow: 0 6rpx 16rpx rgba(31, 42, 35, 0.06);
}

.tab-label {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-count {
  flex: 0 0 auto;
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 7rpx;
  border-radius: var(--acm-radius-pill);
  background: var(--acm-warning-soft);
  color: var(--acm-warning-text);
  font-size: 18rpx;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.tab-item-active .tab-count {
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary);
}

.notice-filter {
  border-radius: 30rpx;
  background: rgba(54, 125, 73, 0.08);
  gap: 8rpx;
}

.notice-filter__item::after,
.notice-action-btn::after {
  border: 0;
}

.notice-action-btn {
  border: 1rpx solid rgba(54, 125, 73, 0.16);
  border-radius: 999rpx;
  background: #ffffff;
  color: var(--acm-brand-primary);
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.notice-action-btn[disabled] {
  opacity: 0.56;
}

.notice-action-btn--danger {
  border-color: rgba(185, 85, 79, 0.18);
  background: rgba(255, 244, 242, 0.96);
  color: #b9554f;
}

.notice-card__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 18rpx;
}

.list-scroll {
  flex: 1;
  height: auto;
}

.list-content {
  padding: 0 var(--acm-space-page-x) 40rpx;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.notification-card {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  transition: opacity var(--acm-motion-fast) var(--acm-motion-ease);
}

.notification-card.is-read {
  opacity: 0.74;
}

.type-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.type-price {
  background: var(--acm-warning-soft);
}

.type-buyer {
  background: var(--acm-success-soft);
}

.type-system {
  background: var(--acm-info-soft);
}

.notification-main {
  flex: 1;
  min-width: 0;
}

.notification-top,
.title-wrap,
.notification-meta {
  display: flex;
  align-items: center;
}

.notification-top {
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 10rpx;
}

.title-wrap {
  min-width: 0;
  gap: 10rpx;
}

.unread-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--acm-warning);
  flex-shrink: 0;
}

.notification-title {
  font-size: 30rpx;
  line-height: 1.35;
  font-weight: 700;
  color: var(--acm-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-desc {
  display: block;
  font-size: 26rpx;
  line-height: 1.6;
  color: var(--acm-text-regular);
  margin-bottom: 14rpx;
}

.notification-meta {
  justify-content: space-between;
  color: var(--acm-text-secondary);
  font-size: 23rpx;
}

/* Round 2 visual convergence: message command center */
.page-shell {
  position: relative;
}

.summary-card {
  position: relative;
  overflow: hidden;
  border: 1rpx solid rgba(207, 222, 202, 0.86);
  background:
    linear-gradient(105deg, rgba(255, 254, 249, 0.98), rgba(255, 254, 249, 0.9) 62%, rgba(230, 241, 244, 0.62)),
    url('/static/images/field-command/field-focus-orchard.jpg');
  background-size: cover;
  background-position: right center;
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
}

.summary-icon {
  background: rgba(255, 254, 249, 0.78);
  border: 1rpx solid rgba(200, 222, 197, 0.68);
  box-shadow: none;
}

.notification-card {
  border-width: 1rpx;
  border-color: rgba(207, 222, 202, 0.86);
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
}

.notification-card.is-unread {
  border-color: rgba(214, 168, 58, 0.44);
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.99), rgba(255, 248, 229, 0.88));
}

.unread-dot {
  width: 12rpx;
  height: 12rpx;
  background: var(--acm-harvest-gold);
}
</style>
