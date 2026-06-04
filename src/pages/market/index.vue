<template>
  <view class="page">
    <scroll-view class="page-scroll" scroll-y :show-scrollbar="false">
      <view class="header">
        <view>
          <text class="header-title">行情</text>
          <text class="header-subtitle">山东烟台 · 今天 4月4日</text>
        </view>
        <button class="user-notice-bell" @click="showNotice">
          <SvgIcon name="bell" :size="20" color="var(--acm-text-secondary)" />
        </button>
      </view>

      <view v-if="priceAlerts.length" class="alerts">
        <view
          v-for="(alert, index) in priceAlerts"
          :key="index"
          :class="['alert-card', alert.urgency === 'high' ? 'alert-card-high' : 'alert-card-normal']"
        >
          <view class="alert-row">
            <view :class="['alert-icon', alert.urgency === 'high' ? 'alert-icon-high' : 'alert-icon-normal']">
                <SvgIcon
                  :name="alert.urgency === 'high' ? 'triangle-alert' : 'target'"
                  :size="18"
                  color="var(--acm-white)"
                />
            </view>
            <view class="alert-content">
              <view class="alert-title-row">
                <text :class="['alert-title', alert.urgency === 'high' ? 'alert-title-high' : 'alert-title-normal']">{{ alert.title }}</text>
                <text class="alert-tag">{{ alert.crop }}</text>
              </view>
              <text :class="['alert-message', alert.urgency === 'high' ? 'alert-message-high' : 'alert-message-normal']">{{ alert.message }}</text>
                <view :class="['alert-action', alert.urgency === 'high' ? 'alert-title-high' : 'alert-title-normal']">
                  <SvgIcon name="chevron-right" :size="14" :color="alert.urgency === 'high' ? 'var(--acm-warning-deep)' : 'var(--acm-success)'" />
                  <text>{{ alert.action }}</text>
                </view>
            </view>
          </view>
        </view>
      </view>

      <view v-if="hasNoData" class="content">
        <EmptyState
          title="暂无行情数据"
          description="请稍后重试或检查网络连接"
          action-text="重新加载"
          @action="loadData"
        />
      </view>

      <template v-else>
        <view class="tab-wrap">
          <view class="tab-search-row">
            <view class="tab-search-box">
              <SvgIcon name="search" :size="15" color="var(--acm-text-muted)" />
              <input
                class="tab-search-input"
                :value="searchCropKeyword"
                placeholder="搜索农产品并查看价格曲线"
                @input="onSearchCropInput"
              />
            </view>
            <button class="tab-search-btn" @click="previewSearchCrop">查看走势</button>
          </view>

          <scroll-view class="crop-tab-scroll" scroll-x>
            <view class="crop-tab-row">
              <view
                v-for="crop in crops"
                :key="crop.id"
                :class="['crop-tab', selectedCrop.id === crop.id ? 'crop-tab-active' : '']"
                @click="selectCrop(crop)"
              >
                <view
                  v-if="canUnfollowCrop(crop)"
                  class="crop-remove-btn"
                  @click.stop="confirmUnfollowCrop(crop)"
                >
                  <SvgIcon name="x" :size="10" color="var(--acm-primary)" />
                </view>
                <view v-if="crop.userOwned" class="owned-dot">我</view>
                <text :class="['crop-name', selectedCrop.id === crop.id ? 'crop-name-active' : '']">{{ crop.name }}</text>
                <text :class="['crop-price', selectedCrop.id === crop.id ? 'crop-price-active' : '']">{{ crop.currentPrice }}</text>
              <view :class="['crop-change', crop.change >= 0 ? 'up' : 'down', selectedCrop.id === crop.id ? 'crop-change-active' : '']">
                  <SvgIcon :name="crop.change >= 0 ? 'trending-up' : 'trending-down'" :size="12" :color="selectedCrop.id === crop.id ? 'var(--acm-text-inverse)' : crop.change >= 0 ? 'var(--acm-price-up)' : 'var(--acm-price-down)'" />
                  <text>{{ Math.abs(crop.change) }}%</text>
                </view>
              </view>
            </view>
          </scroll-view>

          <view class="owned-note">
            <SvgIcon name="user" :size="13" color="var(--acm-text-muted)" />
            <text>标记的是你种植的作物</text>
          </view>
        </view>

        <view class="content">
        <view class="card">
          <view class="card-head">
            <text class="card-title">{{ selectedCrop.name }} · 今日价格</text>
            <view class="card-actions">
              <button :class="['voice-btn', isPlaying ? 'voice-btn-playing' : '']" @click="handleVoicePlay">
                {{ isPlaying ? '播放中...' : '语音播报' }}
              </button>
              <button class="rag-btn" :disabled="ragLoading" @click="handleGenerateMarketReport">
                {{ ragLoading ? '生成中...' : '行情报告' }}
              </button>
            </view>
          </view>

          <view class="stats-grid">
            <view class="stat-item">
              <text class="stat-label">当前价</text>
              <text :class="['stat-value-main', selectedCrop.change >= 0 ? 'up' : 'down']">{{ selectedCrop.currentPrice }}</text>
            </view>
            <view class="stat-item">
              <text class="stat-label">均价</text>
              <text class="stat-value">{{ selectedCrop.avgPrice }}</text>
            </view>
            <view class="stat-item">
              <text class="stat-label">最高</text>
              <text class="stat-value up">{{ selectedCrop.highPrice }}</text>
            </view>
            <view class="stat-item">
              <text class="stat-label">最低</text>
              <text class="stat-value info">{{ selectedCrop.lowPrice }}</text>
            </view>
          </view>

          <view class="meta-line">
            <SvgIcon name="bar-chart-3" :size="16" color="var(--acm-primary)" />
            <text>市场：{{ selectedCrop.marketStatus }}</text>
          </view>
          <view class="meta-grid">
            <view class="meta-cell">
              <SvgIcon name="activity" :size="15" color="var(--acm-info)" />
              <text>周交易量：{{ selectedCrop.weekVolume }}斤</text>
            </view>
            <view class="meta-cell">
              <SvgIcon name="calendar" :size="15" color="var(--acm-warning)" />
              <text>月交易量：{{ selectedCrop.monthVolume }}斤</text>
            </view>
          </view>
        </view>

        <view class="card">
          <view class="card-head">
            <text class="card-title">价格走势</text>
            <button class="switch-btn" @click="toggleComparison">{{ showComparison ? '看预测' : '看对比' }}</button>
          </view>

          <view class="price-chart-container">
            <PriceChart
              v-if="forecastReady"
              :mode="showComparison ? 'bar' : 'line'"
              :points="showComparison ? [] : priceData"
              :comparison-points="showComparison ? comparisonData : []"
              :base-price="selectedCrop.currentPrice"
            />
            <view v-else class="forecast-state">
              <SvgIcon
                :name="forecastLoading ? 'loader-circle' : forecastError ? 'circle-alert' : 'chart-line'"
                :size="22"
                color="var(--acm-primary)"
                :class="forecastLoading ? 'forecast-spin' : ''"
              />
              <text class="forecast-state-title">
                {{ forecastLoading ? '正在生成价格预测...' : forecastError ? '预测服务暂不可用' : '暂无预测数据' }}
              </text>
              <text class="forecast-state-desc">
                {{ forecastLoading ? '基础行情已先展示，预测结果生成后会自动更新。' : forecastError || '当前作物暂未接入预测曲线，可先查看今日价格和周边市场。' }}
              </text>
            </view>
          </view>

          <view :class="['insight', selectedCrop.trend === 'down' ? 'insight-down' : selectedCrop.trend === 'up' ? 'insight-up' : 'insight-stable']">
            <text class="insight-title">{{ selectedCrop.prediction }}</text>
            <text class="insight-desc">{{ selectedCrop.advice }}</text>
          </view>
        </view>

        <view v-if="marketReport" class="card report-card">
          <view class="card-head report-head">
            <view>
              <text class="card-title">{{ marketReport.crop }} · 行情预期报告</text>
              <text class="report-meta">{{ marketReport.region || '未指定地区' }} · {{ formatReportProvider(marketReport.provider) }}</text>
            </view>
          </view>
          <text class="report-text">{{ marketReport.reportText }}</text>
          <view v-if="marketReport.sources.length" class="source-list">
            <view v-for="source in marketReport.sources" :key="source.id" class="source-item">
              <text class="source-title">{{ source.title }}</text>
              <text class="source-meta">{{ source.sourceName }} · {{ source.publishDate || '未标注日期' }}</text>
            </view>
          </view>
        </view>

        <view class="section-head">
          <view class="section-title-wrap">
            <SvgIcon name="map-pin" :size="18" color="var(--acm-primary)" />
            <text class="section-title">周边市场</text>
          </view>
        </view>
        <view v-if="nearbyMarkets.length" class="list-wrap">
          <view v-for="(market, index) in nearbyMarkets" :key="index" class="market-item">
            <view class="market-left">
              <text class="market-name">{{ market.name }}</text>
              <view class="market-distance">
                <SvgIcon name="map-pin" :size="13" color="var(--acm-text-muted)" />
                <text>{{ market.distance }}</text>
              </view>
            </view>
            <view class="market-right">
              <text class="market-price">¥{{ market.price }}</text>
              <StatusChip :type="market.trend" :label="market.trend === 'up' ? '上涨' : market.trend === 'down' ? '下跌' : '稳定'" />
            </view>
          </view>
        </view>
        <view v-else class="list-wrap">
          <EmptyState title="暂无周边市场" description="当前没有可展示的市场报价" />
        </view>

        <view class="section-head">
          <view class="section-title-wrap">
            <SvgIcon name="sparkles" :size="18" color="var(--acm-warning)" />
            <text class="section-title">AI为你推荐</text>
          </view>
        </view>

        <view v-if="personalizedRecommendations.length" class="list-wrap">
          <view v-for="(rec, index) in personalizedRecommendations" :key="index" class="rec-card">
            <view class="rec-top">
              <view class="rec-main">
                <view class="rec-tags">
                  <text class="rec-tag">{{ rec.tag }}</text>
                  <text class="rec-match">匹配度 {{ rec.matchScore }}%</text>
                </view>
                <text class="rec-small">{{ rec.title }}</text>
                <text class="rec-title">{{ rec.content }}</text>
                <text class="rec-meta">难度：{{ rec.difficulty }} · {{ rec.cycle }}</text>
                <view class="rec-reason">
                  <SvgIcon name="lightbulb" :size="14" color="var(--acm-primary)" />
                  <text>{{ rec.reason }}</text>
                </view>
              </view>
              <view class="rec-roi">
                <text class="rec-roi-label">预期收益</text>
                <text class="rec-roi-value">+{{ rec.roi }}%</text>
              </view>
            </view>

            <view class="benefit-list">
              <view v-for="(benefit, bIndex) in rec.benefits" :key="bIndex" class="benefit-item">
                <text class="benefit-index">{{ bIndex + 1 }}</text>
                <text class="benefit-text">{{ benefit }}</text>
              </view>
            </view>

            <view class="rec-footer">
              <view>
                <text class="rec-profit-label">预计增收</text>
                <text class="rec-profit">¥{{ rec.profit }}</text>
              </view>
              <button class="detail-btn" @click="openRecommendation(rec)">查看详情</button>
            </view>
          </view>
        </view>
        <view v-else class="list-wrap">
          <EmptyState title="暂无推荐方案" description="当前暂无可用的经营推荐" />
        </view>

          <view class="bottom-text">数据每日更新 · 经营推荐</view>
        </view>
      </template>
    </scroll-view>
    <BottomNav />
    <AssistantFloat current-page="/pages/market/index" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import EmptyState from '../../components/common/EmptyState.vue'
