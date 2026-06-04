<template>
  <AppPage>
    <AppHeader title="感兴趣商户" subtitle="管理你关注过、联系过和查看过的收购方" show-back transparent />

    <AppCard class="summary-card" variant="featured">
      <view class="summary-row">
        <view>
          <text class="summary-kicker">意向商户</text>
          <text class="summary-value">{{ interestList.length }}</text>
          <text class="summary-desc">条互动记录</text>
        </view>
        <view class="summary-icon">
          <SvgIcon name="heart" :size="30" color="var(--acm-brand-primary)" />
        </view>
      </view>
    </AppCard>

    <EmptyState
      v-if="interestList.length === 0"
      icon-name="heart-off"
      title="还没有感兴趣商户"
      description="去销路匹配页标记感兴趣、联系或查看导航后，这里会自动记录。"
      action-text="去销路匹配"
      @action="goBuyerPage"
    />

    <template v-else>
      <SectionHeader title="商户记录" description="取消只会从当前列表中移除展示，不影响历史统计。" icon="users" />
      <view class="interest-list">
        <AppCard v-for="item in interestList" :key="item.id" class="interest-card">
          <view class="interest-head">
            <view class="interest-main">
              <text class="merchant-name">{{ item.merchant.name }}</text>
              <view class="chip-row">
                <StatusChip type="match" :label="merchantTypeLabel(item.merchant.merchantType)" />
                <StatusChip :type="statusType(item.actionType)" :label="actionLabel(item.actionType)" />
              </view>
            </view>
            <text class="interest-time">{{ formatTime(item.createdAt) }}</text>
          </view>

          <view class="info-line">
            <SvgIcon name="map-pin" :size="15" color="var(--acm-soil-earth)" />
            <text>{{ item.merchant.address || '地址待完善' }}</text>
          </view>
          <view class="info-line">
            <SvgIcon name="phone" :size="15" color="var(--acm-brand-primary)" />
            <text>{{ item.merchant.contact || '联系方式待完善' }}</text>
          </view>
          <view v-if="item.extraPayload" class="payload-row">
            <text v-if="item.extraPayload.matchScore">匹配度 {{ item.extraPayload.matchScore }}</text>
            <text>来源 {{ item.source }}</text>
          </view>

          <view class="action-row">
            <AppButton text="继续查看" variant="secondary" size="sm" icon="arrow-right" @click="goBuyerPage" />
            <AppButton text="复制联系" variant="text" size="sm" icon="copy" @click="copyContact(item.merchant.contact)" />
            <AppButton text="取消" variant="text" size="sm" icon="x" @click="confirmRemove(item)" />
          </view>
        </AppCard>
      </view>
    </template>
  </AppPage>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/common/AppPage.vue'
import AppHeader from '../../components/common/AppHeader.vue'
import AppCard from '../../components/common/AppCard.vue'
import AppButton from '../../components/common/AppButton.vue'
import EmptyState from '../../components/common/EmptyState.vue'
import SectionHeader from '../../components/common/SectionHeader.vue'
import StatusChip from '../../components/common/StatusChip.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { getBuyerInterests, type BuyerInterestItem } from '../../api/agri'

const interestList = ref<BuyerInterestItem[]>([])
const modalDangerColor = '#bd554d'

const merchantTypeLabel = (type?: string) => {
  if (type === 'supplier') return '供应商'
  if (type === 'purchaser') return '采购商'
  return '综合商户'
}

const actionLabel = (actionType: string) => {
  if (actionType === 'interest') return '感兴趣'
  if (actionType === 'navigate') return '导航'
  if (actionType === 'contact') return '联系'
  return '查看'
}

const statusType = (actionType: string) => {
  if (actionType === 'interest') return 'recommended'
  if (actionType === 'navigate') return 'match'
  if (actionType === 'contact') return 'done'
  return 'neutral'
}

const formatTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

const loadInterestList = async () => {
  uni.showLoading({ title: '加载中...' })
  try {
    const data = await getBuyerInterests()
    interestList.value = data.list || []
  } catch (_error) {
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

onShow(() => {
  void loadInterestList()
})

const goBuyerPage = () => {
  uni.navigateTo({ url: '/pages/buyer/index' })
}

const copyContact = (contact: string) => {
  uni.setClipboardData({
    data: String(contact || ''),
    success: () => {
      uni.showToast({ title: '已复制', icon: 'success' })
    },
  })
}

const confirmRemove = (item: BuyerInterestItem) => {
  uni.showModal({
    title: '取消感兴趣',
    content: `确认从当前列表移除“${item.merchant.name}”吗？`,
    confirmText: '移除',
    cancelText: '保留',
    confirmColor: modalDangerColor,
    success: (res) => {
      if (!res.confirm) return
      interestList.value = interestList.value.filter((record) => record.id !== item.id)
      uni.showToast({ title: '已移除', icon: 'success' })
    },
  })
}
</script>

<style scoped lang="scss">
.summary-card {
  margin-bottom: var(--acm-space-section);
}

.summary-row,
.interest-head,
.chip-row,
.info-line,
.action-row {
  display: flex;
  align-items: center;
}

.summary-row,
.interest-head {
  justify-content: space-between;
  gap: 20rpx;
}

.summary-kicker,
.summary-desc {
  display: block;
  color: var(--acm-text-secondary);
  font-size: var(--acm-font-caption);
}

.summary-value {
  display: block;
  margin: 10rpx 0 6rpx;
  color: var(--acm-brand-primary-dark);
  font-size: 58rpx;
  font-weight: 900;
  line-height: 1;
}

.summary-icon {
  width: 92rpx;
  height: 92rpx;
  border-radius: 28rpx;
  background: var(--acm-bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
}

.interest-list {
  display: flex;
  flex-direction: column;
  gap: var(--acm-space-card-gap);
}

.merchant-name {
  display: block;
  color: var(--acm-text-primary);
  font-size: var(--acm-font-card-title);
  font-weight: 850;
  line-height: 1.25;
  margin-bottom: 12rpx;
}

.chip-row {
  flex-wrap: wrap;
  gap: 10rpx;
}

.interest-time {
  color: var(--acm-text-secondary);
  font-size: 22rpx;
  white-space: nowrap;
}

.info-line {
  align-items: flex-start;
  gap: 10rpx;
  margin-top: 18rpx;
  color: var(--acm-text-regular);
  font-size: var(--acm-font-caption);
  line-height: 1.55;
}

.payload-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 18rpx;
  color: var(--acm-text-secondary);
  font-size: 23rpx;
}

.action-row {
  justify-content: flex-end;
  gap: 10rpx;
  margin-top: 24rpx;
}

/* Round 2 visual convergence: saved buyer records */
.summary-card,
.interest-card {
  border-width: 1rpx;
  border-color: rgba(207, 222, 202, 0.86);
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
}

.summary-card {
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(105deg, rgba(255, 254, 249, 0.98), rgba(255, 254, 249, 0.92) 60%, rgba(255, 254, 249, 0.58)),
    url('/static/images/field-command/field-hero-cabbage.jpg');
  background-size: cover;
  background-position: center 62%;
}

.summary-icon {
  background: rgba(255, 254, 249, 0.76);
  border: 1rpx solid rgba(200, 222, 197, 0.68);
  box-shadow: none;
}

.interest-card {
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
}

.info-line,
.payload-row {
  border-radius: 18rpx;
}
</style>
