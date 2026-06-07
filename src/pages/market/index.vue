<template>
  <view class="page">
    <scroll-view class="page-scroll" scroll-y :show-scrollbar="false">
      <view class="header header--market">
        <view class="header__image"></view>
        <view class="header__shade"></view>
        <view class="header-toolbar">
          <UserAvatarButton />
          <button class="user-notice-bell header-notice" @click="showNotice">
            <SvgIcon name="bell" :size="20" color="var(--acm-text-inverse)" />
          </button>
        </view>
        <view class="header-copy">
          <text class="header-eyebrow">农产品价格雷达</text>
          <text class="header-title">行情</text>
          <text class="header-subtitle">山东烟台 · 今天 4月4日</text>
          <view class="header-pill-row">
            <text>价格曲线</text>
            <text>周边市场</text>
            <text>经营建议</text>
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
          <view class="tab-wrap__head">
            <view>
              <text class="panel-kicker">关注作物</text>
              <text class="panel-title">快速切换价格对象</text>
            </view>
            <text class="panel-count">{{ crops.length }} 项</text>
          </view>
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
        <view class="card price-card">
          <view class="price-card__grain"></view>
          <view class="card-head">
            <view class="card-title-wrap">
              <text class="card-kicker">今日主报价</text>
              <text class="card-title">{{ selectedCrop.name }} · 今日价格</text>
            </view>
            <view class="card-actions">
              <button :class="['price-action-btn', 'voice-btn', isPlaying ? 'voice-btn-playing' : '']" @click="handleVoicePlay">
                {{ isPlaying ? '播放中...' : '语音播报' }}
              </button>
              <button class="price-action-btn rag-btn" :disabled="ragLoading" @click="handleGenerateMarketReport">
                {{ ragLoading ? '生成中...' : '行情报告' }}
              </button>
            </view>
          </view>

          <view class="price-focus">
            <view>
              <text class="price-focus__label">当前价</text>
              <text :class="['price-focus__value', selectedCrop.change >= 0 ? 'up' : 'down']">
                {{ selectedCrop.currentPrice }}
              </text>
            </view>
            <view :class="['price-focus__trend', selectedCrop.change >= 0 ? 'price-focus__trend--up' : 'price-focus__trend--down']">
              <SvgIcon :name="selectedCrop.change >= 0 ? 'trending-up' : 'trending-down'" :size="16" color="currentColor" />
              <text>{{ selectedCrop.change >= 0 ? '上涨' : '下跌' }} {{ Math.abs(selectedCrop.change) }}%</text>
            </view>
          </view>

          <view class="stats-grid">
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

        <view class="card trend-section">
          <view class="trend-section__head">
            <view class="trend-section__title-wrap">
              <text class="card-kicker">预测曲线</text>
              <text class="card-title trend-section__title">价格走势</text>
              <text class="trend-section__desc">查看近期价格变化</text>
            </view>
            <button class="trend-compare-btn" @click="toggleComparison">{{ showComparison ? '看预测' : '看对比' }}</button>
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
              <text class="card-kicker">增强解读</text>
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
            <view>
              <text class="section-title">周边市场</text>
              <text class="section-subtitle">就近查看可参考报价</text>
            </view>
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
            <view>
              <text class="section-title">AI为你推荐</text>
              <text class="section-subtitle">基于行情与作物档案的经营建议</text>
            </view>
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
import UserAvatarButton from '../../components/common/UserAvatarButton.vue'
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
    searchCropKeyword.value = ''
    uni.showToast({ title: `已切换到 ${existingCrop.name}`, icon: 'none' })
    return
  }

  const virtualCrop = createVirtualCrop(keyword)
  selectCrop(virtualCrop)
  searchCropKeyword.value = ''
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
  position: relative;
  min-height: 318rpx;
  margin: calc(20rpx + constant(safe-area-inset-top)) 24rpx 20rpx;
  margin: calc(20rpx + env(safe-area-inset-top)) 24rpx 20rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(255, 254, 247, 0.36);
  border-radius: 8rpx 42rpx 42rpx 42rpx;
  background: var(--acm-brand-primary-dark);
  box-shadow: 0 18rpx 42rpx rgba(37, 84, 58, 0.18);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 38rpx;
  overflow: hidden;
}