import StatusChip from '../../components/common/StatusChip.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import BottomNav from '../../components/layout/BottomNav.vue'
import PriceChart from '../../components/PriceChart.vue'
import AssistantFloat from '../../components/assistant/AssistantFloat.vue'
import {
  addMarketFollowCrop,
  generateMarketRagReport,
  getMarketData,
  getMarketForecast,
  removeMarketFollowCrop,
  type MarketRagReportResult,
  type MarketCropItem,
  type NearbyMarketItem,
  type PriceAlertItem,
  type RecommendationItem,
} from '../../api/agri'

type TrendType = 'up' | 'down' | 'stable'

type CropItem = MarketCropItem

const normalizeCropName = (name: string) => String(name || '').trim().replace(/\s+/g, '').replace(/树$/, '')

const randomRange = (min: number, max: number, decimals = 1) => {
  const value = min + Math.random() * (max - min)
  return Number(value.toFixed(decimals))
}

const randomInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))

const createVirtualCrop = (name: string): CropItem => {
  return {
    id: -Date.now(),
    name: String(name || '').trim(),
    currentPrice: 0,
    unit: '斤',
    change: 0,
    trend: 'stable',
    prediction: '暂无数据',
    advice: '等待数据接入',
    marketStatus: '未知',
    avgPrice: 0,
    highPrice: 0,
    lowPrice: 0,
    weekVolume: 0,
    monthVolume: 0,
    userOwned: false,
    source: 'follow',
  }
}



