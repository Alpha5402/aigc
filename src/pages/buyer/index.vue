<template>
  <view class="page">
    <scroll-view class="page-scroll" scroll-y :show-scrollbar="false">
      <view class="header">
        <view>
          <text class="header-title">销路匹配</text>
          <text class="header-subtitle">根据作物、地区和需求，推荐合适收购方</text>
        </view>
        <view class="header-actions">
          <button class="user-notice-bell" @click="showNotice">
            <SvgIcon name="bell" :size="20" color="var(--acm-text-secondary)" />
          </button>
        </view>
      </view>

      <view class="content">
        <view class="card card-search buyer-search">
          <view class="search-box">
            <SvgIcon name="search" :size="16" color="var(--acm-text-muted)" class="search-icon" />
            <input
              class="search-input"
              :value="searchQuery"
              placeholder="搜索商户、地区或收购品类..."
              @input="onSearchInput"
            />
          </view>
        </view>

        <view class="buyer-quick-actions">
          <button class="buyer-quick-action" @click="goMyProducts">
            <SvgIcon name="package" :size="22" color="var(--acm-brand-primary)" />
            <text>待出售</text>
          </button>
          <button class="buyer-quick-action" @click="goInterestList">
            <SvgIcon name="heart" :size="22" color="var(--acm-brand-primary)" />
            <text>感兴趣</text>
          </button>
        </view>

        <view class="match-result__head">
          <view>
            <view class="section-title-wrap">
              <SvgIcon name="award" :size="18" color="var(--acm-warning)" />
              <text class="match-result__title">销路匹配结果</text>
            </view>
            <text class="match-result__desc">根据价格、距离和损耗综合推荐</text>
          </view>
          <button class="rematch-btn" @click="handleRematch">{{ isRefreshing ? '匹配中' : '重新匹配' }}</button>
        </view>

        <view v-if="filteredBuyers.length === 0" class="list-wrap">
          <EmptyState
            :title="emptyBuyerState.title"
            :description="emptyBuyerState.description"
            action-text="重新匹配"
            @action="refreshRecommendations"
          />
        </view>

        <view v-else class="list-wrap">
          <view
            v-for="buyer in filteredBuyers"
            :key="buyer.id"
            class="buyer-card"
          >
            <view class="buyer-main">
              <view class="buyer-top">
                <view class="buyer-info">
                  <view class="rank-row">
                    <text class="rank-label">{{ buyer.rankLabel || '可联系' }}</text>
                    <text
                      v-for="tag in buyer.recommendationTags || []"
                      :key="tag"
                      class="buyer-tag"
                    >
                      {{ tag }}
                    </text>
                  </view>
                  <text class="buyer-name">{{ buyer.name }}</text>
                  <view class="buyer-meta">
                    <view class="meta-item">
                      <SvgIcon name="map-pin" :size="13" color="var(--acm-text-muted)" />
                      <text>{{ buyer.distance }}</text>
                    </view>
                    <view class="meta-item">
                      <SvgIcon name="star" :size="13" color="var(--acm-warning)" />
                      <text>{{ buyer.rating }}</text>
                    </view>
                    <text>{{ buyer.orders }}单</text>
                    <text>{{ merchantTypeLabel(buyer.merchantType) }}</text>
                  </view>
                  <text v-if="buyer.address" class="buyer-address">{{ buyer.address }}</text>
                  <text v-if="buyer.contactName || buyer.contact" class="buyer-contact">
                    {{ buyer.contactName || '联系人' }} {{ buyer.contact }}
                  </text>
                </view>
                <view class="buyer-profit">
                  <text class="buyer-profit-label">预计净收益</text>
                  <text class="buyer-profit-value">{{ formatCurrency(getNetProfit(buyer)) }}</text>
                </view>
              </view>

              <view class="matched-box">
                <text class="block-title">可成交</text>
                <view
                  v-for="(product, pIndex) in getMatchedProducts(buyer)"
                  :key="pIndex"
                  class="matched-row"
                >
                  <text>{{ product.name }} {{ formatQuantity(product.matchedQuantity, product.unit) }}</text>
                  <text>{{ product.price }}元/{{ product.unit }} = {{ formatCurrency(product.revenue) }}</text>
                </view>
              </view>

              <view class="income-calc">
                <view class="income-calc__top">
                  <view class="income-calc__main">
                    <text class="income-calc__title">收益测算</text>
                    <text class="income-calc__desc">按当前报价、可成交数量、距离和损耗估算</text>
                  </view>
                  <view class="income-calc__side">
                    <button class="income-calc__toggle" @click.stop="toggleCalcDetail(buyer)">
                      {{ isCalcExpanded(buyer) ? '收起详情' : '展开详情' }}
                    </button>
                  </view>
                </view>
                <view v-if="isCalcExpanded(buyer)" class="income-calc__grid">
                  <view class="income-calc__item">
                    <text class="income-calc__label">预计收入</text>
                    <text class="income-calc__value">{{ formatCurrency(getEstimatedIncome(buyer)) }}</text>
                  </view>
                  <view class="income-calc__item">
                    <text class="income-calc__label">运输成本</text>
                    <text class="income-calc__value income-calc__value--cost">-{{ formatCurrency(buyer.transport) }}</text>
                  </view>
                  <view class="income-calc__item">
                    <text class="income-calc__label">预计损耗</text>
                    <text class="income-calc__value income-calc__value--cost">-{{ formatCurrency(buyer.loss) }}</text>
                  </view>
                  <view class="income-calc__item income-calc__item--strong">
                    <text class="income-calc__label">预计净收入</text>
                    <text class="income-calc__value">{{ formatCurrency(getNetProfit(buyer)) }}</text>
                  </view>
                </view>
              </view>

              <view v-if="buyer.matchReason" class="reason-box">
                <SvgIcon name="sparkles" :size="14" color="var(--acm-primary)" />
                <text>{{ buyer.matchReason }}</text>
              </view>

              <view class="action-row">
                <button class="btn btn-soft" @click="markInterested(buyer)">
                  <SvgIcon name="heart" :size="14" color="var(--acm-danger)" />
                  <text>感兴趣</text>
                </button>
                <button class="btn btn-ghost" @click="showInquiryScript(buyer)">
                  <SvgIcon name="message-square-text" :size="14" color="var(--acm-primary)" />
                  <text>询价话术</text>
                </button>
                <button class="btn btn-ghost" @click="navigateBuyer(buyer)">
                  <SvgIcon name="navigation" :size="14" color="var(--acm-primary)" />
                  <text>导航</text>
                </button>
                <button class="btn btn-main" @click="contactBoss(buyer)">
                  <SvgIcon name="phone" :size="14" color="var(--acm-white)" />
                  <text>联系商户</text>
                </button>
              </view>
            </view>
          </view>
        </view>

        <view class="bottom-text">销售收益为参考测算 · 实际收益以最终成交为准</view>
      </view>
    </scroll-view>
    <BottomNav />
    <AssistantFloat current-page="/pages/buyer/index" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import EmptyState from '../../components/common/EmptyState.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import BottomNav from '../../components/layout/BottomNav.vue'
