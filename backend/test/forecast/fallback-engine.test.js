// 备用大脑测试：MA + SES

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  forwardFill,
  meanOf,
  movingAverage,
  simpleExponentialSmoothing,
  residualBasedCI,
  fallbackForecast,
} = require('../../lib/fallback-engine')

const buildSeries = (n, fn) => Array.from({ length: n }, (_, i) => fn(i))

test('forwardFill: 中间 null 用前值填，首部 null 用首个有限值反向填', () => {
  assert.deepEqual(forwardFill([1, null, 3, null, 5]), [1, 1, 3, 3, 5])
  assert.deepEqual(forwardFill([null, null, 2, null, 4]), [2, 2, 2, 2, 4])
  assert.equal(forwardFill([null, null, null]), null)
  assert.equal(forwardFill([]), null)
})

test('movingAverage: 长度匹配且为常数', () => {
  const r = movingAverage([1, 2, 3, 4, 5, 6, 7], { window: 3, horizon: 5 })
  assert.equal(r.point.length, 5)
  assert.equal(r.point[0], 6) // (5+6+7)/3 = 6
  assert.equal(r.family, 'moving_average')
})

test('SES: 自动搜索 α 后产出常数 horizon 序列', () => {
  const series = buildSeries(60, (i) => 5 + 0.05 * i + 0.2 * Math.sin(i / 5))
  const r = simpleExponentialSmoothing(series, { horizon: 7 })
  assert.ok(r)
  assert.equal(r.point.length, 7)
  assert.equal(r.family, 'simple_exp_smoothing')
  // 所有预测值相同（SES 平推）
  assert.ok(r.point.every((v) => v === r.point[0]))
})

test('residualBasedCI: 80% < 95%', () => {
  const point = [10, 10, 10]
  const residuals = [-1, 0, 1, -0.5, 0.5]
  const c80 = residualBasedCI(point, residuals, 0.8)
  const c95 = residualBasedCI(point, residuals, 0.95)
  for (let i = 0; i < point.length; i += 1) {
    assert.ok(c95.lower[i] <= c80.lower[i] + 1e-9)
    assert.ok(c80.upper[i] <= c95.upper[i] + 1e-9)
    assert.ok(c80.lower[i] <= point[i])
    assert.ok(point[i] <= c80.upper[i])
  }
})

test('fallbackForecast: 短序列（< 14 天）走 movingAverage', () => {
  const series = [4.0, 4.1, 4.2, 4.0, 4.3, 4.4, 4.5]
  const r = fallbackForecast({ history: series, horizonDays: 7 })
  assert.ok(r)
  assert.equal(r.family, 'moving_average')
  assert.equal(r.point.length, 7)
})

test('fallbackForecast: 中等序列（≥ 14 天）走 SES', () => {
  const series = buildSeries(60, (i) => 5 + 0.01 * i)
  const r = fallbackForecast({ history: series, horizonDays: 7 })
  assert.ok(r)
  assert.equal(r.family, 'simple_exp_smoothing')
})

test('fallbackForecast: 全 null 历史返回 null', () => {
  assert.equal(fallbackForecast({ history: [null, null, null], horizonDays: 7 }), null)
})

test('fallbackForecast: 空数组返回 null', () => {
  assert.equal(fallbackForecast({ history: [], horizonDays: 7 }), null)
})

test('fallbackForecast: 输出 CI 单调', () => {
  const series = buildSeries(120, (i) => 5 + 0.01 * i + 0.5 * Math.sin((2 * Math.PI * i) / 7))
  const r = fallbackForecast({ history: series, horizonDays: 7 })
  assert.ok(r)
  for (let i = 0; i < r.point.length; i += 1) {
    assert.ok(r.ci95Lower[i] <= r.ci80Lower[i] + 1e-6)
    assert.ok(r.ci80Lower[i] <= r.point[i] + 1e-6)
    assert.ok(r.point[i] <= r.ci80Upper[i] + 1e-6)
    assert.ok(r.ci80Upper[i] <= r.ci95Upper[i] + 1e-6)
  }
})