const emptyCrop: CropItem = {
  id: 0,
  name: '--',
  currentPrice: 0,
  unit: '斤',
  change: 0,
  trend: 'stable',
  prediction: '--',
  advice: '--',
  marketStatus: '--',
  avgPrice: 0,
  highPrice: 0,
  lowPrice: 0,
  weekVolume: 0,
  monthVolume: 0,
  userOwned: false,
}

const crops = ref<CropItem[]>([])
const nearbyMarkets = ref<NearbyMarketItem[]>([])
const priceAlerts = ref<PriceAlertItem[]>([])
const personalizedRecommendations = ref<RecommendationItem[]>([])

const selectedCrop = ref<CropItem>(emptyCrop)
const isPlaying = ref(false)
const showComparison = ref(false)
const searchCropKeyword = ref('')
const ragLoading = ref(false)
const marketReport = ref<MarketRagReportResult | null>(null)
const forecastLoading = ref(false)
const forecastError = ref('')
const forecastReady = ref(false)
const hasNoData = computed(() => crops.value.length === 0)
let forecastRequestSeq = 0

const loadData = async () => {
  uni.showLoading({ title: '加载中...' })
  let overviewLoaded = false
  try {
    const data = await getMarketData()
    console.log('[market] overview response =', data)
    crops.value = data.crops || []
    nearbyMarkets.value = data.nearbyMarkets || []
    priceAlerts.value = data.priceAlerts || []
    personalizedRecommendations.value = data.recommendations || []
    selectedCrop.value = crops.value[0] || emptyCrop
    overviewLoaded = true
  } catch (error) {
    console.error('[market] load overview failed:', error)
    uni.showToast({ title: '请求失败', icon: 'error' })
  } finally {
    uni.hideLoading()
  }

  if (!overviewLoaded) return

  if (selectedCrop.value?.spuId) {
    void fetchForecast(selectedCrop.value.spuId)
  } else {
    resetForecastState()
  }
}