import AssistantFloat from '../../components/assistant/AssistantFloat.vue'
import { hasValidStoredToken } from '../../utils/auth-guard'
import { getCurrentLocationPayload } from '../../utils/location'
import {
  getBuyerData,
  getBuyerNavigation,
  getBuyerRecommendations,
  logBuyerInterest,
  type BuyerItem,
  type MatchedProductItem,
  type MyProductItem,
} from '../../api/agri'

const isDevMode = import.meta.env.DEV
const buyers = ref<BuyerItem[]>([])
const myProducts = ref<MyProductItem[]>([])

const searchQuery = ref('')
const isRefreshing = ref(false)
const expandedCalcMap = ref<Record<string, boolean>>({})

const getEstimatedIncome = (buyer: BuyerItem) => Number(buyer.estimatedIncome || buyer.profit || 0)
const getNetProfit = (buyer: BuyerItem) => Number(buyer.netProfit || 0)

const getCalcKey = (buyer: BuyerItem) => String(buyer.id || buyer.name)

const isCalcExpanded = (buyer: BuyerItem) => Boolean(expandedCalcMap.value[getCalcKey(buyer)])

const toggleCalcDetail = (buyer: BuyerItem) => {
  const key = getCalcKey(buyer)
  expandedCalcMap.value = {
    ...expandedCalcMap.value,
    [key]: !expandedCalcMap.value[key],
  }
}

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value)
  return rounded.toLocaleString('zh-CN')
}

const formatCurrency = (value?: number) => `¥${formatNumber(Number(value || 0))}`

const formatQuantity = (quantity?: number, unit = '斤') => {
  const value = Number(quantity || 0)
  return value ? `${formatNumber(value)}${unit || '斤'}` : '待完善'
}

