<template>
  <AppPage has-bottom-nav compact>
    <view class="field-command">
      <view class="field-hero">
        <view class="field-hero__image"></view>
        <view class="field-hero__shade"></view>
        <view class="field-hero__canvas">
          <FarmPatternCanvas canvas-id="my-field-hero-pattern" />
        </view>

        <view class="field-hero__nav">
          <view class="field-hero__identity">
            <UserAvatarButton />
            <view class="field-hero__title-wrap">
              <text class="field-hero__eyebrow">云上农管家 · 农场中控</text>
              <text class="field-hero__title">我的地</text>
            </view>
          </view>
          <button class="user-notice-bell acm-touchable" @click="showNotice">
            <SvgIcon name="bell" :size="20" color="var(--acm-text-secondary)" />
          </button>
        </view>

        <view class="field-hero__copy">
          <text class="field-hero__greeting">{{ greetingText }}</text>
          <text class="field-hero__desc">把天气、作物、面积和经营提醒集中到一张农场中控台。</text>
        </view>

        <view class="field-weather">
          <view class="field-weather__item">
            <SvgIcon name="thermometer-sun" :size="15" color="var(--acm-harvest-gold)" />
            <text>{{ weatherData.temp }} · {{ weatherData.condition }}</text>
          </view>
          <view class="field-weather__item">
            <SvgIcon name="droplets" :size="15" color="var(--acm-sky-data)" />
            <text>{{ weatherData.humidity }}</text>
          </view>
        </view>
      </view>

      <view class="command-panel">
        <view class="command-panel__top">
          <view class="command-panel__location">
            <SvgIcon name="map-pin" :size="14" color="var(--acm-soil-earth)" />
            <text>{{ currentLocationLabel || todayLabel }}</text>
          </view>
          <!-- <button class="command-panel__add acm-touchable" @click="goAddCrop">
            <SvgIcon name="plus" :size="16" color="var(--acm-text-inverse)" />
            <text>添加作物</text>
          </button> -->
        </view>

        <view class="command-metrics">
          <view class="metric-card metric-card--primary">
            <text class="metric-value">{{ myCrops.length }}</text>
            <text class="metric-label">作物数量</text>
          </view>
          <view class="metric-card">
            <text class="metric-value">{{ totalAreaText }}</text>
            <text class="metric-label">总面积</text>
          </view>
          <view class="metric-card">
            <text class="metric-value">{{ latestPlantDateText }}</text>
            <text class="metric-label">最近种植</text>
          </view>
          <view class="metric-card">
            <text class="metric-value">{{ pendingTaskCount }}</text>
            <text class="metric-label">待办记录</text>
          </view>
        </view>

        <view class="field-suggestion">
          <SvgIcon name="check-circle-2" :size="15" color="var(--acm-brand-primary)" />
          <text>{{ weatherData.suggestion }}</text>
        </view>
      </view>

      <view class="field-content">
        <LoadingSkeleton v-if="isLoading" type="card" :count="4" />

        <EmptyState
          v-else-if="isError"
          icon-name="cloud-off"
          title="田块数据加载失败"
          description="请检查网络后重试，已保留添加作物入口。"
          action-text="重新加载"
          @action="loadData"
        />

        <template v-else>
          <EmptyState
            v-if="hasNoData"
            icon-name="sprout"
            title="还没有添加作物"
            description="添加你的第一块地，开始记录种植信息、长势和后续上市计划。"
            action-text="添加作物"
            @action="goAddCrop"
          />

          <template v-else>
            <SectionHeader
              title="地块档案"
              description="横向切换作物，查看档案、行情和经营提醒。"
              action-text="新增"
              icon="map"
              @action="goAddCrop"
            />

            <scroll-view class="crop-strip" scroll-x :show-scrollbar="true">
              <view class="crop-strip__row">
                <view
                  v-for="crop in myCrops"
                  :key="crop.id"
                  :class="['plot-card', selectedCrop?.id === crop.id ? 'plot-card--active' : '']"
                  @click="openCrop(crop)"
                >
                  <view class="plot-card__mark">
                    <SvgIcon :name="cropIconName(crop.name)" :size="25" color="var(--acm-brand-primary-dark)" />
                  </view>
                  <text class="plot-card__name">{{ crop.name || '未填写作物' }}</text>
                  <text class="plot-card__area">{{ formatArea(crop.area) }}</text>
                  <StatusChip :type="crop.stage || 'growing'" :label="crop.stage || '生长中'" />
                </view>
              </view>
            </scroll-view>
            <text v-if="myCrops.length > 3" class="crop-strip__hint">左右滑动查看更多地块</text>

            <view v-if="selectedCrop" class="focus-board">
              <view class="focus-board__scene"></view>
              <view class="focus-board__head">
                <view class="focus-board__title-area">
                  <text class="focus-board__kicker">今日要看</text>
                  <text class="focus-board__title">{{ selectedCrop.name || '未填写作物' }}</text>
                </view>
                <view class="focus-board__stage">
                  <StatusChip :type="selectedCrop.stage || 'growing'" :label="selectedCrop.stage || '生长中'" />
                </view>
              </view>

              <view class="focus-board__grid">
                <view class="focus-cell">
                  <text class="focus-cell__label">种植面积</text>
                  <text class="focus-cell__value">{{ formatArea(selectedCrop.area) }}</text>
                </view>
                <view class="focus-cell">
                  <text class="focus-cell__label">种植时间</text>
                  <text class="focus-cell__value">{{ selectedCrop.plantDate || '待完善' }}</text>
                </view>
                <view class="focus-cell">
                  <text class="focus-cell__label">健康度</text>
                  <text class="focus-cell__value">{{ selectedCrop.health || '--' }}%</text>
                </view>
                <view class="focus-cell">
                  <text class="focus-cell__label">下一步</text>
                  <text class="focus-cell__value">{{ selectedCrop.nextTask || '待完善' }}</text>
                </view>
              </view>

              <view class="focus-actions">
                <AppButton class="focus-action-edit" text="编辑" variant="text" size="sm" icon="square-pen" @click="editCrop(selectedCrop)" />
                <AppButton class="focus-action-delete" text="删除" variant="text" size="sm" icon="trash-2" @click="confirmRemoveCrop(selectedCrop)" />
              </view>
            </view>

            <AppCard v-if="selectedCrop" class="market-card" title="行情摘要" subtitle="与当前作物名称匹配后展示">
              <view v-if="selectedMarketCrop" class="market-summary">
                <view>
                  <text class="market-price">{{ selectedMarketCrop.currentPrice }}元/{{ selectedMarketCrop.unit }}</text>
                  <StatusChip :type="selectedMarketCrop.trend" :label="trendText(selectedMarketCrop.trend)" show-icon />
                </view>
                <text class="market-copy">{{ selectedMarketCrop.marketStatus }} · {{ selectedMarketCrop.advice || '建议结合本地询价分批出货' }}</text>
              </view>
              <view v-else class="market-empty">
                <text>暂无行情</text>
                <text>该作物暂未匹配到参考行情，可在“查行情”中关注后续价格数据。</text>
              </view>
            </AppCard>

            <AppCard v-if="selectedCrop" class="tips-card" title="近期经营提醒" subtitle="把巡田、养护和经营动作收束到今天">
              <view class="tips-command">
                <view class="tips-command__photo"></view>
                <view class="tips-command__copy">
                  <text>今日动作板</text>
                  <text>优先处理能影响作物状态和出货节奏的事项。</text>
                </view>
              </view>
              <view class="tip-list">
                <view v-for="(tip, index) in selectedBusinessTips" :key="index" class="business-tip">
                  <SvgIcon name="check-circle-2" :size="16" color="var(--acm-brand-primary)" />
                  <text>{{ tip }}</text>
                </view>
              </view>
            </AppCard>
          </template>
        </template>
      </view>
    </view>

  </AppPage>

  <BottomNav />
  <AssistantFloat current-page="/pages/my-field/index" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import AppPage from '../../components/common/AppPage.vue'