onLoad(() => {
  void loadData()
})

const priceData = ref<{ date: string; price: number; ci80L?: number; ci80U?: number; ci95L?: number; ci95U?: number }[]>([])
const comparisonData = ref<any[]>([])

const resetForecastState = () => {
  priceData.value = []
  forecastLoading.value = false
  forecastError.value = ''
  forecastReady.value = false
}

const fetchForecast = async (spuId?: string) => {
  const requestSeq = ++forecastRequestSeq
  if (!spuId) {
    resetForecastState()
    return
  }

  forecastLoading.value = true
  forecastError.value = ''
  forecastReady.value = false
  priceData.value = []

  try {
    const data = await getMarketForecast(spuId, 7)
    if (requestSeq !== forecastRequestSeq) return
    if (data && Array.isArray(data.forecast) && data.forecast.length) {
      // 预测段：用 "明天/后天/..." 作为日期标签
      const labels = ['明天', '后天', '大后天', '第4天', '第5天', '第6天', '第7天']
      priceData.value = data.forecast.slice(0, 7).map((f, i) => ({
        date: labels[i] || `第${i + 1}天`,
        price: f.point ?? 0,
        ci80L: f.ci80Lower ?? undefined,
        ci80U: f.ci80Upper ?? undefined,
        ci95L: f.ci95Lower ?? undefined,
        ci95U: f.ci95Upper ?? undefined,
      }))
      forecastReady.value = priceData.value.some((item) => Number(item.price) > 0)
    } else {
      priceData.value = []
      forecastReady.value = false
    }
  } catch (error) {
    if (requestSeq !== forecastRequestSeq) return
    console.error('[market] forecast failed:', error)
    priceData.value = []
    forecastError.value = '预测服务暂不可用，请确认算法服务是否已启动'
    forecastReady.value = false
  } finally {
    if (requestSeq === forecastRequestSeq) {
      forecastLoading.value = false
    }
  }
}

const showNotice = () => {
  uni.navigateTo({ url: '/pages/notification/index' })
}

const selectCrop = (crop: CropItem) => {
  selectedCrop.value = crop
  marketReport.value = null
  if (crop.spuId) {
    void fetchForecast(crop.spuId)
  } else {
    resetForecastState()
  }
}

const canUnfollowCrop = (_crop: CropItem) => true

