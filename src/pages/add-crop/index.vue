<template>
  <AppPage>
    <AppHeader :title="isEditMode ? '编辑作物' : '添加作物'" subtitle="记录种植信息，方便后续管理与智能建议" show-back transparent />

    <view class="intro-card">
      <view>
        <text class="intro-kicker">作物档案</text>
        <text class="intro-title">把种植信息整理清楚，后续行情、销路和问诊才更准确。</text>
      </view>
      <view class="intro-icon">
        <SvgIcon name="sprout" :size="34" color="var(--acm-brand-primary)" />
      </view>
    </view>

    <view v-if="assistantNotice" class="assistant-notice">
      <SvgIcon name="sparkles" :size="16" color="var(--acm-warning)" />
      <text>{{ assistantNotice }}</text>
    </view>

    <SectionHeader title="基础信息" description="先告诉系统你种了什么、在哪块地。" icon="leaf" />
    <AppCard class="form-card">
      <FormField
        v-model="formData.name"
        label="作物名称"
        placeholder="例如：番茄、苹果树、黄瓜"
        required
        :error="isAssistantMissing('cropName') ? '请补充作物名称' : ''"
      />
      <FormField
        v-model="formData.location"
        label="地块名称"
        placeholder="例如：东地、南坡、一号棚"
        helper="可选，用于后续区分不同地块。"
      />
    </AppCard>

    <SectionHeader title="种植信息" description="面积、时间和产出会用于经营概览与销路匹配。" icon="calendar-check" />
    <AppCard class="form-card">
      <view class="unit-field">
        <FormField
          v-model="formData.area"
          label="种植面积"
          type="number"
          placeholder="请输入面积"
          required
          :error="isAssistantMissing('area') ? '请补充种植面积' : ''"
        />
        <text class="unit-badge">亩</text>
      </view>

      <view class="unit-field">
        <FormField
          v-model="formData.expectedYield"
          label="预期产出"
          type="number"
          placeholder="例如：1200"
        />
        <picker mode="selector" :range="yieldUnitOptions" :value="yieldUnitIndex" @change="onYieldUnitChange">
          <view class="unit-picker">
            <text>{{ formData.yieldUnit }}</text>
            <SvgIcon name="chevron-down" :size="14" color="var(--acm-brand-primary)" />
          </view>
        </picker>
      </view>

      <view class="picker-field">
        <text class="picker-label">种植时间</text>
        <picker mode="date" :value="formData.plantDate" @change="onPlantDateChange">
          <view :class="['picker-box', isAssistantMissing('plantDate') ? 'picker-box--warning' : '']">
            <text :class="['picker-text', formData.plantDate ? '' : 'picker-placeholder']">
              {{ formData.plantDate || '请选择种植时间' }}
            </text>
            <SvgIcon name="calendar" :size="16" color="var(--acm-text-secondary)" />
          </view>
        </picker>
        <text v-if="isAssistantMissing('plantDate')" class="field-error">请补充种植时间</text>
      </view>

      <view class="picker-field">
        <text class="picker-label">预计采收 / 上市时间</text>
        <picker mode="date" :value="formData.expectedMarketTime" @change="onExpectedMarketTimeChange">
          <view class="picker-box">
            <text :class="['picker-text', formData.expectedMarketTime ? '' : 'picker-placeholder']">
              {{ formData.expectedMarketTime || '请选择预计时间' }}
            </text>
            <SvgIcon name="calendar-days" :size="16" color="var(--acm-text-secondary)" />
          </view>
        </picker>
      </view>
    </AppCard>

    <SectionHeader title="补充信息" description="这部分不强制填写，但会提升后续建议质量。" icon="clipboard-list" />
    <AppCard class="form-card">
      <view class="goal-grid">
        <button
          v-for="stage in stageOptions"
          :key="stage"
          :class="['stage-chip', formData.stage === stage ? 'stage-chip--active' : '']"
          @click="formData.stage = stage"
        >
          {{ stage }}
        </button>
      </view>
      <view class="tip-card">
        <SvgIcon name="lightbulb" :size="17" color="var(--acm-brand-primary)" />
        <text>完善预期产出后，可用于销路匹配、预估销售额和营销素材生成。</text>
      </view>
    </AppCard>

    <view class="submit-spacer"></view>
  </AppPage>

  <view class="bottom-action">
    <AppButton text="取消" variant="secondary" @click="goMyField" />
    <AppButton :text="isEditMode ? '保存' : '添加作物'" icon="plus" :loading="isSubmitting" loading-text="保存中" @click="submitForm" />
  </view>

  <AssistantFloat current-page="/pages/add-crop/index" />
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppPage from '../../components/common/AppPage.vue'
import AppHeader from '../../components/common/AppHeader.vue'
import AppCard from '../../components/common/AppCard.vue'
import AppButton from '../../components/common/AppButton.vue'
import FormField from '../../components/common/FormField.vue'
import SectionHeader from '../../components/common/SectionHeader.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import AssistantFloat from '../../components/assistant/AssistantFloat.vue'
import { submitAddCrop } from '../../api/agri'
import { validateAddCropForm } from '../../utils/validators'
import { useAssistantPrefill } from '../../composables/useAssistantPrefill'