import AppCard from '../../components/common/AppCard.vue'
import AppButton from '../../components/common/AppButton.vue'
import EmptyState from '../../components/common/EmptyState.vue'
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue'
import SectionHeader from '../../components/common/SectionHeader.vue'
import StatusChip from '../../components/common/StatusChip.vue'
import UserAvatarButton from '../../components/common/UserAvatarButton.vue'
import FarmPatternCanvas from '../../components/visual/FarmPatternCanvas.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import BottomNav from '../../components/layout/BottomNav.vue'
import AssistantFloat from '../../components/assistant/AssistantFloat.vue'
import { getMarketData, getMyFieldData, removeMyFieldCrop, type CropInfo, type MarketCropItem } from '../../api/agri'
import { getCurrentLocationPayload } from '../../utils/location'

interface WeatherInfo {
  temp: string
  condition: string
  humidity: string
  wind: string
  suggestion: string
  city?: string
  locationAddress?: string
}

const myCrops = ref<CropInfo[]>([])
const marketCrops = ref<MarketCropItem[]>([])
const selectedCrop = ref<CropInfo | null>(null)
const isLoading = ref(true)
const isError = ref(false)
const weatherData = ref<WeatherInfo>({
  temp: '--',
  condition: '--',
  humidity: '--',
  wind: '--',
  suggestion: '天气数据加载后，将给出田间作业建议。',
})