const getMatchedProducts = (buyer: BuyerItem): MatchedProductItem[] => {
  if (buyer.matchedProducts?.length) return buyer.matchedProducts
  return buyer.products.slice(0, 2).map((product) => ({
    name: product.name,
    price: product.price,
    demand: product.demand,
    matchedQuantity: product.demand,
    unit: product.unit,
    revenue: product.price * product.demand,
  }))
}

const applyBuyerData = (data: {
  buyers?: BuyerItem[]
  myProducts?: MyProductItem[]
}) => {
  buyers.value = data.buyers || []
  myProducts.value = data.myProducts || []
  expandedCalcMap.value = {}
}

const logBuyerLoad = (message: string, detail?: Record<string, unknown>) => {
  if (!isDevMode) return
  console.log(`[buyer] ${message}`, detail || '')
}

const loadData = async () => {
  uni.showLoading({ title: '加载中...' })
  try {
    logBuyerLoad('start initial load')
    const location = await getCurrentLocationPayload()
    logBuyerLoad('location resolved', { hasLocation: Boolean(location), location })
    logBuyerLoad('request buyer overview', { api: 'GET /buyer/overview' })
    const data = await getBuyerData()
    applyBuyerData(data)
    logBuyerLoad('overview loaded', {
      buyers: buyers.value.length,
      myProducts: myProducts.value.length,
    })
  } catch (error) {
    logBuyerLoad('initial load failed', { error })
    uni.showToast({ title: '请求失败', icon: 'error' })
  } finally {
    uni.hideLoading()
  }
}

onLoad(() => {
  void loadData()
})

const filteredBuyers = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  return buyers.value
    .slice()
    .sort((a, b) => getNetProfit(b) - getNetProfit(a))
    .filter((buyer) => {
      if (!keyword) return true
      const productText = buyer.products.map((item) => item.name).join(' ')
      return [buyer.name, buyer.address || '', productText]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
})

const emptyBuyerState = computed(() => {
  if (!myProducts.value.length) {
    return {
      title: '暂无待售产品',
      description: '请先在我的地添加待售作物和预期产出，系统将据此计算销路匹配结果。',
    }
  }
  return {
    title: '当前作物暂无报价匹配',
    description: '当前作物暂无商户报价匹配，可到后台补充商户报价或添加苹果/大豆测试。',
  }
})

const onSearchInput = (event: any) => {
  searchQuery.value = event?.detail?.value || ''
}

const merchantTypeLabel = (type?: string) => {
  if (type === 'supplier') return '供应商'
  if (type === 'purchaser') return '采购商'
  return '综合商户'
}

const refreshRecommendations = async () => {
  if (isRefreshing.value) return
  isRefreshing.value = true
  uni.showLoading({ title: '重新测算中...' })
  try {
    if (!hasValidStoredToken()) {
      logBuyerLoad('skip personalized recommend without token', { api: 'GET /buyer/overview' })
      const data = await getBuyerData()
      applyBuyerData(data)
      uni.showToast({ title: '登录后可进行个性化销路匹配', icon: 'none' })
      return
    }
    const location = await getCurrentLocationPayload(true)
    logBuyerLoad('refresh location resolved', { hasLocation: Boolean(location), location })
    logBuyerLoad('request buyer recommendation', { api: 'POST /buyer/recommend' })
    const data = await getBuyerRecommendations(location ? { currentLocation: location } : undefined)
    applyBuyerData(data)
    logBuyerLoad('recommendation loaded', {
      buyers: buyers.value.length,
      myProducts: myProducts.value.length,
    })
    uni.showToast({ title: '已更新匹配结果', icon: 'success' })
  } catch (error) {
    logBuyerLoad('recommendation failed', { error })
    uni.showToast({ title: '匹配失败', icon: 'error' })
  } finally {
    isRefreshing.value = false
    uni.hideLoading()
  }
}

const handleRematch = () => {
  void refreshRecommendations()
}

const openNavigationLink = (url: string) => {
  if (!url) return false
  const plusRuntime = (globalThis as any)?.plus?.runtime
  if (typeof window !== 'undefined') {
    window.location.href = url
    return true
  }
  if (plusRuntime?.openURL) {
    plusRuntime.openURL(url)
    return true
  }
  return false
}

const markInterested = async (buyer: BuyerItem) => {
  try {
    await logBuyerInterest({
      merchantId: buyer.id,
      actionType: 'interest',
      source: 'sales-match-card',
      extraPayload: {
        matchScore: buyer.matchScore,
        netProfit: buyer.netProfit,
        merchantType: buyer.merchantType,
      },
    })
    uni.showToast({ title: '已记录感兴趣', icon: 'success' })
  } catch (_error) {
    uni.showToast({ title: '记录失败', icon: 'none' })
  }
}