const onSearchCropInput = (event: any) => {
  searchCropKeyword.value = event?.detail?.value || ''
}

const findCropByName = (name: string) => {
  const target = normalizeCropName(name)
  return crops.value.find((item) => normalizeCropName(item.name) === target)
}

const previewSearchCrop = () => {
  const keyword = searchCropKeyword.value.trim()
  if (!keyword) {
    uni.showToast({ title: '请先输入作物名称', icon: 'none' })
    return
  }

  const existingCrop = findCropByName(keyword)
  if (existingCrop) {
    selectCrop(existingCrop)
    uni.showToast({ title: `已切换到 ${existingCrop.name}`, icon: 'none' })
    return
  }

  const virtualCrop = createVirtualCrop(keyword)
  selectCrop(virtualCrop)
  uni.showModal({
    title: '加入关注',
    content: `已为 ${virtualCrop.name} 生成价格走势，是否加入关注列表？`,
    confirmText: '加入关注',
    cancelText: '先看看',
    confirmColor: '#367d49',
    success: async (res) => {
      if (!res.confirm) return
      addMarketFollowCrop(virtualCrop.name)
      await loadData()
      const latest = findCropByName(virtualCrop.name)
      if (latest) selectCrop(latest)
      uni.showToast({ title: '已加入关注', icon: 'success' })
    },
  })
}

const confirmUnfollowCrop = (crop: CropItem) => {
  uni.showModal({
    title: '取消关注',
    content: '确认取消关注该作物吗？',
    confirmText: '确认取消',
    cancelText: '再想想',
    confirmColor: '#367d49',
    success: async (res) => {
      if (!res.confirm) return

      const removingCurrent = selectedCrop.value.id === crop.id
      removeMarketFollowCrop(crop.name)
      await loadData()
      if (removingCurrent) {
        selectedCrop.value = crops.value[0] || emptyCrop
        if (selectedCrop.value.spuId) {
          void fetchForecast(selectedCrop.value.spuId)
        } else {
          resetForecastState()
        }
      }
      uni.showToast({ title: '已取消关注', icon: 'none' })
    },
  })
}

const handleVoicePlay = () => {
  if (isPlaying.value) return
  isPlaying.value = true
  setTimeout(() => {
    isPlaying.value = false
  }, 2000)
}

const toggleComparison = () => {
  showComparison.value = !showComparison.value
}

const handleGenerateMarketReport = async () => {
  if (!selectedCrop.value.id || ragLoading.value) return

  ragLoading.value = true
  try {
    const cropName = normalizeCropName(selectedCrop.value.name)
    marketReport.value = await generateMarketRagReport({
      crop: cropName,
      region: '山东烟台',
      question: `最近${cropName}价格走势怎么样，适合出货吗？`,
    })
    uni.showToast({ title: '报告已生成', icon: 'success' })
  } catch (_error) {
    uni.showToast({ title: '生成失败', icon: 'error' })
  } finally {
    ragLoading.value = false
  }
}

const formatReportProvider = (provider: string) => {
  if (provider === 'lightrag') return 'LightRAG增强报告'
  if (provider === 'dashscope') return 'AI增强报告'
  if (provider === 'rule-fallback' || provider === 'mock-fallback' || provider === 'local-fallback') return '兜底报告'
  return '行情报告'
}