const modalDangerColor = '#bd554d'

const normalizeCropName = (name: string) => {
  return String(name || '').trim().replace(/\s+/g, '').replace(/树$/, '')
}

const parseNumber = (value: unknown) => {
  const numeric = Number(String(value || '').replace(/[^\d.]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

const formatArea = (area?: string) => {
  const text = String(area || '').trim()
  if (!text) return '待完善'
  return text.includes('亩') ? text : `${text}亩`
}

const cropIconName = (name: string) => {
  const normalized = normalizeCropName(name)
  if (normalized.includes('玉米')) return 'crop-corn'
  if (normalized.includes('番茄') || normalized.includes('西红柿')) return 'crop-tomato'
  if (normalized.includes('土豆') || normalized.includes('马铃薯')) return 'crop-potato'
  if (normalized.includes('白菜') || normalized.includes('甘蓝')) return 'crop-cabbage'
  if (normalized.includes('黄瓜')) return 'crop-cucumber'
  return 'sprout'
}

const currentLocationLabel = computed(() => {
  if (weatherData.value.city && weatherData.value.locationAddress) {
    return `${weatherData.value.city} · ${weatherData.value.locationAddress}`
  }
  if (weatherData.value.city) return `当前区域：${weatherData.value.city}`
  if (weatherData.value.locationAddress) return `当前位置：${weatherData.value.locationAddress}`
  return ''
})

const todayLabel = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
})

const greetingText = computed(() => {
  const hour = new Date().getHours()
  if (hour < 11) return '早上好，开始今天的巡田'
  if (hour < 18) return '下午好，关注作物变化'
  return '晚上好，整理今天的记录'
})

const hasNoData = computed(() => myCrops.value.length === 0)

const totalAreaText = computed(() => {
  const total = myCrops.value.reduce((sum, crop) => sum + parseNumber(crop.area), 0)
  return total ? `${formatNumber(total)}亩` : '待完善'
})

const latestPlantDateText = computed(() => {
  const values = myCrops.value.map((crop) => String(crop.plantDate || '').trim()).filter(Boolean)
  return values[0] || '待完善'
})

const pendingTaskCount = computed(() => {
  return myCrops.value.filter((crop) => String(crop.nextTask || '').trim()).length
})

const findMarketCrop = (crop: CropInfo | null) => {
  if (!crop) return null
  const normalized = normalizeCropName(crop.name)
  return marketCrops.value.find((item) => normalizeCropName(item.name) === normalized) || null
}

const selectedMarketCrop = computed(() => findMarketCrop(selectedCrop.value))

const trendText = (trend: MarketCropItem['trend']) => {
  if (trend === 'up') return '价格上涨'
  if (trend === 'down') return '价格下跌'
  return '价格持平'
}

const selectedBusinessTips = computed(() => {
  const crop = selectedCrop.value
  if (!crop) return []

  const tips: string[] = []
  const marketCrop = selectedMarketCrop.value

  if (crop.nextTask) {
    tips.push(`下一步建议：${crop.nextTask}，完成后及时更新作物档案。`)
  }

  if (crop.health && crop.health < 80) {
    tips.push('健康度偏低，建议优先巡查叶片、土壤湿度和病虫害情况。')
  }

  if (marketCrop?.trend === 'up') {
    tips.push('当前价格处于上涨状态，可继续关注行情变化，并留意高价收购窗口。')
  }

  if (marketCrop?.trend === 'down') {
    tips.push('当前价格有下跌趋势，可提前关注收购商报价，减少临近上市时的议价压力。')
  }

  if (marketCrop?.trend === 'stable') {
    tips.push('当前价格相对平稳，可结合预计上市时间分批询价，提前锁定稳定销路。')
  }

  if (!marketCrop) {
    tips.push('暂未匹配到参考行情，可先完善作物名称，便于后续连接查行情与销路匹配。')
  }

  return tips.slice(0, 3)
})

const loadData = async () => {
  isLoading.value = true
  isError.value = false
  try {
    const location = await getCurrentLocationPayload()
    const [fieldData, marketData] = await Promise.all([getMyFieldData(location || undefined), getMarketData()])

    myCrops.value = fieldData.crops || []
    marketCrops.value = marketData.crops || []
    weatherData.value = fieldData.weather
    selectedCrop.value = myCrops.value[0] || null
  } catch (_error) {
    isError.value = true
    uni.showToast({ title: '加载失败，请重试', icon: 'none' })
  } finally {
    isLoading.value = false
    uni.stopPullDownRefresh()
  }
}

onLoad(() => {
  void loadData()
})

onPullDownRefresh(() => {
  void loadData()
})

const showNotice = () => {
  uni.navigateTo({ url: '/pages/notification/index' })
}

const goAddCrop = () => {
  uni.navigateTo({ url: '/pages/add-crop/index' })
}

const openCrop = (crop: CropInfo) => {
  selectedCrop.value = crop
}

const editCrop = (crop: CropInfo) => {
  selectedCrop.value = crop
  const parts = [
    `editMode=true`,
    `id=${crop.id}`,
    `name=${encodeURIComponent(crop.name)}`,
    `area=${encodeURIComponent(String(crop.area || ''))}`,
    `plantDate=${encodeURIComponent(String(crop.plantDate || ''))}`,
    `stage=${encodeURIComponent(String(crop.stage || ''))}`,
  ]
  if (crop.location) parts.push(`location=${encodeURIComponent(crop.location)}`)
  if (crop.expectedYield) parts.push(`expectedYield=${crop.expectedYield}`)
  if (crop.yieldUnit) parts.push(`yieldUnit=${encodeURIComponent(crop.yieldUnit)}`)
  if (crop.expectedMarketTime) parts.push(`expectedMarketTime=${encodeURIComponent(crop.expectedMarketTime)}`)
  uni.navigateTo({ url: `/pages/add-crop/index?${parts.join('&')}` })
}

const confirmRemoveCrop = (crop: CropInfo) => {
  uni.showModal({
    title: '删除作物',
    content: `确认删除“${crop.name || '该作物'}”吗？删除后可重新添加。`,
    confirmText: '删除',
    cancelText: '取消',
    confirmColor: modalDangerColor,
    success: async (res) => {
      if (!res.confirm) return

      try {
        await removeMyFieldCrop(crop.id, crop.name)
        myCrops.value = myCrops.value.filter((item) => item.id !== crop.id)

        if (selectedCrop.value?.id === crop.id) {
          selectedCrop.value = myCrops.value[0] || null
        }

        uni.showToast({ title: '已删除', icon: 'success' })
      } catch (_error) {
        uni.showToast({ title: '删除失败', icon: 'none' })
      }
    },
  })
}
</script>

<style scoped lang="scss">
.field-command {
  min-height: 100%;
  background:
    radial-gradient(circle at 82% 4%, rgba(214, 168, 58, 0.2), transparent 28%),
    var(--acm-bg-app);
}

.field-hero {
  position: relative;
  min-height: 480rpx;
  padding: calc(30rpx + constant(safe-area-inset-top)) var(--acm-space-hero-x) 126rpx;
  padding: calc(30rpx + env(safe-area-inset-top)) var(--acm-space-hero-x) 126rpx;
  box-sizing: border-box;
  overflow: hidden;
  border-bottom-left-radius: var(--acm-radius-hero);
  border-bottom-right-radius: var(--acm-radius-hero);
  background: var(--acm-bg-field-hero-fallback);
  box-shadow: 0 18rpx 48rpx rgba(37, 84, 58, 0.13);
}

.field-hero__image {
  position: absolute;
  inset: 0;
  background-image: url('/static/images/field-command/field-hero-cabbage.jpg');
  background-size: cover;
  background-position: center 42%;
  opacity: 0.86;
}

.field-hero__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(18, 47, 28, 0.43) 0%, rgba(24, 68, 39, 0.2) 43%, rgba(246, 243, 234, 0.03) 100%),
    linear-gradient(90deg, rgba(22, 54, 32, 0.46) 0%, rgba(22, 54, 32, 0.1) 60%, rgba(22, 54, 32, 0.24) 100%);
}

