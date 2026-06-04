<template>
  <view class="page">
    <scroll-view class="page-scroll" scroll-y :show-scrollbar="false">
      <view class="header">
        <view>
          <text class="header-title">营销助手</text>
          <text class="header-subtitle">农产品推广文案与询价话术</text>
        </view>
        <button class="user-notice-bell" @click="showNotice">
          <SvgIcon name="bell" :size="20" color="var(--acm-text-secondary)" />
        </button>
      </view>

      <view class="content">
        <view class="card">
          <view class="hero-card">
            <view class="hero-copy">
              <text class="hero-eyebrow">销售辅助工具</text>
              <text class="hero-title">输入产品特点，一键生成适合销售的推广文案</text>
              <text class="hero-desc">内容基于作物档案、行情和已选择卖点生成，发布前请按真实情况核对。</text>
            </view>
            <view class="hero-mark">
              <SvgIcon name="wheat" :size="30" color="var(--acm-fruit-orange)" />
            </view>
          </view>

          <view class="card-head">
            <text class="card-title">待推广产品</text>
            <button class="text-btn" @click="goAddCrop">去完善</button>
          </view>

          <EmptyState
            v-if="!selectedProduct"
            title="暂无待推广产品"
            description="请先在“我的地”中添加作物、预期产出和预计上市时间，系统将据此生成营销素材。"
            action-text="去添加作物"
            @action="goAddCrop"
          />

          <template v-else>
            <scroll-view v-if="products.length > 1" class="product-tabs" scroll-x>
              <view class="tab-row">
                <view
                  v-for="product in products"
                  :key="product.id"
                  :class="['tab-item', selectedProduct.id === product.id ? 'tab-item-active' : '']"
                  @click="selectProduct(product.id)"
                >
                  <text>{{ product.name }}</text>
                </view>
              </view>
            </scroll-view>

            <view class="product-card">
              <view class="product-title-row">
                <view class="product-name">
                  <SvgIcon name="package" :size="16" color="var(--acm-primary)" />
                  <text>{{ selectedProduct.name || '未填写' }}</text>
                </view>
                <text class="completeness">素材完整度：{{ previewCompleteness }}%</text>
              </view>
              <view class="product-grid">
                <text>预期产出：{{ formatYield(selectedProduct) }}</text>
                <text>预计上市：{{ selectedProduct.expectedMarketTime || '待完善' }}</text>
                <text>所在地：{{ selectedProduct.location || '待完善' }}</text>
                <text>参考行情：{{ marketPriceText }}</text>
              </view>
            </view>
          </template>
        </view>

        <view class="card">
          <view class="card-head">
            <text class="card-title">推广目标</text>
          </view>
          <view class="goal-grid">
            <view
              v-for="goal in goalOptions"
              :key="goal.value"
              :class="['goal-item', selectedGoal === goal.value ? 'goal-item-active' : '']"
              @click="selectedGoal = goal.value"
            >
              <text class="goal-title">{{ goal.label }}</text>
              <text class="goal-desc">{{ goal.desc }}</text>
            </view>
          </view>
        </view>

        <view class="card">
          <view class="card-head">
            <text class="card-title">可信卖点</text>
            <text class="card-note">可直接使用</text>
          </view>
          <view class="point-list">
            <view
              v-for="point in safeSellingPoints"
              :key="point"
              :class="['point-chip', selectedSellingPoints.includes(point) ? 'point-chip-active' : '']"
              @click="toggleSellingPoint(point)"
            >
              <text>{{ point }}</text>
            </view>
          </view>

          <view class="proof-box">
            <text class="proof-title">需要证明后使用</text>
            <text class="proof-text">认证类、检测类、品牌授权类描述，请在有材料时再加入公开文案。</text>
          </view>

          <view class="safe-tip">
            <SvgIcon name="shield-check" :size="16" color="var(--acm-primary)" />
            <text>系统将仅基于已填写档案和已选择卖点生成内容，避免使用未证明的认证类描述。</text>
          </view>
        </view>

        <AppButton
          text="生成素材包"
          loading-text="正在生成文案"
          icon="sparkles"
          variant="harvest"
          block
          :loading="isGenerating"
          :disabled="!selectedProduct"
          @click="handleGenerate"
        />

        <view v-if="materialPackage" class="result-wrap">
          <view class="section-head">
            <view class="section-title-wrap">
              <SvgIcon name="files" :size="18" color="var(--acm-primary)" />
              <text class="section-title">生成结果</text>
            </view>
            <button class="text-btn" @click="copyAllMaterials">复制全部</button>
          </view>

          <view class="material-card">
            <view class="material-head">
              <text class="material-title">商品标题</text>
              <button class="copy-btn" @click="copyText(materialPackage.productTitle)">复制</button>
            </view>
            <text class="material-content">{{ materialPackage.productTitle }}</text>
          </view>

          <view class="material-card">
            <view class="material-head">
              <text class="material-title">朋友圈文案</text>
              <button class="copy-btn" @click="copyText(materialPackage.wechatCopy)">复制</button>
            </view>
            <text class="material-content">{{ materialPackage.wechatCopy }}</text>
          </view>

          <view class="material-card">
            <view class="material-head">
              <text class="material-title">短视频口播</text>
              <button class="copy-btn" @click="copyText(materialPackage.shortVideoScript)">复制</button>
            </view>
            <text class="material-content">{{ materialPackage.shortVideoScript }}</text>
          </view>

          <view class="material-card">
            <view class="material-head">
              <text class="material-title">收购商询价话术</text>
              <button class="copy-btn" @click="copyText(materialPackage.inquiryScript)">复制</button>
            </view>
            <text class="material-content">{{ materialPackage.inquiryScript }}</text>
          </view>

          <view class="material-card">
            <view class="material-head">
              <text class="material-title">配图建议</text>
              <button class="copy-btn" @click="copyText(materialPackage.imageSuggestions.join('\n'))">复制</button>
            </view>
            <text v-for="(item, index) in materialPackage.imageSuggestions" :key="index" class="list-line">
              {{ index + 1 }}. {{ item }}
            </text>
          </view>

          <view class="material-card">
            <view class="material-head">
              <text class="material-title">标签建议</text>
              <button class="copy-btn" @click="copyText(materialPackage.tags.join(' '))">复制</button>
            </view>
            <view class="tag-list">
              <text v-for="tag in materialPackage.tags" :key="tag" class="tag">{{ tag }}</text>
            </view>
          </view>

          <view class="compliance-card">
            <view class="material-head">
              <text class="material-title">合规提醒</text>
              <button class="copy-btn" @click="copyText(materialPackage.complianceTips.join('\n'))">复制</button>
            </view>
            <text v-for="(item, index) in materialPackage.complianceTips" :key="index" class="list-line">
              {{ index + 1 }}. {{ item }}
            </text>
          </view>
        </view>

        <EmptyState
          v-else
          icon-name="sparkles"
          title="还没有生成推广文案"
          description="选择待推广产品、推广目标和可信卖点后，即可生成标题、朋友圈文案、口播和询价话术。"
        />

        <view class="bottom-text">基于作物档案生成 · 发布前请按真实情况核对</view>
      </view>
    </scroll-view>
    <BottomNav />
    <AssistantFloat current-page="/pages/ads/index" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppButton from '../../components/common/AppButton.vue'
