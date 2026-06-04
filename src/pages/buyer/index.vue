<template>
  <view class="page">
    <scroll-view class="page-scroll" scroll-y :show-scrollbar="false">
      <view class="header">
        <view>
          <text class="header-title">销路匹配</text>
          <text class="header-subtitle">根据作物、地区和需求，推荐合适收购方</text>
        </view>
        <view class="header-actions">
          <button class="icon-btn" @click="goInterestList">
            <SvgIcon name="heart" :size="20" color="var(--acm-danger)" />
          </button>
          <button class="user-notice-bell" @click="showNotice">
            <SvgIcon name="bell" :size="20" color="var(--acm-text-secondary)" />
          </button>
        </view>
      </view>

      <view class="content">
        <view class="card">
          <view class="card-head">
            <text class="card-title">本次待售产品</text>
            <button class="text-btn" @click="goAddCrop">去完善</button>
          </view>

          <EmptyState
            v-if="myProducts.length === 0"
            title="暂无待售产品"
            description="请先在“我的地”中添加作物、预期产出和预计上市时间，系统将据此计算销路匹配结果。"
            action-text="去添加作物"
            @action="goAddCrop"
          />

          <view v-else class="product-list">
            <view v-for="(product, index) in myProducts" :key="index" class="product-item">
              <view class="product-title-row">
                <view class="product-name">
                  <SvgIcon name="package" :size="15" color="var(--acm-primary)" />
                  <text>{{ product.name || '未填写' }}</text>
                </view>
                <text v-if="product.marketPrice" class="product-market">
                  参考 {{ product.marketPrice }}元/{{ product.marketUnit || product.unit || '斤' }}
                </text>
              </view>
              <view class="product-meta-grid">
                <text>预期产出：{{ formatQuantity(product.quantity, product.unit) }}</text>
                <text>预计上市：{{ product.expectedMarketTime || '待完善' }}</text>
                <text>所在地：{{ product.location || '待完善' }}</text>
                <text v-if="product.area">种植面积：{{ product.area }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="card card-search">
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

        <view class="card recommendation-card">
          <view class="recommendation-head">
            <view>
              <text class="card-title">智能销售建议</text>
              <text class="recommendation-provider">{{ recommendationProviderText }}</text>
            </view>
            <button class="text-btn" @click="refreshRecommendations">{{ isRefreshing ? '重算中...' : '重新匹配' }}</button>
          </view>
          <text class="recommendation-summary">{{ recommendation.summary }}</text>
        </view>

        <view v-if="topRevenueBuyers.length" class="card comparison-card">
          <view class="card-head">
            <text class="card-title">收益对比</text>
            <text class="card-note">按预计净收益排序</text>
          </view>
          <view class="comparison-list">
            <view v-for="buyer in topRevenueBuyers" :key="buyer.id" class="comparison-item">
              <view class="comparison-top">
                <text class="comparison-name">{{ buyer.name }}</text>
                <text class="comparison-net">{{ formatCurrency(getNetProfit(buyer)) }}</text>
              </view>
              <text class="comparison-formula">
                预估 {{ formatCurrency(getEstimatedIncome(buyer)) }} - 运费 {{ formatCurrency(buyer.transport) }} - 损耗 {{ formatCurrency(buyer.loss) }} = 净收益 {{ formatCurrency(getNetProfit(buyer)) }}
              </text>
            </view>
          </view>
        </view>

        <view class="section-head">
          <view class="section-left">
            <view class="section-title-wrap">
              <SvgIcon name="award" :size="18" color="var(--acm-warning)" />
              <text class="section-title">销路匹配结果</text>
            </view>
          </view>
          <text class="section-note">按预计净收益排序</text>
        </view>

        <view v-if="filteredBuyers.length === 0" class="list-wrap">
          <EmptyState
            title="暂无匹配商户"
            description="当前待售产品暂未匹配到合适收购商，可调整作物信息或稍后重试。"
            action-text="重新匹配"
            @action="loadData"
          />
        </view>

        <view v-else class="list-wrap">
          <view
            v-for="buyer in filteredBuyers"
            :key="buyer.id"
            :class="['buyer-card', selectedBuyer === buyer.id ? 'buyer-card-active' : '']"
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

              <view class="profit-grid">
                <view class="profit-cell">
                  <text class="profit-label">预估收入</text>
                  <text class="profit-value">{{ formatCurrency(getEstimatedIncome(buyer)) }}</text>
                </view>
                <view class="profit-cell">
                  <text class="profit-label">运输成本</text>
                  <text class="profit-value cost">-{{ formatCurrency(buyer.transport) }}</text>
                </view>
                <view class="profit-cell">
                  <text class="profit-label">预估损耗</text>
                  <text class="profit-value cost">-{{ formatCurrency(buyer.loss) }}</text>
                </view>
                <view class="profit-cell profit-cell-main">
                  <text class="profit-label">预计净收益</text>
                  <text class="profit-value net">{{ formatCurrency(getNetProfit(buyer)) }}</text>
                </view>
              </view>

              <view v-if="buyer.matchReason" class="reason-box">
                <SvgIcon name="sparkles" :size="14" color="var(--acm-primary)" />
                <text>{{ buyer.matchReason }}</text>
              </view>

              <view class="expand-trigger" @click="toggleBuyer(buyer)">
                <text class="expand-text">收益测算</text>
                <SvgIcon
                  name="chevron-down"
                  :size="14"
                  color="var(--acm-text-muted)"
                  :class="['arrow-icon', selectedBuyer === buyer.id ? 'expanded' : '']"
                />
              </view>

              <view :class="['detail-box', selectedBuyer === buyer.id ? 'expanded' : '']">
                <view class="detail-item">
                  <text class="detail-label">预估收入</text>
                  <text class="detail-value">{{ formatCurrency(getEstimatedIncome(buyer)) }}</text>
                </view>
                <view class="detail-item">
                  <text class="detail-label">运输成本</text>
                  <text class="detail-value cost">-{{ formatCurrency(buyer.transport) }}</text>
                </view>
                <view class="detail-item">
                  <text class="detail-label">预估损耗</text>
                  <text class="detail-value cost">-{{ formatCurrency(buyer.loss) }}</text>
                </view>
                <view class="detail-item detail-total">
                  <text class="detail-label-total">预计净收益</text>
                  <text :class="['detail-value-total', selectedBuyer === buyer.id ? 'detail-value-total-animate' : '']">
                    {{ formatCurrency(displayNetProfit(buyer)) }}
                  </text>
                </view>
                <text class="detail-note">按当前报价、可成交数量、距离和损耗估算，实际收益以最终成交为准。</text>
                <button class="nav-btn" @click.stop="navigateBuyer(buyer)">
                  <SvgIcon name="navigation" :size="14" color="var(--acm-primary)" />
                  <text>查看导航</text>
                </button>
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
import { onLoad, onUnload } from '@dcloudio/uni-app'
import EmptyState from '../../components/common/EmptyState.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import BottomNav from '../../components/layout/BottomNav.vue'
import AssistantFloat from '../../components/assistant/AssistantFloat.vue'
import { getCurrentLocationPayload } from '../../utils/location'
import {
  getBuyerData,
  getBuyerNavigation,
  getBuyerRecommendations,
  logBuyerInterest,
  type BuyerItem,
  type BuyerRecommendationInfo,
  type MatchedProductItem,
  type MyProductItem,
} from '../../api/agri'

const buyers = ref<BuyerItem[]>([])
const myProducts = ref<MyProductItem[]>([])
const recommendation = ref<BuyerRecommendationInfo>({
  provider: 'rule-fallback',
  summary: '正在根据待售产品、收购价、需求量、距离、运输成本和损耗计算推荐结果...',
})

const selectedBuyer = ref<number | null>(null)
const searchQuery = ref('')
const isRefreshing = ref(false)
const animatedNetProfitMap = ref<Record<number, number>>({})
let netProfitTimer: ReturnType<typeof setInterval> | null = null

const stopNetProfitTimer = () => {
  if (netProfitTimer) {
    clearInterval(netProfitTimer)
    netProfitTimer = null
  }
}

const animateNumber = (target: number, onUpdate: (n: number) => void) => {
  stopNetProfitTimer()
  let current = 0
  const step = Math.max(1, Math.ceil(target / 30))
  netProfitTimer = setInterval(() => {
    current = Math.min(current + step, target)
    onUpdate(current)
    if (current >= target) {
      stopNetProfitTimer()
    }
  }, 40)
}

const runNetProfitAnimation = (buyerId: number, target: number) => {
  animatedNetProfitMap.value = {
    ...animatedNetProfitMap.value,
    [buyerId]: 0,
  }
  animateNumber(target, (n) => {
    animatedNetProfitMap.value = {
      ...animatedNetProfitMap.value,
      [buyerId]: n,
    }
  })
}

const getEstimatedIncome = (buyer: BuyerItem) => Number(buyer.estimatedIncome || buyer.profit || 0)
const getNetProfit = (buyer: BuyerItem) => Number(buyer.netProfit || 0)

const displayNetProfit = (buyer: BuyerItem) => {
  const value = animatedNetProfitMap.value[buyer.id]
  return typeof value === 'number' ? value : getNetProfit(buyer)
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

const loadData = async () => {
  uni.showLoading({ title: '加载中...' })
  try {
    const location = await getCurrentLocationPayload()
    const data = location
      ? await getBuyerRecommendations({ currentLocation: location })
      : await getBuyerData()
    buyers.value = data.buyers || []
    myProducts.value = data.myProducts || []
    recommendation.value = data.recommendation
    animatedNetProfitMap.value = buyers.value.reduce<Record<number, number>>((acc, item) => {
      acc[item.id] = getNetProfit(item)
      return acc
    }, {})
  } catch (_error) {
    uni.showToast({ title: '请求失败', icon: 'error' })
  } finally {
    uni.hideLoading()
  }
}

onLoad(() => {
  void loadData()
})

const recommendationProviderText = computed(() => {
  return recommendation.value.provider === 'dashscope' ? '大模型辅助分析' : '规则测算推荐'
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

const topRevenueBuyers = computed(() => filteredBuyers.value.slice(0, 3))

const onSearchInput = (event: any) => {
  searchQuery.value = event?.detail?.value || ''
}

const merchantTypeLabel = (type?: string) => {
  if (type === 'supplier') return '供应商'
  if (type === 'purchaser') return '采购商'
  return '综合商户'
}

const toggleBuyer = (buyer: BuyerItem) => {
  if (selectedBuyer.value === buyer.id) {
    selectedBuyer.value = null
    return
  }

  selectedBuyer.value = buyer.id
  runNetProfitAnimation(buyer.id, getNetProfit(buyer))
  void logBuyerInterest({
    merchantId: buyer.id,
    actionType: 'view',
    source: 'buyer-profit-detail',
    extraPayload: {
      matchScore: buyer.matchScore,
      netProfit: buyer.netProfit,
      merchantType: buyer.merchantType,
    },
  })
}

const refreshRecommendations = async () => {
  if (isRefreshing.value) return
  isRefreshing.value = true
  uni.showLoading({ title: '重新测算中...' })
  try {
    const location = await getCurrentLocationPayload(true)
    const data = await getBuyerRecommendations(location ? { currentLocation: location } : undefined)
    buyers.value = data.buyers || []
    myProducts.value = data.myProducts || []
    recommendation.value = data.recommendation
    animatedNetProfitMap.value = buyers.value.reduce<Record<number, number>>((acc, item) => {
      acc[item.id] = getNetProfit(item)
      return acc
    }, {})
    uni.showToast({ title: '已更新匹配结果', icon: 'success' })
  } catch (_error) {
    uni.showToast({ title: '匹配失败', icon: 'error' })
  } finally {
    isRefreshing.value = false
    uni.hideLoading()
  }
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

const goAddCrop = () => {
  uni.navigateTo({ url: '/pages/add-crop/index' })
}

onUnload(() => {
  stopNetProfitTimer()
})
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

.icon-btn {
  width: 80rpx;
  height: 80rpx;
  border: 0;
  border-radius: 9999rpx;
  background: var(--acm-bg-panel);
  display: flex;
  align-items: center;
  justify-content: center;
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

.recommendation-card {
  background: linear-gradient(180deg, var(--acm-bg-card) 0%, var(--acm-harvest-gold-soft) 100%);
  border: 2rpx solid var(--acm-border-warning);
}

.recommendation-head,
.card-head,
.comparison-top,
.product-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.recommendation-head,
.card-head {
  margin-bottom: 20rpx;
}

.recommendation-provider,
.card-note {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: var(--acm-soil-earth);
}

.recommendation-summary {
  display: block;
  font-size: 26rpx;
  line-height: 1.6;
  color: var(--acm-text-secondary);
}

.card-title {
  font-size: 34rpx;
  color: var(--acm-text-primary);
}

.text-btn {
  border: 0;
  background: transparent;
  color: var(--acm-primary);
  font-size: 26rpx;
}

.product-list,
.comparison-list,
.list-wrap {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.product-item {
  border-radius: 24rpx;
  background: var(--acm-bg-success-soft);
  padding: 24rpx;
}

.product-name {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: 30rpx;
  color: var(--acm-text-primary);
}

.product-market {
  font-size: 23rpx;
  color: var(--acm-primary);
}

.product-meta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx 20rpx;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: var(--acm-text-secondary);
}

.product-meta-grid text {
  width: calc((100% - 20rpx) / 2);
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

.comparison-card {
  border: 2rpx solid var(--acm-border-success);
}

.comparison-item {
  border-radius: 22rpx;
  background: var(--acm-bg-soft);
  padding: 22rpx;
}

.comparison-name {
  font-size: 28rpx;
  color: var(--acm-text-primary);
}

.comparison-net {
  font-size: 30rpx;
  color: var(--acm-primary);
}

.comparison-formula {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--acm-text-secondary);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 8rpx 20rpx;
}

.section-left,
.section-title-wrap,
.buyer-meta,
.meta-item,
.rank-row,
.action-row,
.reason-box,
.expand-trigger,
.nav-btn {
  display: flex;
  align-items: center;
}

.section-title-wrap {
  gap: 10rpx;
}

.section-title {
  font-size: 34rpx;
  color: var(--acm-text-primary);
}

.section-note {
  font-size: 24rpx;
  color: var(--acm-text-muted);
}

.buyer-card {
  border-radius: 32rpx;
  background: var(--acm-white);
  overflow: hidden;
  box-shadow: var(--acm-shadow-sm);
}

.buyer-card-active {
  box-shadow: 0 0 0 4rpx var(--acm-ring-primary-35);
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
.profit-grid,
.reason-box,
.detail-box {
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

.profit-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  background: var(--acm-brand-primary-soft);
  padding: 20rpx;
  margin-bottom: 18rpx;
}

.profit-cell {
  width: calc((100% - 16rpx) / 2);
}

.profit-label {
  display: block;
  font-size: 22rpx;
  color: var(--acm-text-muted);
  margin-bottom: 6rpx;
}

.profit-value {
  display: block;
  font-size: 28rpx;
  color: var(--acm-text-primary);
}

.profit-value.cost {
  color: var(--acm-danger);
}

.profit-value.net {
  color: var(--acm-brand-primary-dark);
  font-size: 34rpx;
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

.expand-trigger {
  border-radius: 24rpx;
  background: var(--acm-bg-panel-alt);
  padding: 24rpx;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.expand-text {
  font-size: 26rpx;
  color: var(--acm-text-secondary);
}

.arrow-icon {
  transition: transform 0.3s ease;
}

.arrow-icon.expanded {
  transform: rotate(180deg);
}

.detail-box {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  background: var(--acm-bg-soft);
  padding: 0 24rpx;
  margin-bottom: 0;
  transition: max-height 0.4s ease, opacity 0.3s ease, padding 0.3s ease, margin 0.3s ease;
}

.detail-box.expanded {
  max-height: 720rpx;
  opacity: 1;
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.detail-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.detail-total {
  padding-top: 16rpx;
  border-top: 2rpx solid var(--acm-line-neutral-2);
}

.detail-label,
.detail-label-total {
  font-size: 26rpx;
  color: var(--acm-text-secondary);
}

.detail-value {
  font-size: 26rpx;
  color: var(--acm-text-primary);
}

.cost {
  color: var(--acm-danger);
}

.detail-value-total {
  font-size: 36rpx;
  color: var(--acm-primary);
}

.detail-note {
  display: block;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--acm-text-muted);
  margin-top: 18rpx;
}

.nav-btn {
  justify-content: center;
  gap: 8rpx;
  width: 100%;
  border: 0;
  border-radius: 18rpx;
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary);
  font-size: 26rpx;
  padding: 18rpx 0;
  margin-top: 18rpx;
}

.detail-value-total-animate {
  animation: profitPop 0.45s ease;
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

@keyframes profitPop {
  0% {
    transform: scale(0.94);
  }
  65% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
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

.icon-btn {
  background: rgba(255, 254, 249, 0.18);
  border: 1rpx solid rgba(255, 254, 249, 0.3);
}

.card,
.buyer-card,
.comparison-card,
.recommendation-card,
.card-search {
  border-width: 1rpx;
  border-color: rgba(207, 222, 202, 0.86);
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
}

.recommendation-card {
  position: relative;
  overflow: hidden;
}

.recommendation-card::after {
  content: '';
  position: absolute;
  right: 18rpx;
  bottom: 16rpx;
  width: 190rpx;
  height: 82rpx;
  border-radius: 999rpx;
  background: repeating-linear-gradient(105deg, rgba(122, 101, 72, 0.09) 0 2rpx, transparent 2rpx 16rpx);
  opacity: 0.42;
  pointer-events: none;
}

.product-item,
.search-box,
.matched-box,
.profit-cell,
.comparison-item,
.detail-card {
  border-color: rgba(200, 222, 197, 0.62);
  background: rgba(255, 254, 249, 0.74);
  box-shadow: none;
}

.buyer-card-active {
  border-color: rgba(54, 125, 73, 0.52);
  box-shadow: 0 12rpx 28rpx rgba(37, 84, 58, 0.12);
}

.rank-label,
.buyer-tag {
  border-radius: 999rpx;
}
</style>