.field-hero__canvas {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 190rpx;
  opacity: 0.72;
  pointer-events: none;
}

.field-hero__nav,
.field-hero__copy,
.field-weather {
  position: relative;
  z-index: 1;
}

.field-hero__nav {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
}

.field-hero__identity {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
}

.field-hero__title-wrap {
  min-width: 0;
  flex: 1;
}

.field-hero__eyebrow {
  display: block;
  width: fit-content;
  border: 1rpx solid rgba(255, 254, 247, 0.28);
  border-radius: 999rpx;
  background: rgba(255, 254, 249, 0.14);
  color: rgba(255, 254, 247, 0.86);
  font-size: 22rpx;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.2;
  padding: 8rpx 14rpx;
}

.field-hero__title {
  display: block;
  margin-top: 14rpx;
  color: var(--acm-text-inverse);
  font-size: 48rpx;
  font-weight: 850;
  line-height: 1.08;
}

.field-hero__copy {
  width: 78%;
  margin-top: 64rpx;
}

.field-hero__greeting {
  display: block;
  color: var(--acm-text-inverse);
  font-size: 38rpx;
  font-weight: 820;
  line-height: 1.18;
}

.field-hero__desc {
  display: block;
  margin-top: 14rpx;
  color: rgba(255, 254, 247, 0.78);
  font-size: 26rpx;
  line-height: 1.5;
}