import EmptyState from '../../components/common/EmptyState.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import BottomNav from '../../components/layout/BottomNav.vue'
import AssistantFloat from '../../components/assistant/AssistantFloat.vue'
import {
  generateMarketingMaterials,
  getMarketData,
  getMyFieldData,
  type CropInfo,
  type MarketCropItem,
  type MarketingGoal,
  type MarketingMaterialPackage,
} from '../../api/agri'

interface MarketingProduct extends CropInfo {
  marketPrice?: number
  marketUnit?: string
}

const products = ref<MarketingProduct[]>([])
const marketCrops = ref<MarketCropItem[]>([])
const selectedProductId = ref<number | null>(null)
const selectedGoal = ref<MarketingGoal>('buyer')
const selectedSellingPoints = ref<string[]>(['产地直发', '可提供实拍图', '预计上市时间明确'])
const targetBuyerName = ref('')
const materialPackage = ref<MarketingMaterialPackage | null>(null)
const isGenerating = ref(false)

const goalOptions: Array<{ value: MarketingGoal; label: string; desc: string }> = [
  { value: 'buyer', label: '找收购商', desc: '询价、起收量、结算方式' },
  { value: 'wechat', label: '朋友圈零售', desc: '熟人转发、团购引导' },
  { value: 'video', label: '短视频带货', desc: '口播脚本、行动引导' },
  { value: 'group', label: '社群团购', desc: '接龙文案、配送说明' },
]