const openRecommendation = (recommendation: RecommendationItem) => {
  const payload = encodeURIComponent(JSON.stringify(recommendation))
  uni.navigateTo({ url: `/pages/recommendation-detail/index?data=${payload}` })
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
  background: linear-gradient(180deg, var(--acm-bg-card) 0%, var(--acm-info-soft) 100%);
  border-bottom: 2rpx solid var(--acm-border-soft);
  padding: calc(96rpx + constant(safe-area-inset-top)) 32rpx 24rpx;
  padding: calc(96rpx + env(safe-area-inset-top)) 32rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.header > view:first-child {
  min-width: 0;
  flex: 1;
}

.alerts {
  padding: 24rpx 24rpx 0;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.alert-card {
  border-radius: 32rpx;
  padding: 28rpx;
  border: 2rpx solid transparent;
  box-shadow: var(--acm-shadow-sm);
  overflow: hidden;
}

.alert-card-high {
  background: linear-gradient(135deg, var(--acm-bg-warning-soft), var(--acm-bg-warning-soft-2));
  border-color: var(--acm-border-warning);
}

.alert-card-normal {
  background: linear-gradient(135deg, var(--acm-bg-success-soft), var(--acm-bg-success-soft-2));
  border-color: var(--acm-border-success);
}

.alert-row {
  display: flex;
  gap: 24rpx;
}

.alert-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
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
}

.alert-title-high {
  color: var(--acm-warning-deep);
}

.alert-title-normal {
  color: var(--acm-success);
}

.alert-tag {
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
  border-radius: 8rpx;
  font-size: 20rpx;
  padding: 4rpx 16rpx;
}

.alert-message {
  display: block;
  font-size: 24rpx;
  margin-bottom: 8rpx;
  line-height: 1.5;
}

.alert-message-high {
  color: var(--acm-warning-muted);
}

.alert-message-normal {
  color: var(--acm-primary);
}

.alert-action {
  display: flex;
  align-items: center;
  gap: 4rpx;
  font-size: 24rpx;
}

.tab-wrap {
  background: var(--acm-bg-card);
  margin: 16rpx 0;
  padding: 24rpx 32rpx;
}

.tab-search-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.tab-search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10rpx;
  border-radius: 20rpx;
  background: var(--acm-bg-panel-alt);
  padding: 14rpx 16rpx;
}

.tab-search-input {
  flex: 1;
  font-size: 24rpx;
  color: var(--acm-text-primary);
}

.tab-search-btn {
  border: 0;
  border-radius: 18rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
  font-size: 24rpx;
  padding: 14rpx 24rpx;
}

.crop-tab-scroll {
  width: 100%;
  white-space: nowrap;
}

.crop-tab-row {
  display: inline-flex;
  align-items: center;
  gap: 16rpx;
  min-width: 100%;
  width: max-content;
}

.crop-tab {
  flex-shrink: 0;
  width: 184rpx;
  min-height: 160rpx;
  border-radius: 24rpx;
  background: var(--acm-bg-soft);
  padding: 20rpx 24rpx;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.crop-remove-btn {
  position: absolute;
  top: 10rpx;
  left: 10rpx;
  width: 32rpx;
  height: 32rpx;
  border-radius: 9999rpx;
  background: var(--acm-white-90);
  border: 2rpx solid var(--acm-border-success);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}

.crop-tab-active {
  background: var(--acm-brand-primary);
  box-shadow: var(--acm-shadow-sm);
}

.owned-dot {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  width: 32rpx;
  height: 32rpx;
  border-radius: 9999rpx;
  background: var(--acm-harvest-gold);
  color: var(--acm-text-primary);
  font-size: 18rpx;
  line-height: 32rpx;
  text-align: center;
  z-index: 2;
}

.crop-name {
  font-size: 26rpx;
  color: var(--acm-text-muted);
  margin-bottom: 8rpx;
}

.crop-name-active {
  color: var(--acm-text-inverse);
}

.crop-price {
  font-size: 40rpx;
  color: var(--acm-text-primary);
  margin-bottom: 4rpx;
}

.crop-price-active {
  color: var(--acm-text-inverse);
}

.crop-change {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  font-size: 24rpx;
}

.crop-change-active {
  color: var(--acm-white);
}

.crop-tab-active .crop-change,
.crop-tab-active .crop-change.up,
.crop-tab-active .crop-change.down,
.crop-tab-active .crop-change text {
  color: var(--acm-white);
}

.owned-note {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: 22rpx;
  color: var(--acm-text-muted);
  margin-top: 16rpx;
}

.content {
  padding: 0 24rpx;
}

.card {
  background: var(--acm-bg-card);
  border-radius: 32rpx;
  padding: 32rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--acm-shadow-sm);
  overflow: hidden;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.card-title {
  font-size: 34rpx;
  color: var(--acm-text-primary);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}

.voice-btn {
  border: 0;
  border-radius: 9999rpx;
  background: var(--acm-bg-success-soft);
  color: var(--acm-primary);
  font-size: 24rpx;
  padding: 16rpx 32rpx;
}

.voice-btn-playing {
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
}

.rag-btn {
  border: 0;
  border-radius: 9999rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
  font-size: 24rpx;
  padding: 16rpx 28rpx;
}

.rag-btn[disabled] {
  opacity: 0.7;
}

.stats-grid {
  display: flex;
  gap: 24rpx;
  margin-bottom: 32rpx;
}

.stat-item {
  width: calc((100% - 72rpx) / 4);
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 22rpx;
  color: var(--acm-text-muted);
  margin-bottom: 16rpx;
}

.stat-value-main {
  display: block;
  font-size: 44rpx;
}

.stat-value {
  display: block;
  font-size: 36rpx;
  color: var(--acm-text-secondary);
}

.meta-line {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 26rpx;
  color: var(--acm-text-secondary);
  margin-bottom: 16rpx;
  padding: 20rpx 24rpx;
  border-radius: 24rpx;
  background: var(--acm-bg-panel-alt);
}

.meta-grid {
  display: flex;
  gap: 16rpx;
}

.meta-cell {
  width: calc((100% - 16rpx) / 2);
  border-radius: 24rpx;
  background: var(--acm-bg-panel-alt);
  padding: 20rpx 24rpx;
  font-size: 24rpx;
  color: var(--acm-text-secondary);
  display: flex;
  align-items: center;
  gap: 8rpx;
  box-sizing: border-box;
}

.switch-btn {
  border: 0;
  border-radius: 16rpx;
  background: var(--acm-bg-panel);
  color: var(--acm-text-secondary);
  font-size: 24rpx;
  padding: 12rpx 24rpx;
}

.price-chart-container {
  margin-bottom: 24rpx;
}

.forecast-state {
  min-height: 280rpx;
  border-radius: 24rpx;
  background: var(--acm-bg-panel-alt);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32rpx;
  box-sizing: border-box;
  text-align: center;
}

.forecast-state-title {
  display: block;
  margin-top: 16rpx;
  font-size: 28rpx;
  color: var(--acm-text-primary);
}

.forecast-state-desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--acm-text-muted);
}