const yieldUnitOptions = ['斤', '公斤', '吨']
const stageOptions = ['未设置', '苗期', '生长期', '开花期', '结果期', '成熟期']

const formData = reactive({
  name: '',
  area: '',
  expectedYield: '',
  yieldUnit: '斤',
  expectedMarketTime: '',
  plantDate: '',
  stage: '未设置',
  location: '',
})

const isSubmitting = ref(false)
const yieldUnitIndex = ref(0)
const assistantNotice = ref('')
const assistantMissingSlots = ref<string[]>([])
const editCropId = ref<number | null>(null)
const isEditMode = computed(() => editCropId.value !== null)
const { consumePendingFormFill } = useAssistantPrefill()

onLoad((query?: Record<string, string>) => {
  applyEditPrefill(query)
  applyAssistantPrefill()
})

// 安全解码 URL 编码的参数（App 平台不会自动解码 query string）
const safeDecode = (value: string) => {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch (_error) {
    return value
  }
}

const applyEditPrefill = (query?: Record<string, string>) => {
  if (!query || query.editMode !== 'true') return

  const id = Number(query.id || '')
  if (!Number.isFinite(id) || id <= 0) return

  editCropId.value = id
  formData.name = safeDecode(query.name)
  // 去除面积中的"亩"等单位后缀，保留纯数字供表单验证
  formData.area = safeDecode(query.area).replace(/[^\d.]/g, '')
  formData.plantDate = safeDecode(query.plantDate)
  formData.stage = safeDecode(query.stage) || '未设置'
  if (query.location) formData.location = safeDecode(query.location)

  const expectedYield = Number(safeDecode(query.expectedYield || ''))
  if (Number.isFinite(expectedYield) && expectedYield > 0) {
    formData.expectedYield = String(expectedYield)
  }
  if (query.yieldUnit) {
    formData.yieldUnit = safeDecode(query.yieldUnit)
    const idx = yieldUnitOptions.indexOf(formData.yieldUnit)
    if (idx >= 0) yieldUnitIndex.value = idx
  }
  if (query.expectedMarketTime) formData.expectedMarketTime = safeDecode(query.expectedMarketTime)

  assistantNotice.value = '你正在编辑已有作物，修改后点击保存即可更新档案。'
}

const applyAssistantPrefill = () => {
  const action = consumePendingFormFill('field_crop_form')
  const params = action?.params || {}
  if (!action) return

  formData.name = String(params.cropName || formData.name || '')
  formData.area = params.area ? String(params.area) : formData.area
  formData.plantDate = String(params.plantDate || formData.plantDate || '')
  if (params.location) formData.location = String(params.location)
  assistantMissingSlots.value = Array.isArray(action.missingSlots) ? action.missingSlots : []
  assistantNotice.value = action.notice || (assistantMissingSlots.value.length ? '已填入识别到的信息，请补充缺失项后保存。' : '已根据语音填入信息，请确认后保存。')

  uni.showToast({ title: assistantNotice.value, icon: 'none' })
}

const isAssistantMissing = (slot: string) => assistantMissingSlots.value.includes(slot)

const onPlantDateChange = (event: any) => {
  formData.plantDate = event?.detail?.value || ''
}

const onExpectedMarketTimeChange = (event: any) => {
  formData.expectedMarketTime = event?.detail?.value || ''
}

const onYieldUnitChange = (event: any) => {
  const index = Number(event?.detail?.value || 0)
  yieldUnitIndex.value = index
  formData.yieldUnit = yieldUnitOptions[index] || '斤'
}

const goMyField = () => {
  uni.redirectTo({
    url: '/pages/my-field/index',
    fail: () => {
      uni.reLaunch({ url: '/pages/my-field/index' })
    },
  })
}

const submitForm = async () => {
  const errorText = validateAddCropForm(formData)
  if (errorText) {
    uni.showToast({ title: errorText, icon: 'none' })
    return
  }

  if (isSubmitting.value) return

  isSubmitting.value = true
  uni.showLoading({ title: '保存中...' })

  try {
    await submitAddCrop({ ...formData })
    uni.showToast({ title: isEditMode.value ? '保存成功' : '添加成功', icon: 'success' })
    setTimeout(goMyField, 600)
  } catch (_error) {
    uni.showToast({ title: '保存失败，请重试', icon: 'none' })
  } finally {
    isSubmitting.value = false
    uni.hideLoading()
  }
}
</script>

