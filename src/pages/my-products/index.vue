<template>
  <AppPage>
    <AppHeader title="我的代售产品" subtitle="集中管理用于销路匹配的待售作物" show-back transparent />

    <view class="toolbar">
      <button class="toolbar-btn primary" @click="goAddCrop">
        <SvgIcon name="plus" :size="18" color="var(--acm-text-inverse)" />
        <text>新增产品</text>
      </button>
      <button class="toolbar-btn" @click="goBuyerPage">
        <SvgIcon name="arrow-left" :size="18" color="var(--acm-brand-primary)" />
        <text>返回匹配</text>
      </button>
    </view>

    <EmptyState
      v-if="products.length === 0"
      icon-name="package"
      title="暂无代售产品"
      description="请先添加作物和预期产出，系统会据此计算销路匹配结果。"
      action-text="去添加作物"
      @action="goAddCrop"
    />

    <view v-else class="product-list">
      <AppCard v-for="(product, index) in products" :key="`${product.name}-${index}`" class="product-card">
        <view class="product-head">
          <view class="product-title-wrap">
            <view class="product-icon">
              <SvgIcon name="package" :size="22" color="var(--acm-brand-primary)" />
            </view>
            <view>
              <text class="product-name">{{ product.name || '未填写产品' }}</text>
              <text class="product-subtitle">{{ product.location || '产地待完善' }}</text>
            </view>
          </view>
          <text class="product-status">待匹配</text>
        </view>

        <view class="product-meta-grid">
          <view class="meta-cell">
            <text class="meta-label">数量/重量</text>
            <text class="meta-value">{{ formatQuantity(product.quantity, product.unit) }}</text>
          </view>
          <view class="meta-cell">
            <text class="meta-label">期望价格</text>
            <text class="meta-value">{{ formatPrice(product) }}</text>
          </view>
          <view class="meta-cell">
            <text class="meta-label">预计上市</text>
            <text class="meta-value">{{ product.expectedMarketTime || '待完善' }}</text>
          </view>
          <view class="meta-cell">
            <text class="meta-label">更新时间</text>
            <text class="meta-value">{{ product.updatedAt || product.createdAt || '暂无记录' }}</text>
          </view>
        </view>

        <view class="product-actions">
          <button class="product-action" @click="goCompleteProduct(product)">完善信息</button>
          <button class="product-action danger" @click="showUnavailable('删除')">删除</button>
        </view>
      </AppCard>
    </view>
  </AppPage>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/common/AppPage.vue'
import AppHeader from '../../components/common/AppHeader.vue'
import AppCard from '../../components/common/AppCard.vue'
import EmptyState from '../../components/common/EmptyState.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { getBuyerData, getMyFieldData, type CropInfo, type MyProductItem } from '../../api/agri'

type ProductDisplayItem = MyProductItem & Record<string, any>

const products = ref<ProductDisplayItem[]>([])

const normalizeCropName = (name: string) => {
  return String(name || '').trim().replace(/\s+/g, '').replace(/树$/, '')
}

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString('zh-CN')
}

const formatQuantity = (quantity?: number, unit = '斤') => {
  const value = Number(quantity || 0)
  return value ? `${formatNumber(value)}${unit || '斤'}` : '待完善'
}

const formatPrice = (product: ProductDisplayItem) => {
  const price = product.expectedPrice || product.targetPrice || product.marketPrice
  if (!price) return '待完善'
  return `${price}元/${product.marketUnit || product.unit || '斤'}`
}

