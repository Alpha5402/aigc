<template>
  <view :class="['status-chip', `status-chip--${resolvedType}`]">
    <SvgIcon v-if="showIcon" :name="iconName" :size="12" color="currentColor" />
    <text>{{ resolvedLabel }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SvgIcon from '../SvgIcon.vue'

type StatusType =
  | 'growing'
  | 'pending'
  | 'done'
  | 'recommended'
  | 'up'
  | 'down'
  | 'stable'
  | 'risk'
  | 'read'
  | 'unread'
  | 'match'
  | 'ai'
  | 'neutral'

const props = withDefaults(
  defineProps<{
    type?: StatusType | string
    label?: string
    showIcon?: boolean
  }>(),
  {
    type: 'neutral',
    label: '',
    showIcon: false,
  },
)

const statusMap: Record<string, { label: string; type: StatusType; icon: string }> = {
  growing: { label: '生长中', type: 'growing', icon: 'sprout' },
  pending: { label: '待处理', type: 'pending', icon: 'clock' },
  done: { label: '已完成', type: 'done', icon: 'circle-check' },
  recommended: { label: '推荐', type: 'recommended', icon: 'thumbs-up' },
  up: { label: '上涨', type: 'up', icon: 'trending-up' },
  down: { label: '下跌', type: 'down', icon: 'trending-down' },
  stable: { label: '持平', type: 'stable', icon: 'minus' },
  risk: { label: '风险', type: 'risk', icon: 'triangle-alert' },
  read: { label: '已读', type: 'read', icon: 'check' },
  unread: { label: '未读', type: 'unread', icon: 'bell' },
  match: { label: '匹配度', type: 'match', icon: 'target' },
  ai: { label: 'AI 建议', type: 'ai', icon: 'sparkles' },
  neutral: { label: '普通', type: 'neutral', icon: 'circle' },
}

const normalizedStageMap: Record<string, StatusType> = {
  生长期: 'growing',
  成熟期: 'recommended',
  苗期: 'growing',
  开花期: 'growing',
  结果期: 'growing',
  待处理: 'pending',
  已完成: 'done',
  风险: 'risk',
}

const resolved = computed(() => {
  const raw = String(props.type || '').trim()
  const mappedType = normalizedStageMap[raw] || raw
  return statusMap[mappedType] || statusMap.neutral
})

const resolvedType = computed(() => resolved.value.type)
const resolvedLabel = computed(() => props.label || resolved.value.label)
const iconName = computed(() => resolved.value.icon)
</script>

<style scoped lang="scss">
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  min-height: 40rpx;
  border-radius: var(--acm-radius-chip);
  padding: 0 14rpx;
  font-size: var(--acm-font-chip);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.status-chip--growing,
.status-chip--done,
.status-chip--recommended {
  background: var(--acm-success-soft);
  color: var(--acm-success-text);
}

.status-chip--pending,
.status-chip--up {
  background: var(--acm-warning-soft);
  color: var(--acm-warning-text);
}

.status-chip--down {
  background: var(--acm-price-down-soft);
  color: var(--acm-price-down-text);
}

.status-chip--stable,
.status-chip--read,
.status-chip--neutral {
  background: var(--acm-neutral-soft);
  color: var(--acm-neutral-text);
}

.status-chip--risk {
  background: var(--acm-danger-soft);
  color: var(--acm-danger-text);
}

.status-chip--unread,
.status-chip--match,
.status-chip--ai {
  background: var(--acm-info-soft);
  color: var(--acm-info-text);
}
</style>
