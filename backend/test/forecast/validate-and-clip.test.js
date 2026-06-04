// Feature: market-price-forecast, Property 10: 单调性 + 0 截断, Property 12: null 不被替代
// Validates: Requirement 4.3, 4.4, 4.5, 4.6

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fc = require('fast-check')

const {
  validateAndClip,
  validateForecastRequest,
  validateMissingMaskAlignment,
} = require('../../lib/forecast-validators')

test('Property 10: 已单调输入返回 active 且不变', () => {
  const r = validateAndClip({
    point:     [4.5, 4.6, 4.7],
    ci80Lower: [4.0, 4.1, 4.2],
    ci80Upper: [5.0, 5.1, 5.2],
    ci95Lower: [3.5, 3.6, 3.7],
    ci95Upper: [5.5, 5.6, 5.7],
  })
  assert.equal(r.ok, true)
  assert.equal(r.status, 'active')
  assert.deepEqual(r.point, [4.5, 4.6, 4.7])
})

test('Property 10: 任一日 point<0 → clipped 且下界归零', () => {
  const r = validateAndClip({
    point:     [-0.5, 1.0],
    ci80Lower: [-1.0, 0.5],
    ci80Upper: [0.5, 1.5],
    ci95Lower: [-1.5, 0.0],
    ci95Upper: [1.0, 2.0],
  })
  assert.equal(r.ok, true)
  assert.equal(r.status, 'clipped')
  assert.equal(r.point[0], 0)
  assert.equal(r.ci80Lower[0], 0)
  assert.equal(r.ci95Lower[0], 0)
  assert.equal(r.ci80Upper[0], 0.5)
  assert.equal(r.ci95Upper[0], 1)
})

test('Property 10: 单调性失败 → degraded', () => {
  const r = validateAndClip({
    point:     [4.5, 4.6],
    ci80Lower: [5.0, 4.1], // 注意 ci80Lower > point
    ci80Upper: [5.5, 5.1],
    ci95Lower: [4.0, 3.6],
    ci95Upper: [6.0, 5.6],
  })
  assert.equal(r.ok, false)
  assert.equal(r.status, 'degraded')
  assert.match(r.reason, /monotonic/)
})

test('Property 12: 全 null 行被保留', () => {
  const r = validateAndClip({
    point:     [4.5, null, 4.7],
    ci80Lower: [4.0, null, 4.2],
    ci80Upper: [5.0, null, 5.2],
    ci95Lower: [3.5, null, 3.7],
    ci95Upper: [5.5, null, 5.7],
  })
  assert.equal(r.ok, true)
  assert.equal(r.status, 'active')
  assert.equal(r.point[1], null)
})

test('Property 12: 部分 null 部分数值 → degraded', () => {
  const r = validateAndClip({
    point:     [4.5, null],
    ci80Lower: [4.0, 0.5],
    ci80Upper: [5.0, null],
    ci95Lower: [3.5, 0.0],
    ci95Upper: [5.5, 1.0],
  })
  assert.equal(r.ok, false)
  assert.equal(r.status, 'degraded')
  assert.match(r.reason, /partial_null/)
})