<style scoped lang="scss">
.intro-card {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  border: 2rpx solid var(--acm-border-green);
  border-radius: var(--acm-radius-card-lg);
  background: linear-gradient(180deg, var(--acm-bg-card) 0%, var(--acm-brand-primary-soft) 100%);
  padding: 30rpx;
  margin-bottom: var(--acm-space-section);
  box-shadow: var(--acm-shadow-card);
}

.intro-kicker {
  display: block;
  color: var(--acm-soil-earth);
  font-size: var(--acm-font-caption);
  font-weight: 800;
  margin-bottom: 10rpx;
}

.intro-title {
  display: block;
  color: var(--acm-brand-primary-dark);
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.35;
}

.intro-icon {
  width: 88rpx;
  height: 88rpx;
  border-radius: 26rpx;
  background: var(--acm-bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.assistant-notice {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 22rpx 24rpx;
  margin-bottom: var(--acm-space-section);
  border: 2rpx solid var(--acm-border-warning);
  border-radius: var(--acm-radius-card);
  background: var(--acm-warning-soft);
  color: var(--acm-warning-text);
  font-size: var(--acm-font-caption);
  line-height: 1.5;
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: var(--acm-space-form-gap);
  margin-bottom: var(--acm-space-section);
}

.unit-field {
  position: relative;
}

.unit-badge,
.unit-picker {
  position: absolute;
  right: 16rpx;
  bottom: 10rpx;
  min-width: 92rpx;
  height: 68rpx;
  border-radius: 18rpx;
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary);
  font-size: 26rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  padding: 0 16rpx;
  box-sizing: border-box;
}

.picker-field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.picker-label {
  color: var(--acm-text-primary);
  font-size: 26rpx;
  font-weight: 700;
}

.picker-box {
  min-height: 88rpx;
  border: 2rpx solid var(--acm-border-soft);
  border-radius: var(--acm-radius-input);
  background: var(--acm-bg-card);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24rpx;
  box-sizing: border-box;
}

.picker-box--warning {
  border-color: var(--acm-warning);
  background: var(--acm-warning-soft);
}

.picker-text {
  color: var(--acm-text-primary);
  font-size: var(--acm-font-form);
}

.picker-placeholder {
  color: var(--acm-text-placeholder);
}

.field-error {
  color: var(--acm-warning-text);
  font-size: var(--acm-font-caption);
}

.goal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.stage-chip {
  min-height: 56rpx;
  border: 0;
  border-radius: var(--acm-radius-chip);
  background: var(--acm-neutral-soft);
  color: var(--acm-neutral-text);
  font-size: 24rpx;
  padding: 0 20rpx;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stage-chip--active {
  background: var(--acm-success-soft);
  color: var(--acm-success-text);
  font-weight: 800;
}

.tip-card {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  border-radius: var(--acm-radius-input);
  background: var(--acm-brand-primary-soft);
  color: var(--acm-text-regular);
  font-size: var(--acm-font-caption);
  line-height: 1.6;
  padding: 22rpx;
}

.submit-spacer {
  height: 148rpx;
}

.bottom-action {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 990;
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: 18rpx;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background: var(--acm-bg-elevated);
  border-top: 2rpx solid var(--acm-border-soft);
  box-shadow: var(--acm-shadow-nav);
  box-sizing: border-box;
}

/* Round 2 visual convergence: crop dossier workflow */
.intro-card {
  position: relative;
  overflow: hidden;
  border: 1rpx solid rgba(199, 218, 193, 0.88);
  background:
    linear-gradient(110deg, rgba(255, 254, 249, 0.98) 0%, rgba(255, 254, 249, 0.92) 56%, rgba(255, 254, 249, 0.72) 100%),
    url('/static/images/field-command/field-focus-orchard.jpg');
  background-size: cover;
  background-position: right center;
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
}

.intro-icon {
  background: rgba(255, 254, 249, 0.78);
  border: 1rpx solid rgba(200, 222, 197, 0.7);
  box-shadow: none;
}

.form-card {
  border-width: 1rpx;
  border-color: rgba(207, 222, 202, 0.86);
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
}

.stage-chip {
  border: 1rpx solid rgba(200, 222, 197, 0.66);
  background: rgba(255, 254, 249, 0.78);
}

.stage-chip--active {
  background: var(--acm-brand-primary-soft);
  color: var(--acm-brand-primary-dark);
}

.tip-card {
  background: linear-gradient(135deg, rgba(238, 247, 236, 0.9), rgba(255, 254, 249, 0.9));
  border: 1rpx solid rgba(200, 222, 197, 0.62);
}

.bottom-action {
  background: rgba(255, 254, 249, 0.94);
  backdrop-filter: blur(14rpx);
  border-top-color: rgba(229, 223, 208, 0.78);
  box-shadow: 0 -8rpx 24rpx rgba(64, 84, 62, 0.07);
}
</style>