.forecast-spin {
  animation: acm-spin 1s linear infinite;
}

.insight {
  border-radius: 24rpx;
  border: 2rpx solid transparent;
  padding: 24rpx;
}

.insight-up {
  background: var(--acm-bg-success-soft);
  border-color: var(--acm-border-success);
}

.insight-down {
  background: var(--acm-bg-warning-soft);
  border-color: var(--acm-border-warning);
}

.insight-stable {
  background: var(--acm-bg-info-soft);
  border-color: var(--acm-border-info);
}

.insight-title {
  display: block;
  font-size: 28rpx;
  color: var(--acm-text-primary);
  margin-bottom: 8rpx;
}

.insight-desc {
  display: block;
  font-size: 26rpx;
  color: var(--acm-text-secondary);
}

.report-card {
  border: 2rpx solid var(--acm-border-success);
}

.report-head {
  align-items: flex-start;
}

.report-meta {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--acm-text-muted);
}

.report-text {
  display: block;
  white-space: pre-line;
  font-size: 26rpx;
  color: var(--acm-text-secondary);
  line-height: 1.75;
}

.source-list {
  margin-top: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.source-item {
  border-radius: 18rpx;
  background: var(--acm-bg-panel-alt);
  padding: 18rpx 20rpx;
}

.source-title {
  display: block;
  font-size: 24rpx;
  color: var(--acm-text-primary);
  line-height: 1.45;
}

.source-meta {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: var(--acm-text-muted);
}

.section-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: 0 8rpx 20rpx;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.section-title {
  font-size: 34rpx;
  color: var(--acm-text-primary);
}

.list-wrap {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.market-item {
  background: var(--acm-white);
  border-radius: 24rpx;
  padding: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: var(--acm-shadow-sm);
}

.market-name {
  display: block;
  font-size: 30rpx;
  color: var(--acm-text-primary);
  margin-bottom: 8rpx;
}

.market-distance {
  display: flex;
  align-items: center;
  gap: 4rpx;
  font-size: 24rpx;
  color: var(--acm-text-muted);
}

.market-price {
  display: block;
  text-align: right;
  font-size: 40rpx;
  color: var(--acm-price-up);
  margin-bottom: 8rpx;
}

.market-trend {
  display: block;
  text-align: right;
  font-size: 22rpx;
}

.rec-card {
  background: var(--acm-bg-card);
  border-radius: 32rpx;
  padding: 32rpx;
  box-shadow: var(--acm-shadow-sm);
  overflow: hidden;
}

.rec-top {
  display: flex;
  gap: 16rpx;
  margin-bottom: 12rpx;
}

.rec-main {
  flex: 1;
}

.rec-tags {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 8rpx;
}

.rec-tag {
  border-radius: 8rpx;
  background: var(--acm-bg-success-soft);
  color: var(--acm-primary);
  font-size: 20rpx;
  padding: 8rpx 20rpx;
}

.rec-match {
  font-size: 20rpx;
  color: var(--acm-text-muted);
}

.rec-small {
  display: block;
  font-size: 22rpx;
  color: var(--acm-text-muted);
  margin-bottom: 4rpx;
}

.rec-title {
  display: block;
  font-size: 36rpx;
  color: var(--acm-text-primary);
  margin-bottom: 8rpx;
}

.rec-meta {
  display: block;
  font-size: 22rpx;
  color: var(--acm-text-muted);
  margin-bottom: 16rpx;
}

.rec-reason {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background: var(--acm-bg-success-soft);
  border-radius: 16rpx;
  padding: 16rpx 24rpx;
  font-size: 24rpx;
  color: var(--acm-primary);
  line-height: 1.5;
}

.rec-roi {
  min-width: 120rpx;
  text-align: right;
}

.rec-roi-label {
  display: block;
  font-size: 20rpx;
  color: var(--acm-text-muted);
  margin-bottom: 4rpx;
}

.rec-roi-value {
  display: block;
  font-size: 48rpx;
  color: var(--acm-fruit-orange);
}

.benefit-list {
  background: var(--acm-bg-soft);
  border-radius: 24rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.benefit-item {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  margin-bottom: 20rpx;
}

.benefit-item:last-child {
  margin-bottom: 0;
}

.benefit-index {
  width: 32rpx;
  height: 32rpx;
  border-radius: 9999rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
  font-size: 18rpx;
  line-height: 32rpx;
  text-align: center;
  margin-top: 2rpx;
}

.benefit-text {
  flex: 1;
  font-size: 26rpx;
  color: var(--acm-text-secondary);
  line-height: 1.5;
}

.rec-footer {
  background: var(--acm-bg-success-soft);
  border-radius: 24rpx;
  padding: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rec-profit-label {
  display: block;
  font-size: 24rpx;
  color: var(--acm-primary);
  margin-bottom: 8rpx;
}

.rec-profit {
  display: block;
  font-size: 44rpx;
  color: var(--acm-primary);
}

.detail-btn {
  border: 0;
  border-radius: 16rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
  font-size: 28rpx;
  padding: 20rpx 40rpx;
}

.bottom-text {
  text-align: center;
  color: var(--acm-text-subtle);
  font-size: 24rpx;
  padding: 32rpx 0;
}

.up {
  color: var(--acm-price-up);
}

.down {
  color: var(--acm-price-down);
}

.info {
  color: var(--acm-info);
}

.neutral {
  color: var(--acm-text-muted);
}

@keyframes acm-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Round 2 visual convergence: agricultural data board */
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
    linear-gradient(105deg, rgba(37, 84, 58, 0.94) 0%, rgba(54, 125, 73, 0.84) 48%, rgba(54, 125, 73, 0.26) 100%),
    url('/static/images/field-command/field-market-tomatoes.jpg');
  background-size: cover;
  background-position: right center;
  box-shadow: 0 14rpx 34rpx rgba(37, 84, 58, 0.16);
}

.header-title,
.header-subtitle {
  color: var(--acm-text-inverse);
}

.header-subtitle {
  opacity: 0.86;
}

.user-notice-bell {
  background: rgba(255, 254, 249, 0.18);
  border: 1rpx solid rgba(255, 254, 249, 0.3);
}

.tab-wrap,
.alerts,
.card {
  border-width: 1rpx;
  border-color: rgba(207, 222, 202, 0.86);
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
}

.card {
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
}

.stat-item,
.meta-cell,
.insight,
.market-item,
.rec-card,
.recommendation-card {
  border-color: rgba(200, 222, 197, 0.66);
  background: rgba(255, 254, 249, 0.74);
  box-shadow: none;
}

.crop-tab {
  border: 1rpx solid rgba(200, 222, 197, 0.62);
  background: rgba(255, 254, 249, 0.8);
}

.crop-tab-active {
  background:
    linear-gradient(180deg, rgba(54, 125, 73, 0.92), rgba(37, 84, 58, 0.94));
  box-shadow: 0 10rpx 24rpx rgba(37, 84, 58, 0.16);
}

.price-chart-container {
  background:
    linear-gradient(180deg, rgba(255, 254, 249, 0.9), rgba(230, 241, 244, 0.72));
  border: 1rpx solid rgba(190, 214, 222, 0.62);
}
</style>
