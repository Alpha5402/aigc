<template>
  <view class="price-chart-wrap">
    <l-echart
      ref="chartRef"
      class="price-chart"
      @finished="initChart"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

interface PricePoint {
  date: string
  price: number
  ci80L?: number
  ci80U?: number
  ci95L?: number
  ci95U?: number
}

interface ComparisonPoint {
  day: string
  thisWeek: number
  lastWeek: number
}

type ChartMode = 'line' | 'bar'

interface Props {
  mode?: ChartMode
  points?: PricePoint[]
  comparisonPoints?: ComparisonPoint[]
  basePrice?: number
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'line',
  points: () => [],
  comparisonPoints: () => [],
  basePrice: 0,
})

const chartRef = ref<any>(null)
const chartInstance = ref<any>(null)

const calcAxisBounds = (values: Array<number | null | undefined>) => {
  const finiteValues = values.filter((value) => Number.isFinite(value))
  const sourceValues = finiteValues.length ? finiteValues : [0]
  const minValue = Math.min(...sourceValues)
  const maxValue = Math.max(...sourceValues)
  const center = (minValue + maxValue) / 2
  const rawRange = maxValue - minValue
  const relativeRange = Math.abs(center) > 0 ? rawRange / Math.abs(center) : rawRange

  const minVisibleRange = Math.max(Math.abs(center) * 0.018, 0.12)
  let visibleRange = Math.max(rawRange, minVisibleRange)
  if (rawRange === 0) {
    visibleRange = Math.max(Math.abs(center) * 0.035, 0.4)
  } else if (relativeRange < 0.012) {
    visibleRange = Math.max(rawRange * 1.8, minVisibleRange)
  } else if (relativeRange < 0.035) {
    visibleRange = rawRange * 1.45
  } else if (relativeRange < 0.1) {
    visibleRange = rawRange * 1.28
  } else {
    visibleRange = rawRange * 1.18
  }

  const yMin = center - visibleRange / 2
  const yMax = center + visibleRange / 2

  return {
    min: Math.max(0, Math.floor(yMin * 100) / 100),
    max: Math.ceil(yMax * 100) / 100,
  }
}

const lineValues = computed(() => {
  const values = props.points.map((item) => Number(item.price)).filter((value) => Number.isFinite(value))
  return values.length ? values : [0]
})

const isLineFlat = computed(() => {
  const values = lineValues.value.filter((value) => Number.isFinite(value))
  if (values.length < 2) return true
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const center = (minValue + maxValue) / 2
  const range = maxValue - minValue
  return range <= Math.max(Math.abs(center) * 0.002, 0.03)
})

const barValues = computed(() => {
  const values = props.comparisonPoints
    .flatMap((item) => [Number(item.thisWeek), Number(item.lastWeek)])
    .filter((value) => Number.isFinite(value))
  return values.length ? values : [0]
})

const lineAxisValues = computed(() => [
  ...lineValues.value,
  ...props.points.map((item) => item.ci80L),
  ...props.points.map((item) => item.ci80U),
])
const lineBounds = computed(() => calcAxisBounds(lineAxisValues.value))
const barBounds = computed(() => calcAxisBounds(barValues.value))