.field-weather {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 26rpx;
}

.field-weather__item {
  min-height: 52rpx;
  border: 1rpx solid rgba(255, 254, 247, 0.42);
  border-radius: 999rpx;
  background: rgba(255, 254, 249, 0.74);
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 0 18rpx;
  color: var(--acm-brand-primary-dark);
  font-size: var(--acm-font-caption);
  font-weight: 700;
  box-sizing: border-box;
}

.command-panel {
  position: relative;
  z-index: 2;
  margin: -92rpx var(--acm-space-page-x) 26rpx;
  border: 2rpx solid rgba(229, 223, 208, 0.9);
  border-radius: 36rpx;
  background: rgba(255, 254, 249, 0.96);
  box-shadow: 0 14rpx 34rpx rgba(64, 84, 62, 0.09);
  padding: 20rpx;
  box-sizing: border-box;
}

.command-panel__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 16rpx;
}

.command-panel__location {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: var(--acm-text-regular);
  font-size: var(--acm-font-caption);
  line-height: 1.35;
}

.command-panel__location text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-panel__add {
  flex-shrink: 0;
  min-height: 58rpx;
  border: 0;
  border-radius: 22rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 0 18rpx;
  font-size: 24rpx;
  font-weight: 800;
  box-shadow: 0 8rpx 18rpx rgba(54, 125, 73, 0.14);
}

.command-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
}

.metric-card {
  min-height: 102rpx;
  border-radius: 22rpx;
  background: var(--acm-bg-card-soft);
  padding: 16rpx 18rpx;
  box-sizing: border-box;
}