const navigateBuyer = async (buyer: BuyerItem) => {
  uni.showLoading({ title: '规划路线中...' })
  try {
    await logBuyerInterest({
      merchantId: buyer.id,
      actionType: 'navigate',
      source: 'sales-match-card',
      extraPayload: {
        matchScore: buyer.matchScore,
        netProfit: buyer.netProfit,
        merchantType: buyer.merchantType,
      },
    })
    const navigation = buyer.navigation || (await getBuyerNavigation(buyer.id))
    if (openNavigationLink(navigation.amapWebUrl)) {
      return
    }

    uni.openLocation({
      latitude: Number(navigation.latitude),
      longitude: Number(navigation.longitude),
      name: navigation.name,
      address: navigation.address,
      scale: 14,
      fail: () => {
        if (!openNavigationLink(navigation.amapAppUrl)) {
          uni.showToast({ title: '无法打开地图导航', icon: 'none' })
        }
      },
    })
  } catch (_error) {
    uni.showToast({ title: '路线规划失败', icon: 'error' })
  } finally {
    uni.hideLoading()
  }
}

const buildInquiryScript = (buyer: BuyerItem) => {
  const product = getMatchedProducts(buyer)[0]
  const myProduct = myProducts.value.find((item) => product && item.name === product.name) || myProducts.value[0]
  const place = myProduct?.location ? `${myProduct.location}` : ''
  const productName = product?.name || myProduct?.name || '农产品'
  const quantity = formatQuantity(myProduct?.quantity || product?.matchedQuantity, myProduct?.unit || product?.unit || '斤')
  const marketTime = myProduct?.expectedMarketTime || '近期'

  return `老板您好，我这边有一批${place}${productName}，预计产量约${quantity}，预计${marketTime}上市。
看到您这边有相关收购需求，想咨询一下当前收购价格、起收量、是否支持上门收货，以及结算方式。
如果价格合适，可以进一步沟通样品、交货时间和运输安排。`
}

const showInquiryScript = (buyer: BuyerItem) => {
  const script = buildInquiryScript(buyer)
  uni.showModal({
    title: '询价话术',
    content: script,
    confirmText: '复制话术',
    cancelText: '关闭',
    confirmColor: '#367d49',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await logBuyerInterest({
          merchantId: buyer.id,
          actionType: 'view',
          source: 'inquiry-script',
          extraPayload: {
            netProfit: buyer.netProfit,
            matchedProducts: buyer.matchedProducts,
          },
        })
      } catch (_error) {
        // ignore log failure
      }
      uni.setClipboardData({
        data: script,
        success: () => {
          uni.showToast({ title: '已复制话术', icon: 'success' })
        },
      })
    },
  })
}

const contactBoss = (boss: BuyerItem) => {
  const phoneNumber = String(boss.contact || '').replace(/[^\d]/g, '')
  uni.showModal({
    title: '联系商户',
    content: `是否联系 ${boss.name}？\n${boss.contactName || ''} ${boss.contact}\n\n建议先复制询价话术，再沟通报价、起收量和结算方式。`,
    confirmText: '立即拨打',
    cancelText: '稍后再说',
    confirmColor: '#367d49',
    success: async (res) => {
      if (res.confirm) {
        try {
          await logBuyerInterest({
            merchantId: boss.id,
            actionType: 'contact',
            source: 'sales-match-card',
            extraPayload: {
              matchScore: boss.matchScore,
              netProfit: boss.netProfit,
              merchantType: boss.merchantType,
            },
          })
        } catch (_error) {
          // ignore interest log failure
        }
        if (phoneNumber.length >= 11) {
          uni.makePhoneCall({
            phoneNumber,
            fail: () => {
              uni.showToast({ title: '拨号失败', icon: 'none' })
            },
          })
        } else {
          uni.showToast({ title: '当前为演示号码', icon: 'none' })
        }
      }
    },
  })
}

const showNotice = () => {
  uni.navigateTo({ url: '/pages/notification/index' })
}

const goInterestList = () => {
  uni.navigateTo({ url: '/pages/buyer-interests/index' })
}

const goMyProducts = () => {
  uni.navigateTo({ url: '/pages/my-products/index' })
}