const loadProducts = async () => {
  uni.showLoading({ title: '加载中...' })
  try {
    const [buyerData, fieldData] = await Promise.all([getBuyerData(), getMyFieldData()])
    const crops = (fieldData.crops || []) as CropInfo[]
    products.value = ((buyerData.myProducts || []) as ProductDisplayItem[]).map((product) => {
      const matchedCrop = crops.find((crop) => normalizeCropName(crop.name) === normalizeCropName(product.name))
      if (!matchedCrop) return product
      return {
        ...product,
        cropId: matchedCrop.id,
        area: product.area || matchedCrop.area,
        plantDate: product.plantDate || matchedCrop.plantDate,
        stage: product.stage || matchedCrop.stage,
        location: product.location || matchedCrop.location,
        expectedYield: product.expectedYield || matchedCrop.expectedYield,
        yieldUnit: product.yieldUnit || matchedCrop.yieldUnit,
        expectedMarketTime: product.expectedMarketTime || matchedCrop.expectedMarketTime,
      }
    })
  } catch (_error) {
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

onShow(() => {
  void loadProducts()
})

const goAddCrop = () => {
  uni.navigateTo({ url: '/pages/add-crop/index' })
}

const resolveCropId = (product: ProductDisplayItem) => {
  if (product.cropId || product.crop_id || product.crop?.id) {
    return product.cropId || product.crop_id || product.crop.id
  }
  return ''
}

const buildEditCropUrl = (product: ProductDisplayItem) => {
  const cropId = resolveCropId(product)
  if (!cropId) return ''

  const parts = [
    'editMode=true',
    `id=${cropId}`,
    `name=${encodeURIComponent(String(product.name || ''))}`,
    `area=${encodeURIComponent(String(product.area || ''))}`,
    `plantDate=${encodeURIComponent(String(product.plantDate || ''))}`,
    `stage=${encodeURIComponent(String(product.stage || ''))}`,
  ]
  if (product.location) parts.push(`location=${encodeURIComponent(String(product.location))}`)
  const expectedYield = product.expectedYield || product.quantity
  if (expectedYield) parts.push(`expectedYield=${expectedYield}`)
  const yieldUnit = product.yieldUnit || product.unit
  if (yieldUnit) parts.push(`yieldUnit=${encodeURIComponent(String(yieldUnit))}`)
  if (product.expectedMarketTime) {
    parts.push(`expectedMarketTime=${encodeURIComponent(String(product.expectedMarketTime))}`)
  }

  return `/pages/add-crop/index?${parts.join('&')}`
}

const goCompleteProduct = (product: ProductDisplayItem) => {
  const url = buildEditCropUrl(product)
  if (!url) {
    uni.showToast({ title: '未找到对应作物，无法完善信息', icon: 'none' })
    return
  }
  uni.navigateTo({ url })
}

const goBuyerPage = () => {
  uni.navigateTo({ url: '/pages/buyer/index' })
}

const showUnavailable = (action: string) => {
  uni.showToast({ title: `${action}接口暂未开放`, icon: 'none' })
}
</script>

<style scoped lang="scss">
.toolbar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
  margin-bottom: var(--acm-space-section);
}

.toolbar-btn {
  min-height: 88rpx;
  border: 1rpx solid rgba(214, 221, 214, 0.9);
  border-radius: 26rpx;
  background: var(--acm-bg-card);
  color: var(--acm-brand-primary);
  font-size: 26rpx;
  font-weight: 850;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  box-shadow: 0 8rpx 22rpx rgba(31, 42, 35, 0.06);
}

.toolbar-btn.primary {
  border-color: transparent;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
}

.toolbar-btn::after,
.product-action::after {
  border: 0;
}

.product-list {
  display: flex;
  flex-direction: column;
  gap: var(--acm-space-card-gap);
}

.product-card {
  overflow: hidden;
}

.product-head,
.product-title-wrap,
.product-actions {
  display: flex;
  align-items: center;
}

.product-head {
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

.product-title-wrap {
  min-width: 0;
  gap: 16rpx;
}

.product-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 22rpx;
  background: var(--acm-brand-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-name,
.product-subtitle {
  display: block;
}

.product-name {
  color: var(--acm-text-primary);
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.25;
}

.product-subtitle {
  margin-top: 8rpx;
  color: var(--acm-text-secondary);
  font-size: 24rpx;
}

.product-status {
  flex: 0 0 auto;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  background: var(--acm-harvest-gold-soft);
  color: var(--acm-warning-text);
  font-size: 22rpx;
  font-weight: 800;
}

.product-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
}

.meta-cell {
  min-height: 96rpx;
  padding: 18rpx;
  border-radius: 22rpx;
  background: rgba(255, 254, 249, 0.74);
  border: 1rpx solid rgba(200, 222, 197, 0.62);
  box-sizing: border-box;
}

.meta-label,
.meta-value {
  display: block;
}

.meta-label {
  color: var(--acm-text-muted);
  font-size: 22rpx;
}

.meta-value {
  margin-top: 8rpx;
  color: var(--acm-text-primary);
  font-size: 26rpx;
  font-weight: 850;
  line-height: 1.3;
}

.product-actions {
  gap: 12rpx;
  margin-top: 22rpx;
}

.product-action {
  flex: 1;
  min-height: 70rpx;
  border: 0;
  border-radius: 20rpx;
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary);
  font-size: 25rpx;
  font-weight: 800;
}

.product-action.danger {
  background: var(--acm-danger-soft);
  color: var(--acm-danger-text);
}
</style>