.metric-card--primary {
  background: linear-gradient(145deg, #eef7ec 0%, #dcefdc 100%);
  border: 1rpx solid rgba(54, 125, 73, 0.16);
}

.metric-value {
  display: block;
  color: var(--acm-brand-primary-dark);
  font-size: 32rpx;
  font-weight: 850;
  line-height: 1.15;
}

.metric-card--primary .metric-value,
.metric-card--primary .metric-label {
  color: var(--acm-brand-primary-dark);
}

.metric-label {
  display: block;
  margin-top: 6rpx;
  color: var(--acm-text-secondary);
  font-size: var(--acm-font-caption);
  line-height: 1.25;
}

.field-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  margin-top: 14rpx;
  border-top: 2rpx solid var(--acm-border-soft);
  padding-top: 14rpx;
  color: var(--acm-text-regular);
  font-size: var(--acm-font-caption);
  line-height: 1.5;
}

.field-content {
  padding: 0 var(--acm-space-page-x);
}

.crop-strip {
  width: 100%;
  margin-bottom: 24rpx;
  overflow: hidden;
}

.crop-strip__row {
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 16rpx;
  min-width: max-content;
  padding: 4rpx 4rpx 14rpx;
}

.crop-strip__hint {
  display: block;
  margin: -12rpx 0 20rpx;
  color: var(--acm-text-secondary);
  font-size: 22rpx;
  text-align: center;
}

/* #ifdef H5 */
.crop-strip :deep(.uni-scroll-view),
.crop-strip :deep(.uni-scroll-view-content) {
  overflow-x: auto !important;
}

.crop-strip :deep(.uni-scroll-view::-webkit-scrollbar) {
  height: 6rpx;
}

.crop-strip :deep(.uni-scroll-view::-webkit-scrollbar-track) {
  background: rgba(214, 226, 206, 0.5);
  border-radius: 999rpx;
}

.crop-strip :deep(.uni-scroll-view::-webkit-scrollbar-thumb) {
  background: rgba(54, 125, 73, 0.35);
  border-radius: 999rpx;
}
/* #endif */

.plot-card {
  position: relative;
  width: 238rpx;
  min-height: 204rpx;
  flex-shrink: 0;
  border: 2rpx solid var(--acm-border-soft);
  border-radius: 30rpx;
  background:
    linear-gradient(160deg, rgba(255, 254, 249, 0.96), rgba(241, 247, 237, 0.9)),
    var(--acm-bg-card);
  box-shadow: 0 5rpx 18rpx rgba(64, 84, 62, 0.055);
  padding: 20rpx;
  box-sizing: border-box;
  overflow: hidden;
}

.plot-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(180deg, rgba(255, 254, 249, 0.82), rgba(255, 254, 249, 0.94)),
    url('/static/images/field-command/field-hero-cabbage.jpg');
  background-size: cover;
  background-position: center 58%;
  opacity: 0.42;
}

.plot-card::after {
  content: '';
  position: absolute;
  right: -28rpx;
  bottom: -20rpx;
  width: 120rpx;
  height: 88rpx;
  border-radius: 999rpx;
  background: rgba(54, 125, 73, 0.07);
  transform: rotate(-18deg);
}

.plot-card--active {
  border-color: rgba(54, 125, 73, 0.38);
  background:
    radial-gradient(circle at 86% 8%, rgba(214, 168, 58, 0.18), transparent 30%),
    linear-gradient(160deg, rgba(255, 254, 249, 1), rgba(232, 244, 232, 0.98));
  box-shadow: 0 12rpx 28rpx rgba(54, 125, 73, 0.11);
  transform: translateY(-3rpx);
}

.plot-card--active::before {
  opacity: 0.52;
}