.header::after {
  content: '';
  position: absolute;
  right: -42rpx;
  bottom: -30rpx;
  width: 260rpx;
  height: 112rpx;
  border-radius: 999rpx;
  background:
    repeating-linear-gradient(100deg, rgba(255, 254, 247, 0.18) 0 2rpx, transparent 2rpx 19rpx),
    linear-gradient(90deg, transparent, rgba(255, 254, 247, 0.16));
  transform: rotate(-8deg);
}

.header__image,
.header__shade,
.header-toolbar,
.header-copy {
  position: relative;
  z-index: 1;
}

.header__image,
.header__shade {
  position: absolute;
  inset: 0;
}

.header__image {
  background-image: url('/static/images/page-heroes/market-hero-produce.jpg');
  background-size: cover;
  background-position: center;
  opacity: 0.9;
}

.header__shade {
  background:
    linear-gradient(180deg, rgba(23, 47, 30, 0.28) 0%, rgba(23, 47, 30, 0.5) 100%),
    linear-gradient(105deg, rgba(23, 47, 30, 0.88) 0%, rgba(37, 84, 58, 0.64) 50%, rgba(37, 84, 58, 0.14) 100%);
}

.header-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

// .header :deep(.user-avatar-button) {
//   width: 76rpx;
//   height: 70rpx;
//   flex-basis: 76rpx;
//   border-radius: 999rpx;
//   border-color: rgba(255, 254, 247, 0.82);
//   background: rgba(255, 254, 249, 0.84);
//   box-shadow: 0 8rpx 18rpx rgba(21, 44, 30, 0.13);
// }