const safeSellingPoints = [
  '产地直发',
  '当季采摘',
  '支持批发',
  '可提供实拍图',
  '可预约采摘',
  '支持同城配送',
  '预计上市时间明确',
  '可提前预订',
]

const normalizeCropName = (name: string) => {
  return String(name || '').trim().replace(/\s+/g, '').replace(/树$/, '')
}

const selectedProduct = computed(() => {
  if (!products.value.length) return null
  return products.value.find((item) => item.id === selectedProductId.value) || products.value[0]
})

const matchedMarket = computed(() => {
  const product = selectedProduct.value
  if (!product) return null
  const normalized = normalizeCropName(product.name)
  return marketCrops.value.find((item) => normalizeCropName(item.name) === normalized) || null
})

const marketPriceText = computed(() => {
  const market = matchedMarket.value
  if (!market?.currentPrice) return '暂无行情'
  return `${market.currentPrice}元/${market.unit || '斤'}`
})

const previewCompleteness = computed(() => {
  const product = selectedProduct.value
  if (!product) return 0
  return [
    product.name,
    product.location,
    Number(product.expectedYield || 0) > 0,
    product.expectedMarketTime,
    selectedSellingPoints.value.length,
  ].filter(Boolean).length * 20
})

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0'
  return (Number.isInteger(value) ? value : Number(value.toFixed(1))).toLocaleString('zh-CN')
}

const formatYield = (product: MarketingProduct) => {
  const expectedYield = Number(product.expectedYield || 0)
  if (!expectedYield) return '待完善'
  return `${formatNumber(expectedYield)}${product.yieldUnit || '斤'}`
}

const buildRouteProduct = (options: Record<string, any>) => {
  const productName = String(options.productName || options.name || '').trim()
  if (!productName) return null
  return {
    id: -Date.now(),
    name: decodeURIComponent(productName),
    area: String(options.area || ''),
    expectedYield: Number(options.expectedYield || 0),
    yieldUnit: String(options.yieldUnit || '斤'),
    expectedMarketTime: options.expectedMarketTime ? decodeURIComponent(String(options.expectedMarketTime)) : '',
    location: options.location ? decodeURIComponent(String(options.location)) : '',
  } as MarketingProduct
}

const loadData = async (options: Record<string, any> = {}) => {
  uni.showLoading({ title: '加载中...' })
  try {
    if (options.goal && ['buyer', 'wechat', 'video', 'group'].includes(String(options.goal))) {
      selectedGoal.value = String(options.goal) as MarketingGoal
    }
    if (options.targetBuyerName) {
      targetBuyerName.value = decodeURIComponent(String(options.targetBuyerName))
    }

    const routeProduct = buildRouteProduct(options)
    const [fieldData, marketData] = await Promise.all([getMyFieldData(), getMarketData()])
    marketCrops.value = marketData.crops || []
    const fieldProducts = (fieldData.crops || []) as MarketingProduct[]
    products.value = routeProduct ? [routeProduct, ...fieldProducts] : fieldProducts
    selectedProductId.value = products.value[0]?.id || null
  } catch (_error) {
    uni.showToast({ title: '请求失败', icon: 'error' })
  } finally {
    uni.hideLoading()
  }
}

onLoad((options) => {
  void loadData((options || {}) as Record<string, any>)
})

const selectProduct = (id: number) => {
  selectedProductId.value = id
  materialPackage.value = null
}

const toggleSellingPoint = (point: string) => {
  if (selectedSellingPoints.value.includes(point)) {
    selectedSellingPoints.value = selectedSellingPoints.value.filter((item) => item !== point)
    return
  }
  selectedSellingPoints.value = [...selectedSellingPoints.value, point]
}