.plot-card__mark {
  position: relative;
  z-index: 1;
  width: 64rpx;
  height: 64rpx;
  border: 1rpx solid rgba(54, 125, 73, 0.14);
  border-radius: 22rpx;
  background: rgba(238, 247, 236, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14rpx;
}

.plot-card__name {
  position: relative;
  z-index: 1;
  display: block;
  color: var(--acm-text-primary);
  font-size: 30rpx;
  font-weight: 850;
  line-height: 1.2;
}

.plot-card__area {
  position: relative;
  z-index: 1;
  display: block;
  margin: 7rpx 0 14rpx;
  color: var(--acm-text-secondary);
  font-size: var(--acm-font-caption);
}

.plot-card :deep(.status-chip) {
  position: absolute;
  top: 20rpx;
  right: 20rpx;
  z-index: 1;
  min-height: 36rpx;
  padding: 0 10rpx;
  font-size: 20rpx;
}

.focus-board {
  position: relative;
  margin-bottom: 24rpx;
  border-radius: 34rpx;
  background:
    linear-gradient(145deg, rgba(255, 254, 249, 0.98), rgba(244, 250, 241, 0.97) 58%, rgba(236, 246, 234, 0.96));
  border: 1rpx solid rgba(199, 218, 193, 0.86);
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
  padding: 24rpx;
  box-sizing: border-box;
  overflow: hidden;
}

.focus-board::before {
  content: '';
  position: absolute;
  right: 18rpx;
  bottom: 20rpx;
  width: 210rpx;
  height: 88rpx;
  border-radius: 999rpx;
  background:
    repeating-linear-gradient(100deg, rgba(122, 101, 72, 0.08) 0 2rpx, transparent 2rpx 17rpx),
    linear-gradient(90deg, rgba(255, 254, 249, 0), rgba(255, 254, 249, 0.62));
  opacity: 0.42;
  transform: rotate(-7deg);
}

.focus-board__scene {
  position: absolute;
  top: 0;
  right: 0;
  width: 265rpx;
  height: 170rpx;
  border-radius: 0 34rpx 0 96rpx;
  background:
    linear-gradient(90deg, rgba(255, 254, 249, 0.86), rgba(255, 254, 249, 0.18)),
    linear-gradient(180deg, rgba(255, 254, 249, 0.34), rgba(34, 52, 36, 0.2)),
    url('/static/images/field-command/field-focus-orchard.jpg');
  background-size: cover;
  background-position: center;
  box-shadow: none;
  opacity: 0.45;
  pointer-events: none;
}

.focus-board__head {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 18rpx;
  padding-right: 0;
}

.focus-board__title-area {
  min-width: 0;
  flex: 1;
}

.focus-board__stage {
  flex: 0 0 auto;
  margin-left: auto;
  transform: translateX(8rpx);
  max-width: 132rpx;
  display: flex;
  justify-content: flex-end;
}

.focus-board__stage :deep(.status-chip) {
  min-height: 44rpx;
  max-width: 132rpx;
  padding: 0 14rpx;
  border-radius: 999rpx;
  white-space: nowrap;
  overflow: hidden;
  box-sizing: border-box;
}

.focus-board__stage :deep(text) {
  max-width: 76rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-board__kicker {
  display: block;
  color: var(--acm-soil-earth);
  font-size: var(--acm-font-caption);
  font-weight: 800;
  margin-bottom: 8rpx;
}

.focus-board__title {
  display: block;
  color: var(--acm-brand-primary-dark);
  font-size: 38rpx;
  font-weight: 860;
  line-height: 1.12;
}

.focus-board__grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10rpx;
}

.focus-cell {
  min-height: 80rpx;
  border-radius: 18rpx;
  background: rgba(255, 254, 249, 0.76);
  border: 1rpx solid rgba(214, 226, 206, 0.58);
  padding: 13rpx 16rpx;
  box-sizing: border-box;
  box-shadow: none;
}

.focus-cell__label {
  display: block;
  color: var(--acm-text-secondary);
  font-size: var(--acm-font-caption);
  margin-bottom: 5rpx;
}

.focus-cell__value {
  display: block;
  color: var(--acm-text-primary);
  font-size: 27rpx;
  font-weight: 800;
  line-height: 1.28;
}

.focus-actions {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 20rpx;
}

.focus-actions :deep(.app-button) {
  min-height: 60rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  box-sizing: border-box;
  font-weight: 800;
}

.focus-actions :deep(.app-button--text) {
  background: rgba(255, 254, 249, 0.92);
  border: 1rpx solid rgba(54, 125, 73, 0.18);
  color: var(--acm-brand-primary-dark);
  box-shadow: 0 6rpx 16rpx rgba(64, 84, 62, 0.07);
}

.focus-actions :deep(.app-button--text)::after {
  border: 0;
}

.focus-actions :deep(.focus-action-delete) {
  color: #b9554f;
  border-color: rgba(185, 85, 79, 0.22);
  background: rgba(255, 244, 242, 0.92);
}

.market-card,
.tips-card {
  margin-bottom: 24rpx;
  position: relative;
  overflow: hidden;
  border-color: rgba(207, 222, 202, 0.86);
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
}

.market-card::before,
.tips-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.market-card::before {
  background:
    linear-gradient(90deg, rgba(255, 254, 249, 0.99) 0%, rgba(255, 254, 249, 0.96) 66%, rgba(255, 254, 249, 0.72) 100%),
    url('/static/images/field-command/field-market-tomatoes.jpg');
  background-size: cover;
  background-position: right center;
  opacity: 0.92;
}

.tips-card::before {
  background:
    linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(255, 254, 249, 0.95)),
    radial-gradient(circle at 92% 8%, rgba(214, 168, 58, 0.08), transparent 28%),
    url('/static/images/field-command/field-focus-orchard.jpg');
  background-size: auto, auto, cover;
  background-position: center, center, right top;
  opacity: 0.96;
}