const renderPayload = computed(() => ({
  mode: props.mode,
  xAxisData: props.mode === 'bar'
    ? props.comparisonPoints.map((item) => item.day)
    : props.points.map((item) => item.date),
  lineData: props.points.map((item) => Number(item.price)),
  ci80LData: props.points.map((item) => item.ci80L != null ? Number(item.ci80L) : null),
  ci80UData: props.points.map((item) => item.ci80U != null ? Number(item.ci80U) : null),
  lastWeekData: props.comparisonPoints.map((item) => Number(item.lastWeek)),
  thisWeekData: props.comparisonPoints.map((item) => Number(item.thisWeek)),
  yMin: props.mode === 'bar' ? barBounds.value.min : lineBounds.value.min,
  yMax: props.mode === 'bar' ? barBounds.value.max : lineBounds.value.max,
  isLineFlat: isLineFlat.value,
}))
const buildLineOption = (payload) => {
  const hasCI = payload.ci80LData && payload.ci80LData.some((v) => v != null)
  const validPrices = (payload.lineData || []).map(Number).filter((v) => Number.isFinite(v))
  const avgPrice = validPrices.length
    ? validPrices.reduce((sum, value) => sum + value, 0) / validPrices.length
    : 0
  const stableBand = Math.max(Math.abs(avgPrice) * 0.008, 0.08)
  const axisRange = Number(payload.yMax) - Number(payload.yMin)
  const axisDecimals = axisRange <= 1 ? 2 : 1
  const series = []

  if (hasCI) {
    series.push({
      name: 'CI_Lower',
      type: 'line',
      data: payload.ci80LData,
      lineStyle: { opacity: 0 },
      stack: 'ci',
      symbol: 'none',
      itemStyle: { opacity: 0 }
    })
    series.push({
      name: 'CI_Upper',
      type: 'line',
      data: payload.ci80UData.map((u, i) => {
        const l = payload.ci80LData[i]
        return (u != null && l != null) ? Number((u - l).toFixed(2)) : null
      }),
      lineStyle: { opacity: 0 },
      areaStyle: { color: 'rgba(82,163,85,0.15)' },
      stack: 'ci',
      symbol: 'none',
      itemStyle: { opacity: 0 }
    })
  }

  series.push({
    name: '预测价格',
    type: 'line',
    data: payload.lineData,
    smooth: true,
    showSymbol: true,
    symbol: 'circle',
    symbolSize: payload.isLineFlat ? 9 : 6,
    lineStyle: {
      color: '#52a355',
      width: payload.isLineFlat ? 3 : 2,
    },
    itemStyle: {
      color: '#52a355',
      borderColor: '#ffffff',
      borderWidth: payload.isLineFlat ? 2 : 0,
    },
    areaStyle: hasCI ? undefined : {
      color: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(82,163,85,0.15)' },
          { offset: 1, color: 'rgba(82,163,85,0)' },
        ],
      },
    },
    markArea: payload.isLineFlat ? {
      silent: true,
      itemStyle: {
        color: 'rgba(214,168,58,0.12)',
      },
      data: [[
        { yAxis: Number((avgPrice - stableBand).toFixed(2)) },
        { yAxis: Number((avgPrice + stableBand).toFixed(2)) },
      ]],
    } : undefined,
    markLine: payload.isLineFlat ? {
      silent: true,
      symbol: 'none',
      lineStyle: {
        color: 'rgba(122,101,72,0.42)',
        width: 1,
        type: 'dashed',
      },
      label: {
        show: true,
        formatter: '平稳',
        color: '#7a6548',
        fontSize: 11,
        position: 'insideEndTop',
      },
      data: [{ yAxis: Number(avgPrice.toFixed(2)) }],
    } : undefined,
    emphasis: {
      itemStyle: {
        color: '#52a355',
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    },
  })

  return {
    grid: {
      left: '2%',
      right: '4%',
      top: '6%',
      bottom: '2%',
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(82,163,85,0.35)',
          width: 1,
        },
      },
      backgroundColor: '#ffffff',
      borderWidth: 0,
      textStyle: {
        color: '#1a1a1a',
        fontSize: 13,
      },
      renderMode: 'richText',
      extraCssText: 'border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);padding:8px 12px;',
      formatter: (params) => {
        const point = Array.isArray(params) ? params.find(p => p.seriesName === '预测价格') || params[0] : params
        if (!point) return ''
        const lines = [
          `日期：${point.axisValue}`,
          `数据：¥${Number(point.value).toFixed(2)}`,
        ]
        if (hasCI) {
          const l = payload.ci80LData[point.dataIndex]
          const u = payload.ci80UData[point.dataIndex]
          if (l != null && u != null) {
            lines.push('置信度：80%')
            lines.push(`区间：¥${Number(l).toFixed(2)} - ¥${Number(u).toFixed(2)}`)
          }
        }
        return lines.join('\n')
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: payload.xAxisData,
      axisLabel: {
        color: '#999999',
        fontSize: 11,
      },
      axisLine: {
        lineStyle: {
          color: '#f0f0f0',
        },
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        show: false,
      },
    },
    yAxis: {
      type: 'value',
      min: payload.yMin,
      max: payload.yMax,
      axisLabel: {
        color: '#999999',
        fontSize: 11,
        formatter: (value) => Number(value).toFixed(axisDecimals),
      },
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#f0f0f0',
          type: 'dashed',
        },
      },
    },
    series,
    animation: true,
  }
}