const handleGenerate = async () => {
  const product = selectedProduct.value
  if (!product) {
    uni.showToast({ title: '请先添加待推广产品', icon: 'none' })
    return
  }
  if (isGenerating.value) return

  isGenerating.value = true
  try {
    const market = matchedMarket.value
    const result = await generateMarketingMaterials({
      productName: product.name,
      expectedYield: product.expectedYield,
      yieldUnit: product.yieldUnit || '斤',
      expectedMarketTime: product.expectedMarketTime || '',
      location: product.location || '',
      marketPrice: market?.currentPrice,
      marketUnit: market?.unit,
      goal: selectedGoal.value,
      sellingPoints: selectedSellingPoints.value,
      targetBuyerName: targetBuyerName.value,
    })
    materialPackage.value = result
    uni.showToast({ title: '素材包已生成', icon: 'success' })
  } catch (_error) {
    uni.showToast({ title: '生成失败', icon: 'error' })
  } finally {
    isGenerating.value = false
  }
}

const copyText = (text: string) => {
  uni.setClipboardData({
    data: text,
    success: () => {
      uni.showToast({ title: '已复制', icon: 'success' })
    },
  })
}

const copyAllMaterials = () => {
  if (!materialPackage.value) return
  const pack = materialPackage.value
  copyText([
    `商品标题：${pack.productTitle}`,
    `朋友圈文案：\n${pack.wechatCopy}`,
    `短视频口播：\n${pack.shortVideoScript}`,
    `收购商询价话术：\n${pack.inquiryScript}`,
    `配图建议：\n${pack.imageSuggestions.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
    `标签建议：${pack.tags.join(' ')}`,
    `合规提醒：\n${pack.complianceTips.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
  ].join('\n\n'))
}

const goAddCrop = () => {
  uni.navigateTo({ url: '/pages/add-crop/index' })
}

const showNotice = () => {
  uni.showToast({ title: '暂无新提醒', icon: 'none' })
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
  background: var(--acm-bg-card);
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

.content {
  padding: 24rpx 24rpx 0;
}

.card,
.material-card,
.compliance-card {
  background: var(--acm-bg-card);
  border: 2rpx solid var(--acm-border-soft);
  border-radius: var(--acm-radius-card);
  padding: 32rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--acm-shadow-card);
  overflow: hidden;
}

.hero-card {
  min-height: 180rpx;
  margin-bottom: 28rpx;
  padding: 28rpx;
  border-radius: var(--acm-radius-card);
  background: linear-gradient(135deg, var(--acm-bg-harvest-soft), var(--acm-brand-primary-soft));
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  box-sizing: border-box;
}

.hero-copy {
  flex: 1;
  min-width: 0;
}

.hero-eyebrow,
.hero-title,
.hero-desc {
  display: block;
}

.hero-eyebrow {
  width: fit-content;
  padding: 8rpx 16rpx;
  border-radius: var(--acm-radius-pill);
  background: var(--acm-fruit-orange-soft);
  color: var(--acm-fruit-orange);
  font-size: 22rpx;
  font-weight: 700;
  margin-bottom: 14rpx;
}

.hero-title {
  font-size: 34rpx;
  line-height: 1.35;
  font-weight: 800;
  color: var(--acm-text-primary);
}

.hero-desc {
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--acm-text-secondary);
}

.hero-mark {
  width: 92rpx;
  height: 92rpx;
  border-radius: 28rpx;
  background: var(--acm-bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--acm-shadow-card);
}

.card-head,
.product-title-row,
.material-head,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.card-title,
.section-title {
  font-size: 34rpx;
  color: var(--acm-text-primary);
}

.card-note,
.text-btn,
.copy-btn {
  border: 0;
  background: transparent;
  color: var(--acm-primary);
  font-size: 24rpx;
}

.product-tabs {
  white-space: nowrap;
  margin-bottom: 20rpx;
}

.tab-row {
  display: inline-flex;
  gap: 16rpx;
}

.tab-item {
  border-radius: 16rpx;
  background: var(--acm-bg-soft);
  color: var(--acm-text-secondary);
  padding: 14rpx 28rpx;
  font-size: 24rpx;
}

.tab-item-active {
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
}

.product-card {
  border-radius: 24rpx;
  background: var(--acm-bg-success-soft);
  padding: 24rpx;
}

.product-name,
.section-title-wrap,
.safe-tip {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.product-name {
  font-size: 32rpx;
  color: var(--acm-text-primary);
}

.completeness {
  font-size: 24rpx;
  color: var(--acm-primary);
}

.product-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx 20rpx;
  font-size: 24rpx;
  color: var(--acm-text-secondary);
}

.product-grid text {
  width: calc((100% - 20rpx) / 2);
}

