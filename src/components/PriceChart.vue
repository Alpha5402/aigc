<template>
  <view class="price-chart-wrap">
    <!-- @vue-ignore -->
    <view
      :id="chartId"
      class="price-chart"
      :prop="renderPayload"
      :change:prop="echartsRender.renderChart"
    ></view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

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

const chartId = `acm-chart-${Math.random().toString(36).slice(2, 10)}`

const calcAxisBounds = (values: number[]) => {
  const finiteValues = values.filter((value) => Number.isFinite(value))
  const sourceValues = finiteValues.length ? finiteValues : [0]
  const minValue = Math.min(...sourceValues)
  const maxValue = Math.max(...sourceValues)
  const center = (minValue + maxValue) / 2
  const rawRange = maxValue - minValue
  const relativeRange = Math.abs(center) > 0 ? rawRange / Math.abs(center) : rawRange

  let visibleRange = rawRange
  if (rawRange === 0) {
    visibleRange = Math.max(Math.abs(center) * 0.04, 0.6)
  } else if (relativeRange < 0.015) {
    visibleRange = Math.max(rawRange * 3.2, Math.abs(center) * 0.025, 0.4)
  } else if (relativeRange < 0.04) {
    visibleRange = Math.max(rawRange * 2.2, Math.abs(center) * 0.04, 0.5)
  } else if (relativeRange < 0.1) {
    visibleRange = rawRange * 1.55
  } else {
    visibleRange = rawRange * 1.25
  }

  const yMin = center - visibleRange / 2
  const yMax = center + visibleRange / 2

  return {
    min: Math.max(0, Math.floor(yMin * 10) / 10),
    max: Math.ceil(yMax * 10) / 10,
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

const lineBounds = computed(() => calcAxisBounds(lineValues.value))
const barBounds = computed(() => calcAxisBounds(barValues.value))

const renderPayload = computed(() => ({
  chartId,
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
</script>

<script module="echartsRender" lang="renderjs">
import * as echarts from 'echarts'

const chartMap = {}

const disposeChart = (chartId) => {
  if (!chartId) return
  const chart = chartMap[chartId]
  if (!chart) return
  chart.dispose()
  delete chartMap[chartId]
}

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
      extraCssText: 'border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);padding:8px 12px;',
      formatter: (params) => {
        const point = Array.isArray(params) ? params.find(p => p.seriesName === '预测价格') || params[0] : params
        if (!point) return ''
        let tip = `${point.axisValue}<br/>价格：¥${Number(point.value).toFixed(2)}`
        if (hasCI) {
          const l = payload.ci80LData[point.dataIndex]
          const u = payload.ci80UData[point.dataIndex]
          if (l != null && u != null) {
             tip += `<br/><span style="font-size:11px;color:#999">80% 置信区间：¥${Number(l).toFixed(2)} - ¥${Number(u).toFixed(2)}</span>`
          }
        }
        return tip
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
    extraCssText: 'border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);padding:8px 12px;',
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

const withDomReady = (chartId, callback) => {
  let retry = 0
  const maxRetry = 20

  const exec = () => {
    const dom = document.getElementById(chartId)
    if (dom) {
      callback(dom)
      return
    }

    if (retry < maxRetry) {
      retry += 1
      setTimeout(exec, 30)
    }
  }

  exec()
}

export default {
  methods: {
    renderChart(newValue) {
      const payload = newValue
      if (!payload || !payload.chartId) return

      this.__chartId = payload.chartId

      withDomReady(payload.chartId, (dom) => {
        let chart = chartMap[payload.chartId]
        if (!chart) {
          chart = echarts.init(dom, null, { renderer: 'canvas' })
          chartMap[payload.chartId] = chart
        }

        chart.setOption(getOption(payload), true)
        chart.resize()
      })
    },
  },
  beforeDestroy() {
    disposeChart(this.__chartId)
  },
  unmounted() {
    disposeChart(this.__chartId)
  },
}
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