.header-notice {
  width: 70rpx;
  height: 70rpx;
  margin: 0;
  padding: 0;
  border: 1rpx solid rgba(255, 254, 247, 0.28);
  border-radius: 22rpx;
  background: rgba(255, 254, 247, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-notice::after {
  border: 0;
}

.header-copy {
  min-width: 0;
  max-width: 520rpx;
}

.header-eyebrow {
  display: block;
  width: fit-content;
  margin-bottom: 12rpx;
  padding: 7rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(255, 254, 247, 0.18);
  color: rgba(255, 254, 247, 0.86);
  font-size: 21rpx;
  font-weight: 800;
}

.header-title {
  display: block;
  font-size: 50rpx;
  color: var(--acm-text-inverse);
  font-weight: 880;
  line-height: 1.08;
  margin-bottom: 8rpx;
}

.header-subtitle {
  display: block;
  font-size: 25rpx;
  color: rgba(255, 254, 247, 0.82);
  line-height: 1.45;
}

.header-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 18rpx;
}

.header-pill-row text {
  min-height: 42rpx;
  padding: 0 14rpx;
  border-radius: 999rpx;
  background: rgba(255, 254, 249, 0.82);
  color: var(--acm-brand-primary-dark);
  font-size: 21rpx;
  font-weight: 800;
  line-height: 42rpx;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  line-height: 1;
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
  gap: 16rpx;
  margin-bottom: 32rpx;
}

.card-title {
  font-size: 34rpx;
  color: var(--acm-text-primary);
}

.card-actions {
  flex: 0 0 auto;
  min-width: 248rpx;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 12rpx;
}

.price-action-btn {
  width: 100%;
  min-height: 64rpx;
  padding: 0 16rpx;
  border: 1rpx solid rgba(54, 125, 73, 0.16);
  border-radius: 9999rpx;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.price-action-btn::after {
  border: 0;
}

.voice-btn {
  background: var(--acm-bg-success-soft);
  color: var(--acm-primary);
  box-shadow: 0 6rpx 16rpx rgba(64, 84, 62, 0.07);
}

.voice-btn-playing {
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
}

.rag-btn {
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
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

.trend-section {
  position: relative;
}

.trend-section__head {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.trend-section__title-wrap {
  min-width: 0;
  flex: 1;
}

.trend-section__title,
.trend-section__desc {
  display: block;
}

.trend-section__desc {
  margin-top: 8rpx;
  color: var(--acm-text-muted);
  font-size: 23rpx;
  line-height: 1.35;
}

.trend-compare-btn {
  flex: 0 0 auto;
  margin: 0 8rpx 0 0;
  padding: 0 22rpx;
  min-height: 56rpx;
  border: 1rpx solid rgba(54, 125, 73, 0.18);
  border-radius: 999rpx;
  background: rgba(255, 254, 249, 0.92);
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

.trend-compare-btn::after {
  border: 0;
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
  gap: 16rpx;
}

.rec-footer > view {
  min-width: 0;
  flex: 1;
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
  flex: 0 0 auto;
  margin-left: auto;
  margin-right: 4rpx;
  transform: translateX(8rpx);
  min-height: 58rpx;
  border: 0;
  border-radius: 999rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
  font-size: 25rpx;
  font-weight: 800;
  line-height: 1;
  padding: 0 26rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.detail-btn::after {
  border: 0;
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

.tab-wrap,
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

/* Market v3: mobile agriculture price board */
.page {
  background:
    radial-gradient(circle at 82% 4%, rgba(214, 168, 58, 0.16), transparent 24%),
    linear-gradient(180deg, #f6f3ea 0%, #eef6ea 58%, #f6f3ea 100%);
}

.tab-wrap {
  position: relative;
  z-index: 3;
  margin: -4rpx 24rpx 24rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(207, 222, 202, 0.86);
  border-radius: 30rpx;
  background:
    radial-gradient(circle at 96% 0%, rgba(214, 168, 58, 0.1), transparent 28%),
    rgba(255, 254, 249, 0.96);
  box-shadow: 0 14rpx 34rpx rgba(64, 84, 62, 0.08);
  box-sizing: border-box;
  backdrop-filter: blur(8rpx);
}

.tab-wrap__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 18rpx;
}

.panel-kicker,
.panel-title,
.panel-count {
  display: block;
}

.panel-kicker {
  color: var(--acm-soil-earth);
  font-size: 22rpx;
  font-weight: 820;
  margin-bottom: 7rpx;
}

.panel-title {
  color: var(--acm-text-primary);
  font-size: 31rpx;
  font-weight: 860;
  line-height: 1.18;
}

.panel-count {
  min-height: 42rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary-dark);
  font-size: 22rpx;
  font-weight: 850;
  line-height: 42rpx;
}

.tab-search-row {
  gap: 14rpx;
  margin-bottom: 18rpx;
}

.tab-search-box {
  min-height: 74rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.7);
  border-radius: 22rpx;
  background: rgba(255, 254, 249, 0.88);
  padding: 0 18rpx;
  box-sizing: border-box;
}

.tab-search-input {
  height: 72rpx;
  font-size: 25rpx;
}

.tab-search-btn {
  min-height: 74rpx;
  margin: 0;
  border-radius: 22rpx;
  font-weight: 850;
  line-height: 1;
  padding: 0 22rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  box-shadow: 0 8rpx 18rpx rgba(37, 84, 58, 0.14);
}

.tab-search-btn::after {
  border: 0;
}

.crop-tab-row {
  gap: 14rpx;
  padding: 2rpx 2rpx 8rpx;
}

.crop-tab {
  width: 196rpx;
  min-height: 168rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.62);
  border-radius: 26rpx;
  background:
    linear-gradient(180deg, rgba(255, 254, 249, 0.9), rgba(241, 247, 237, 0.84));
  padding: 20rpx;
  box-shadow: 0 6rpx 16rpx rgba(64, 84, 62, 0.045);
  overflow: hidden;
}

.crop-tab::after {
  content: '';
  position: absolute;
  right: -34rpx;
  bottom: -26rpx;
  width: 110rpx;
  height: 72rpx;
  border-radius: 999rpx;
  background: rgba(54, 125, 73, 0.06);
  transform: rotate(-16deg);
}

.crop-tab-active {
  border-color: rgba(255, 254, 247, 0.35);
  background:
    radial-gradient(circle at 88% 12%, rgba(214, 168, 58, 0.2), transparent 28%),
    linear-gradient(160deg, rgba(54, 125, 73, 0.96), rgba(37, 84, 58, 0.98));
  box-shadow: 0 12rpx 26rpx rgba(37, 84, 58, 0.18);
  transform: translateY(-2rpx);
}

.crop-name,
.crop-price,
.crop-change {
  position: relative;
  z-index: 1;
}

.crop-name {
  font-size: 27rpx;
  font-weight: 820;
}

.crop-price {
  font-weight: 880;
}

.owned-note {
  margin-top: 8rpx;
}

.card {
  position: relative;
  border: 1rpx solid rgba(207, 222, 202, 0.86);
  border-radius: 30rpx;
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
  padding: 28rpx;
  margin-bottom: 22rpx;
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
  box-sizing: border-box;
}

.card-head {
  align-items: flex-start;
  margin-bottom: 24rpx;
}

.card-title-wrap {
  min-width: 0;
  flex: 1;
}

.card-kicker {
  display: block;
  color: var(--acm-soil-earth);
  font-size: 22rpx;
  font-weight: 820;
  margin-bottom: 8rpx;
}

.card-title {
  display: block;
  font-size: 34rpx;
  font-weight: 860;
  line-height: 1.24;
}

.price-card .card-head {
  align-items: flex-start;
  gap: 18rpx;
}

.price-card .card-title-wrap {
  min-width: 0;
  flex: 1;
  padding-right: 8rpx;
}

.price-card .card-actions {
  flex: 0 0 auto;
  width: auto;
  min-width: 292rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12rpx;
}

.price-card .price-action-btn {
  width: auto;
  min-width: 132rpx;
  min-height: 60rpx;
  margin: 0;
  padding: 0 16rpx;
  font-size: 22rpx;
  line-height: 1;
  white-space: nowrap;
  word-break: keep-all;
  flex-shrink: 0;
}

.price-card {
  border-radius: 34rpx;
  background:
    radial-gradient(circle at 100% 4%, rgba(214, 168, 58, 0.13), transparent 32%),
    linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(241, 247, 237, 0.96));
}

.price-card__grain {
  position: absolute;
  right: -42rpx;
  top: 110rpx;
  width: 240rpx;
  height: 110rpx;
  border-radius: 999rpx;
  background:
    repeating-linear-gradient(100deg, rgba(122, 101, 72, 0.08) 0 2rpx, transparent 2rpx 18rpx),
    linear-gradient(90deg, transparent, rgba(255, 254, 249, 0.64));
  transform: rotate(-8deg);
  pointer-events: none;
}

.price-focus {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 22rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.66);
  border-radius: 28rpx;
  background: rgba(255, 254, 249, 0.78);
  box-sizing: border-box;
}

.price-focus__label,
.price-focus__value {
  display: block;
}

.price-focus__label {
  color: var(--acm-text-secondary);
  font-size: 23rpx;
  margin-bottom: 8rpx;
}

.price-focus__value {
  font-size: 62rpx;
  font-weight: 900;
  line-height: 1;
}

.price-focus__trend {
  flex: 0 0 auto;
  min-height: 52rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  font-size: 23rpx;
  font-weight: 850;
}

.price-focus__trend--up {
  background: var(--acm-price-up-soft);
  color: var(--acm-price-up-text);
}

.price-focus__trend--down {
  background: var(--acm-price-down-soft);
  color: var(--acm-price-down-text);
}

.stats-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.stat-item {
  width: auto;
  min-width: 0;
  min-height: 106rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.58);
  border-radius: 22rpx;
  background: rgba(255, 254, 249, 0.72);
  padding: 16rpx 12rpx;
  text-align: left;
  box-sizing: border-box;
}

.stat-label {
  margin-bottom: 10rpx;
}

.stat-value {
  font-size: 32rpx;
  font-weight: 860;
  line-height: 1.16;
}

.meta-line {
  position: relative;
  z-index: 1;
  margin-bottom: 12rpx;
  padding: 18rpx 20rpx;
  border: 1rpx solid rgba(190, 214, 222, 0.56);
  border-radius: 22rpx;
  background: rgba(230, 241, 244, 0.58);
}

.meta-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
}