const buildBarOption = (payload) => ({
  grid: {
    left: '2%',
    right: '4%',
    top: '6%',
    bottom: '2%',
    containLabel: true,
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'shadow',
    },
    backgroundColor: '#ffffff',
    borderWidth: 0,
    textStyle: {
      color: '#1a1a1a',
      fontSize: 13,
    },
    renderMode: 'richText',
    extraCssText: 'border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);padding:8px 12px;',
    formatter: (params) => {
      const items = Array.isArray(params) ? params : [params]
      if (!items.length) return ''
      const title = items[0]?.axisValue ? `日期：${items[0].axisValue}` : ''
      return [
        title,
        ...items
          .filter((item) => item && Number.isFinite(Number(item.value)))
          .map((item) => `${item.seriesName}：¥${Number(item.value).toFixed(2)}`),
      ].filter(Boolean).join('\n')
    },
  },
  xAxis: {
    type: 'category',
    boundaryGap: true,
    data: payload.xAxisData,
    axisLabel: {
      color: '#999999',
      fontSize: 11,
    },
    axisLine: {
      lineStyle: {
        color: '#f0f0f0',
      },
    },
    axisTick: {
      show: false,
    },
  },
  yAxis: {
    type: 'value',
    min: payload.yMin,
    max: payload.yMax,
    axisLabel: {
      color: '#999999',
      fontSize: 11,
      formatter: (value) => Number(value).toFixed(1),
    },
    axisLine: {
      show: false,
    },
    axisTick: {
      show: false,
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: '#f0f0f0',
        type: 'dashed',
      },
    },
  },
  series: [
    {
      name: '上周',
      type: 'bar',
      barWidth: 14,
      data: payload.lastWeekData,
      itemStyle: {
        color: '#e8e8e8',
        borderRadius: [4, 4, 0, 0],
      },
    },
    {
      name: '本周',
      type: 'bar',
      barWidth: 14,
      data: payload.thisWeekData,
      itemStyle: {
        color: '#52a355',
        borderRadius: [4, 4, 0, 0],
      },
    },
  ],
  animation: true,
})

const getOption = (payload) => (payload.mode === 'bar' ? buildBarOption(payload) : buildLineOption(payload))

const setChartOption = () => {
  const option = getOption(renderPayload.value)
  if (chartInstance.value) {
    chartInstance.value.setOption(option, true)
    chartRef.value?.resize?.()
    return
  }

  chartRef.value?.setOption?.(option)
}

const initChart = async () => {
  if (!chartRef.value) return

  try {
    chartInstance.value = await chartRef.value.init(null)
    setChartOption()
  } catch (error) {
    console.error('[PriceChart] 图表初始化失败:', error)
  }
}

watch(
  renderPayload,
  () => {
    void nextTick(setChartOption)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  chartRef.value?.dispose?.()
  chartInstance.value = null
})
</script>

<style scoped lang="scss">
.price-chart-wrap {
  width: 100%;
  height: 384rpx;
}

.price-chart {
  width: 100%;
  height: 100%;
}
</style>