test('Property 10 PBT (200 iter): 任意通过校验的输出严格单调', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          ci95L: fc.float({ min: -10, max: 50, noNaN: true, noDefaultInfinity: true }),
          d1:    fc.float({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
          d2:    fc.float({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
          d3:    fc.float({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
          d4:    fc.float({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
        }),
        { minLength: 1, maxLength: 30 },
      ),
      (rows) => {
        // 构造严格单调输入
        const point = []
        const ci80L = []
        const ci80U = []
        const ci95L = []
        const ci95U = []
        for (const r of rows) {
          ci95L.push(r.ci95L)
          ci80L.push(r.ci95L + r.d1)
          point.push(r.ci95L + r.d1 + r.d2)
          ci80U.push(r.ci95L + r.d1 + r.d2 + r.d3)
          ci95U.push(r.ci95L + r.d1 + r.d2 + r.d3 + r.d4)
        }
        const out = validateAndClip({
          point,
          ci80Lower: ci80L,
          ci80Upper: ci80U,
          ci95Lower: ci95L,
          ci95Upper: ci95U,
        })
        assert.equal(out.ok, true)
        // 校验输出仍然单调
        for (let i = 0; i < out.point.length; i += 1) {
          assert.ok(out.ci95Lower[i] <= out.ci80Lower[i] + 1e-9)
          assert.ok(out.ci80Lower[i] <= out.point[i] + 1e-9)
          assert.ok(out.point[i] <= out.ci80Upper[i] + 1e-9)
          assert.ok(out.ci80Upper[i] <= out.ci95Upper[i] + 1e-9)
          // clipped 时下界为 0
          if (out.status === 'clipped') {
            assert.ok(out.point[i] >= 0)
            assert.ok(out.ci80Lower[i] >= 0)
            assert.ok(out.ci95Lower[i] >= 0)
          }
        }
      },
    ),
    { numRuns: 200 },
  )
})

// === validateForecastRequest ===

test('validateForecastRequest: 合法请求通过', () => {
  const r = validateForecastRequest({
    request_id: 'r'.repeat(20),
    spu_id: 'spu_test',
    horizon_days: 7,
    families: ['arima', 'lstm'],
    history: {
      dates: ['2026-01-01', '2026-01-02'],
      values: [4.5, 4.6],
      missing_mask: [0, 0],
      forward_filled_values: [4.5, 4.6],
    },
  })
  assert.equal(r.ok, true)
})

test('validateForecastRequest: horizon ≠ 7/30 拒绝', () => {
  const r = validateForecastRequest({
    request_id: 'r'.repeat(20),
    spu_id: 'spu_test',
    horizon_days: 14,
    families: ['arima'],
    history: { dates: ['2026-01-01'], values: [4.5] },
  })
  assert.equal(r.ok, false)
  assert.ok(r.errors.includes('horizon_days_must_be_7_or_30'))
})

test('validateForecastRequest: families 长度越界', () => {
  const r = validateForecastRequest({
    request_id: 'r'.repeat(20),
    spu_id: 'spu_test',
    horizon_days: 7,
    families: [],
    history: { dates: ['2026-01-01'], values: [4.5] },
  })
  assert.equal(r.ok, false)
  assert.ok(r.errors.includes('families_length_out_of_range'))
})

test('validateForecastRequest: dates/values 长度不一致', () => {
  const r = validateForecastRequest({
    request_id: 'r'.repeat(20),
    spu_id: 'spu_test',
    horizon_days: 7,
    families: ['arima'],
    history: { dates: ['2026-01-01', '2026-01-02'], values: [4.5] },
  })
  assert.equal(r.ok, false)
  assert.ok(r.errors.includes('history_dates_values_length_mismatch'))
})

test('validateForecastRequest: request_id 长度不足', () => {
  const r = validateForecastRequest({
    request_id: 'short',
    spu_id: 'spu_test',
    horizon_days: 7,
    families: ['arima'],
    history: { dates: ['2026-01-01'], values: [4.5] },
  })
  assert.equal(r.ok, false)
  assert.ok(r.errors.includes('request_id_length_out_of_range'))
})

// === validateMissingMaskAlignment ===

test('Property 13: missing_mask 与 values 自洽', () => {
  const r = validateMissingMaskAlignment({
    values: [4.5, null, 4.7],
    missing_mask: [0, 1, 0],
    forward_filled_values: [4.5, 4.5, 4.7],
  })
  assert.equal(r.ok, true)
})

test('Property 13: missing_mask 错位被检出', () => {
  const r = validateMissingMaskAlignment({
    values: [4.5, null, 4.7],
    missing_mask: [0, 0, 0], // 应是 [0,1,0]
    forward_filled_values: [4.5, 4.5, 4.7],
  })
  assert.equal(r.ok, false)
  assert.match(r.error, /mask_mismatch/)
})

test('Property 13: forward_filled 不能含 null', () => {
  const r = validateMissingMaskAlignment({
    values: [4.5, null],
    missing_mask: [0, 1],
    forward_filled_values: [4.5, null],
  })
  assert.equal(r.ok, false)
  assert.match(r.error, /forward_fill_null/)
})