</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  background: var(--acm-bg-page);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-scroll {
  flex: 1;
  height: 100%;
  padding-bottom: calc(132rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(132rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.page-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.header {
  background: linear-gradient(180deg, var(--acm-bg-card) 0%, var(--acm-harvest-gold-soft) 100%);
  border-bottom: 2rpx solid var(--acm-border-soft);
  padding: calc(96rpx + constant(safe-area-inset-top)) 32rpx 24rpx;
  padding: calc(96rpx + env(safe-area-inset-top)) 32rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header > view:first-child {
  min-width: 0;
  flex: 1;
}

.header-title {
  display: block;
  font-size: 44rpx;
  color: var(--acm-text-primary);
  margin-bottom: 8rpx;
}

.header-subtitle {
  display: block;
  font-size: 26rpx;
  color: var(--acm-text-muted);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.content {
  padding: 24rpx 24rpx 0;
}

.card {
  background: var(--acm-white);
  border-radius: 32rpx;
  padding: 32rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--acm-shadow-sm);
  overflow: hidden;
}

.card-search {
  padding: 24rpx;
}

.buyer-search {
  margin-bottom: 18rpx;
}

.list-wrap {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 16rpx;
  border-radius: 24rpx;
  background: var(--acm-bg-panel-alt);
  padding: 20rpx 24rpx;
}

.search-icon {
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  font-size: 28rpx;
  color: var(--acm-text-primary);
}

.buyer-quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
  margin: 0 0 28rpx;
}

.buyer-quick-action {
  min-height: 96rpx;
  padding: 0 22rpx;
  border: 1rpx solid rgba(214, 221, 214, 0.9);
  border-radius: 26rpx;
  background: #fff;
  box-shadow: 0 8rpx 22rpx rgba(31, 42, 35, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  color: var(--acm-text-primary);
  font-size: 26rpx;
  font-weight: 800;
  box-sizing: border-box;
  line-height: 1;
}

.buyer-quick-action::after {
  border: 0;
}

.match-result__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin: 0 8rpx 20rpx;
}

.match-result__head > view {
  min-width: 0;
  flex: 1;
}

.section-title-wrap,
.buyer-meta,
.meta-item,
.rank-row,
.action-row,
.reason-box {
  display: flex;
  align-items: center;
}

.section-title-wrap {
  gap: 10rpx;
}

.match-result__title {
  font-size: 34rpx;
  color: var(--acm-text-primary);
}

.match-result__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: var(--acm-text-muted);
}

.rematch-btn {
  flex: 0 0 auto;
  margin: 0;
  padding: 0 22rpx;
  min-height: 56rpx;
  border: 1rpx solid rgba(54, 125, 73, 0.18);
  border-radius: 999rpx;
  background: rgba(255, 254, 249, 0.96);
  color: var(--acm-brand-primary);
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  box-shadow: 0 6rpx 16rpx rgba(64, 84, 62, 0.07);
}

.rematch-btn::after {
  border: 0;
}

.buyer-card {
  border-radius: 32rpx;
  background: var(--acm-white);
  overflow: hidden;
  box-shadow: var(--acm-shadow-sm);
}

.buyer-main {
  padding: 32rpx;
}

.buyer-top {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.buyer-info {
  flex: 1;
}

.rank-row {
  flex-wrap: wrap;
  gap: 8rpx;
  margin-bottom: 12rpx;
}

.rank-label,
.buyer-tag {
  border-radius: 9999rpx;
  padding: 6rpx 14rpx;
  font-size: 22rpx;
}

.rank-label {
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
}

.buyer-tag {
  background: var(--acm-harvest-gold-soft);
  color: var(--acm-warning-text);
}

.buyer-name {
  display: block;
  font-size: 36rpx;
  color: var(--acm-text-primary);
  margin-bottom: 10rpx;
}

.buyer-meta {
  flex-wrap: wrap;
  gap: 12rpx;
  font-size: 24rpx;
  color: var(--acm-text-muted);
}

.meta-item {
  gap: 4rpx;
}

.buyer-address,
.buyer-contact {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--acm-text-secondary);
}

.buyer-profit {
  text-align: right;
  min-width: 190rpx;
}

.buyer-profit-label {
  display: block;
  font-size: 22rpx;
  color: var(--acm-text-muted);
  margin-bottom: 6rpx;
}

.buyer-profit-value {
  display: block;
  font-size: 44rpx;
  color: var(--acm-brand-primary-dark);
}

.block-title {
  display: block;
  font-size: 26rpx;
  color: var(--acm-text-primary);
  margin-bottom: 12rpx;
}

.matched-box,
.reason-box {
  border-radius: 24rpx;
}

.matched-box {
  background: var(--acm-bg-card-soft);
  padding: 22rpx;
  margin-bottom: 18rpx;
}

.matched-row {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--acm-text-secondary);
  margin-bottom: 8rpx;
}

.matched-row:last-child {
  margin-bottom: 0;
}

.income-calc {
  margin-bottom: 18rpx;
  padding: 24rpx;
  border-radius: 26rpx;
  background: rgba(255, 254, 249, 0.92);
  border: 1rpx solid rgba(214, 221, 214, 0.72);
  box-sizing: border-box;
}

.income-calc__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.income-calc__main {
  min-width: 0;
  flex: 1;
}

.income-calc__title {
  display: block;
  color: var(--acm-text-primary);
  font-size: 30rpx;
  font-weight: 800;
}

.income-calc__desc {
  display: block;
  margin-top: 8rpx;
  color: var(--acm-text-secondary);
  font-size: 24rpx;
  line-height: 1.5;
}

.income-calc__side {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14rpx;
}

.income-calc__toggle {
  margin: 0;
  padding: 0 18rpx;
  min-height: 52rpx;
  border: 1rpx solid rgba(54, 125, 73, 0.18);
  border-radius: 999rpx;
  background: #ffffff;
  color: var(--acm-brand-primary);
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.income-calc__toggle::after {
  border: 0;
}

.income-calc__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
  margin-top: 22rpx;
}

.income-calc__item {
  min-width: 0;
  padding: 16rpx;
  border-radius: 18rpx;
  background: var(--acm-white);
  box-shadow: 0 6rpx 16rpx rgba(31, 42, 35, 0.04);
  box-sizing: border-box;
}

.income-calc__label,
.income-calc__value {
  display: block;
}

.income-calc__label {
  margin-bottom: 8rpx;
  color: var(--acm-text-secondary);
  font-size: 22rpx;
}

.income-calc__value {
  color: var(--acm-text-primary);
  font-size: 26rpx;
  font-weight: 800;
  line-height: 1.25;
}

.income-calc__value--cost {
  color: var(--acm-danger-text);
}

.income-calc__item--strong .income-calc__value {
  color: var(--acm-brand-primary);
}

@media screen and (max-width: 420px) {
  .income-calc__top {
    flex-direction: column;
    align-items: flex-start;
  }

  .income-calc__side {
    width: 100%;
    align-items: flex-start;
  }
}

.reason-box {
  align-items: flex-start;
  gap: 10rpx;
    background: var(--acm-info-soft);
  padding: 18rpx 20rpx;
  margin-bottom: 20rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--acm-text-secondary);
}