.market-card :deep(.app-card__head),
.market-card .market-summary,
.market-card .market-empty,
.tips-card :deep(.app-card__head),
.tips-card .tips-command,
.tips-card .tip-list {
  position: relative;
  z-index: 1;
}

.market-card :deep(.app-card__head),
.tips-card :deep(.app-card__head) {
  margin-bottom: 18rpx;
}

.market-card :deep(.app-card__subtitle),
.tips-card :deep(.app-card__subtitle) {
  max-width: 430rpx;
}

.market-summary {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  border-radius: 22rpx;
  background:
    linear-gradient(135deg, rgba(238, 246, 242, 0.92), rgba(255, 254, 249, 0.78));
  border: 1rpx solid rgba(200, 222, 197, 0.62);
  padding: 18rpx;
  box-sizing: border-box;
  backdrop-filter: blur(8rpx);
}

.market-summary > view {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.market-price {
  color: var(--acm-text-primary);
  font-size: 33rpx;
  font-weight: 850;
}

.market-copy {
  color: var(--acm-info-text);
  font-size: 26rpx;
  line-height: 1.5;
}

.market-empty {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  border-radius: 24rpx;
  background: rgba(230, 241, 244, 0.74);
  border: 1rpx solid rgba(190, 214, 222, 0.68);
  padding: 18rpx;
  color: var(--acm-info-text);
  font-size: 26rpx;
  line-height: 1.5;
  backdrop-filter: blur(8rpx);
}

.tips-command {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
  margin-bottom: 16rpx;
  border-radius: 22rpx;
  background: rgba(255, 254, 249, 0.74);
  border: 1rpx solid rgba(214, 226, 206, 0.58);
  padding: 12rpx;
  box-sizing: border-box;
  backdrop-filter: blur(6rpx);
}

.tips-command__photo {
  width: 116rpx;
  min-height: 104rpx;
  border-radius: 18rpx;
  background:
    linear-gradient(180deg, rgba(255, 254, 249, 0.12), rgba(53, 77, 45, 0.2)),
    url('/static/images/field-command/field-focus-orchard.jpg');
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}

.tips-command__copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8rpx;
}

.tips-command__copy text:first-child {
  color: var(--acm-text-primary);
  font-size: 28rpx;
  font-weight: 820;
}

.tips-command__copy text:last-child {
  color: var(--acm-text-secondary);
  font-size: 24rpx;
  line-height: 1.45;
}

.tip-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.business-tip {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.52);
  border-radius: 18rpx;
  background: rgba(255, 254, 249, 0.7);
  color: var(--acm-text-regular);
  font-size: 26rpx;
  line-height: 1.5;
  padding: 15rpx 17rpx;
  backdrop-filter: blur(6rpx);
}

</style>