.meta-cell {
  width: auto;
  min-width: 0;
  border: 1rpx solid rgba(200, 222, 197, 0.58);
  border-radius: 22rpx;
  background: rgba(255, 254, 249, 0.7);
  padding: 18rpx;
}

.trend-section {
  background:
    radial-gradient(circle at 96% 8%, rgba(111, 167, 189, 0.12), transparent 30%),
    linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(246, 250, 242, 0.96));
}

.price-chart-container {
  margin-bottom: 18rpx;
  border-radius: 26rpx;
  padding: 12rpx 8rpx;
  box-sizing: border-box;
}

.forecast-state {
  border: 1rpx solid rgba(190, 214, 222, 0.58);
  background:
    radial-gradient(circle at 50% 16%, rgba(111, 167, 189, 0.13), transparent 34%),
    rgba(255, 254, 249, 0.72);
}

.insight {
  border-width: 1rpx;
  padding: 22rpx;
}

.report-card {
  border-color: rgba(186, 219, 189, 0.92);
  background:
    radial-gradient(circle at 96% 0%, rgba(54, 125, 73, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(238, 247, 236, 0.94));
}

.section-head {
  margin: 8rpx 8rpx 18rpx;
}

.section-title-wrap {
  align-items: flex-start;
  gap: 12rpx;
}

.section-title {
  display: block;
  font-weight: 860;
  line-height: 1.2;
}

.section-subtitle {
  display: block;
  margin-top: 7rpx;
  color: var(--acm-text-secondary);
  font-size: 23rpx;
  line-height: 1.35;
}

.market-item {
  position: relative;
  border: 1rpx solid rgba(200, 222, 197, 0.66);
  background:
    linear-gradient(180deg, rgba(255, 254, 249, 0.96), rgba(248, 251, 245, 0.92));
  border-radius: 26rpx;
  box-shadow: 0 6rpx 18rpx rgba(64, 84, 62, 0.045);
  overflow: hidden;
}

.market-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 22rpx;
  bottom: 22rpx;
  width: 6rpx;
  border-radius: 999rpx;
  background: var(--acm-brand-primary);
}

.market-price {
  font-size: 38rpx;
  font-weight: 880;
}

.rec-card {
  position: relative;
  border: 1rpx solid rgba(207, 222, 202, 0.86);
  background:
    radial-gradient(circle at 96% 0%, rgba(214, 168, 58, 0.1), transparent 28%),
    linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.94));
  border-radius: 30rpx;
  padding: 28rpx;
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
}

.rec-tag {
  border-radius: 999rpx;
}

.rec-title {
  font-size: 34rpx;
  font-weight: 860;
  line-height: 1.25;
}

.rec-reason {
  border: 1rpx solid rgba(200, 222, 197, 0.58);
  background: rgba(238, 247, 236, 0.72);
  border-radius: 18rpx;
}

.benefit-list {
  border: 1rpx solid rgba(200, 222, 197, 0.56);
  background: rgba(255, 254, 249, 0.72);
}

.rec-footer {
  border: 1rpx solid rgba(200, 222, 197, 0.62);
  background:
    linear-gradient(135deg, rgba(231, 243, 231, 0.92), rgba(255, 254, 249, 0.78));
}

.detail-btn {
  min-height: 60rpx;
}
</style>