.action-row {
  gap: 12rpx;
}

.btn {
  flex: 1;
  border: 0;
  border-radius: 16rpx;
  padding: 20rpx 0;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.btn-ghost {
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary);
}

.btn-soft {
  background: var(--acm-danger-soft);
  color: var(--acm-danger-text);
}

.btn-main {
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
}

.bottom-text {
  text-align: center;
  color: var(--acm-text-subtle);
  font-size: 24rpx;
  padding: 32rpx 0;
}

/* Round 2 visual convergence: supply-demand command cards */
.page {
  background: var(--acm-bg-app);
}

.header {
  position: relative;
  overflow: hidden;
  margin: calc(24rpx + constant(safe-area-inset-top)) 24rpx 18rpx;
  margin: calc(24rpx + env(safe-area-inset-top)) 24rpx 18rpx;
  padding: 34rpx 30rpx;
  border-radius: 34rpx;
  background:
    linear-gradient(105deg, rgba(37, 84, 58, 0.95) 0%, rgba(54, 125, 73, 0.82) 50%, rgba(54, 125, 73, 0.2) 100%),
    url('/static/images/field-command/field-hero-cabbage.jpg');
  background-size: cover;
  background-position: center 62%;
  box-shadow: 0 14rpx 34rpx rgba(37, 84, 58, 0.16);
}

.header-title,
.header-subtitle {
  color: var(--acm-text-inverse);
}

.header-subtitle {
  opacity: 0.86;
}

.card,
.buyer-card,
.card-search {
  border-width: 1rpx;
  border-color: rgba(207, 222, 202, 0.86);
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
}

.search-box,
.matched-box,
.income-calc {
  border-color: rgba(200, 222, 197, 0.62);
  background: rgba(255, 254, 249, 0.74);
  box-shadow: none;
}

.rank-label,
.buyer-tag {
  border-radius: 999rpx;
}
</style>