.goal-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.goal-item {
  width: calc((100% - 16rpx) / 2);
  border-radius: 24rpx;
  background: var(--acm-bg-soft);
  padding: 22rpx;
  box-sizing: border-box;
}

.goal-item-active {
  background: var(--acm-bg-success-soft);
  box-shadow: inset 0 0 0 3rpx var(--acm-primary);
}

.goal-title {
  display: block;
  font-size: 28rpx;
  color: var(--acm-text-primary);
  margin-bottom: 8rpx;
}

.goal-desc {
  display: block;
  font-size: 22rpx;
  color: var(--acm-text-muted);
  line-height: 1.4;
}

.point-list,
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.point-chip,
.tag {
  border-radius: 9999rpx;
  background: var(--acm-bg-soft);
  color: var(--acm-text-secondary);
  font-size: 24rpx;
  padding: 12rpx 20rpx;
}

.point-chip-active,
.tag {
  background: var(--acm-bg-success-soft);
  color: var(--acm-primary);
}

.proof-box {
  border-radius: 24rpx;
  background: var(--acm-bg-warning-soft);
  padding: 22rpx;
  margin-top: 24rpx;
}

.proof-title {
  display: block;
  font-size: 26rpx;
  color: var(--acm-warning-deep);
  margin-bottom: 8rpx;
}

.proof-text,
.safe-tip {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--acm-text-secondary);
}

.safe-tip {
  align-items: flex-start;
  margin-top: 20rpx;
}

.generate-btn {
  width: 100%;
  border: 0;
  border-radius: 32rpx;
  background: var(--acm-fruit-orange);
  color: var(--acm-text-inverse);
  font-size: 32rpx;
  padding: 32rpx 0;
  margin-bottom: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.generate-btn[disabled] {
  background: var(--acm-primary-disabled);
}

.generate-icon-spin {
  animation: acm-spin 1s linear infinite;
}

.result-wrap {
  margin-top: 4rpx;
}

.material-title {
  font-size: 30rpx;
  color: var(--acm-text-primary);
}

.material-content,
.list-line {
  display: block;
  white-space: pre-wrap;
  font-size: 27rpx;
  line-height: 1.65;
  color: var(--acm-text-secondary);
}

.list-line {
  margin-bottom: 8rpx;
}

.compliance-card {
  border: 2rpx solid var(--acm-border-warning);
  background: linear-gradient(135deg, var(--acm-warning-soft), var(--acm-bg-card));
}

.bottom-text {
  text-align: center;
  color: var(--acm-text-subtle);
  font-size: 24rpx;
  padding: 32rpx 0;
}

@keyframes acm-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Round 2 visual convergence: harvest marketing workbench */
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
    linear-gradient(105deg, rgba(37, 84, 58, 0.94) 0%, rgba(54, 125, 73, 0.74) 52%, rgba(173, 90, 30, 0.24) 100%),
    url('/static/images/field-command/field-market-tomatoes.jpg');
  background-size: cover;
  background-position: right center;
  box-shadow: 0 14rpx 34rpx rgba(37, 84, 58, 0.15);
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

.card,
.material-card,
.product-card {
  border-width: 1rpx;
  border-color: rgba(207, 222, 202, 0.86);
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
}

.hero-card {
  position: relative;
  overflow: hidden;
  border: 1rpx solid rgba(226, 211, 173, 0.7);
  background:
    linear-gradient(105deg, rgba(255, 254, 249, 0.98) 0%, rgba(255, 254, 249, 0.9) 62%, rgba(255, 254, 249, 0.5) 100%),
    url('/static/images/field-command/field-market-tomatoes.jpg');
  background-size: cover;
  background-position: right center;
}

.hero-mark {
  background: rgba(255, 244, 215, 0.78);
  border: 1rpx solid rgba(226, 211, 173, 0.72);
  box-shadow: none;
}

.goal-item,
.point-chip,
.proof-box,
.safe-tip {
  border-color: rgba(200, 222, 197, 0.62);
  background: rgba(255, 254, 249, 0.72);
}

.goal-item-active,
.point-chip-active {
  background: var(--acm-brand-primary-soft);
  border-color: rgba(54, 125, 73, 0.38);
}

.material-card {
  background:
    linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(250, 247, 234, 0.94));
}
</style>
