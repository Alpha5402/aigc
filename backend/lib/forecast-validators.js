// backend/lib/forecast-validators.js
// market-price-forecast Phase 1: 单调性 + 0 截断 + 请求/响应字段校验
// 关联：design.md §7.9 (单调性校验 + 0 截断), §3.3 (forecast_runs 字段)
// Validates: Requirement 3.2, 4.3, 4.4, 4.5, 4.6
// Properties: 10 (单调性 + 0 截断), 12 (null 不被替代), 13 (missing_mask 一致性)

const ALLOWED_HORIZONS = new Set([7, 30])
const MAX_HISTORY_LENGTH = 1825 // 5 年
const MIN_FAMILIES = 1
const MAX_FAMILIES = 13
const REQUEST_ID_MIN = 16
const REQUEST_ID_MAX = 64

const SUPPORTED_FAMILIES = new Set([
  'moving_average',
  'simple_exp_smoothing',
  'holt_winters',
  'arima',
  'sarima',
  'prophet',
  'xgboost',
  'random_forest',
  'lstm',
  'gru',
  'transformer',
  'timemixer',
  'nbeats',
  'dlinear',
])

const MISSING_REASONS = new Set(['holiday', 'market_closed', 'collection_failed', 'unknown'])

// === 校验：预测请求字段（Forecast_Engine → Model_Service）===
// 返回 { ok: true } 或 { ok: false, errors: string[] }
const validateForecastRequest = (req) => {
  const errors = []

  if (!req || typeof req !== 'object') {
    return { ok: false, errors: ['request_must_be_object'] }
  }

  // request_id（Requirement 3.9）
  if (typeof req.request_id !== 'string') {
    errors.push('request_id_required')
  } else if (req.request_id.length < REQUEST_ID_MIN || req.request_id.length > REQUEST_ID_MAX) {
    errors.push('request_id_length_out_of_range')
  }

  // spu_id
  if (typeof req.spu_id !== 'string' || !req.spu_id.trim()) {
    errors.push('spu_id_required')
  }

  // horizon_days
  if (!ALLOWED_HORIZONS.has(Number(req.horizon_days))) {
    errors.push('horizon_days_must_be_7_or_30')
  }

  // families
  if (!Array.isArray(req.families)) {
    errors.push('families_must_be_array')
  } else if (req.families.length < MIN_FAMILIES || req.families.length > MAX_FAMILIES) {
    errors.push('families_length_out_of_range')
  } else {
    const unknown = req.families.filter((f) => !SUPPORTED_FAMILIES.has(String(f)))
    if (unknown.length) errors.push(`families_unknown:${unknown.join(',')}`)
  }

  // history
  if (!req.history || typeof req.history !== 'object') {
    errors.push('history_required')
  } else {
    const { dates, values, missing_mask, forward_filled_values } = req.history
    if (!Array.isArray(dates) || !Array.isArray(values)) {
      errors.push('history_dates_values_required')
    } else if (dates.length !== values.length) {
      errors.push('history_dates_values_length_mismatch')
    } else if (values.length < 1 || values.length > MAX_HISTORY_LENGTH) {
      errors.push('history_length_out_of_range')
    }

    if (Array.isArray(missing_mask) && missing_mask.length !== (Array.isArray(values) ? values.length : -1)) {
      errors.push('history_missing_mask_length_mismatch')
    }
    if (
      Array.isArray(forward_filled_values) &&
      forward_filled_values.length !== (Array.isArray(values) ? values.length : -1)
    ) {
      errors.push('history_forward_filled_length_mismatch')
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true }
}

// === 工具：判断 missing_mask 与 values 是否自洽（Property 13）===
const validateMissingMaskAlignment = ({ values, missing_mask, forward_filled_values }) => {
  if (!Array.isArray(values) || !Array.isArray(missing_mask) || !Array.isArray(forward_filled_values)) {
    return { ok: false, error: 'arrays_required' }
  }
  if (values.length !== missing_mask.length || values.length !== forward_filled_values.length) {
    return { ok: false, error: 'length_mismatch' }
  }
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i]
    const m = missing_mask[i]
    const expected = v === null || v === undefined ? 1 : 0
    if (m !== expected) return { ok: false, error: `mask_mismatch_at_${i}` }
    if (forward_filled_values[i] === null || forward_filled_values[i] === undefined) {
      return { ok: false, error: `forward_fill_null_at_${i}` }
    }
  }
  return { ok: true }
}

// === 单调性 + 0 截断 ===
// 输入：{ point, ci80Lower, ci80Upper, ci95Lower, ci95Upper }，每个为同长度数组（数值或 null）
// 输出：
//   - { ok: true, status: 'active'|'clipped', point, ci80Lower, ci80Upper, ci95Lower, ci95Upper }
//   - { ok: false, status: 'degraded', reason: string }
const validateAndClip = (input) => {
  const { point, ci80Lower, ci80Upper, ci95Lower, ci95Upper } = input || {}
  const arrays = [point, ci80Lower, ci80Upper, ci95Lower, ci95Upper]
  if (arrays.some((a) => !Array.isArray(a))) {
    return { ok: false, status: 'degraded', reason: 'arrays_required' }
  }
  const len = point.length
  if (arrays.some((a) => a.length !== len)) {
    return { ok: false, status: 'degraded', reason: 'length_mismatch' }
  }

  // 复制数组以避免修改入参
  const out = {
    point: point.slice(),
    ci80Lower: ci80Lower.slice(),
    ci80Upper: ci80Upper.slice(),
    ci95Lower: ci95Lower.slice(),
    ci95Upper: ci95Upper.slice(),
  }

  let clipped = false

  for (let i = 0; i < len; i += 1) {
    const allNull =
      out.point[i] === null &&
      out.ci80Lower[i] === null &&
      out.ci80Upper[i] === null &&
      out.ci95Lower[i] === null &&
      out.ci95Upper[i] === null
    if (allNull) continue

    // Requirement 4.6 / Property 12：null 不能与数值混存
    const anyNull =
      out.point[i] === null ||
      out.ci80Lower[i] === null ||
      out.ci80Upper[i] === null ||
      out.ci95Lower[i] === null ||
      out.ci95Upper[i] === null
    if (anyNull) {
      return { ok: false, status: 'degraded', reason: `partial_null_at_${i}` }
    }

    // 必须有限实数
    for (const arr of [out.point, out.ci80Lower, out.ci80Upper, out.ci95Lower, out.ci95Upper]) {
      if (!Number.isFinite(arr[i])) {
        return { ok: false, status: 'degraded', reason: `non_finite_at_${i}` }
      }
    }

    // 0 截断：把所有负值（含上界）裁到 0，保持单调性。
    // 上界 < 0 在物理上不可能发生于价格场景；裁到 0 后区间退化为单点，
    // 但仍满足非负与单调约束（Requirement 4.5）。
    for (const arr of [out.point, out.ci80Lower, out.ci80Upper, out.ci95Lower, out.ci95Upper]) {
      if (arr[i] < 0) {
        arr[i] = 0
        clipped = true
      }
    }

    // 单调性校验（Requirement 4.3）
    const monotonic =
      out.ci95Lower[i] <= out.ci80Lower[i] + 1e-9 &&
      out.ci80Lower[i] <= out.point[i] + 1e-9 &&
      out.point[i] <= out.ci80Upper[i] + 1e-9 &&
      out.ci80Upper[i] <= out.ci95Upper[i] + 1e-9
    if (!monotonic) {
      return { ok: false, status: 'degraded', reason: `monotonic_violation_at_${i}` }
    }
  }

  return {
    ok: true,
    status: clipped ? 'clipped' : 'active',
    point: out.point,
    ci80Lower: out.ci80Lower,
    ci80Upper: out.ci80Upper,
    ci95Lower: out.ci95Lower,
    ci95Upper: out.ci95Upper,
  }
}

module.exports = {
  ALLOWED_HORIZONS,
  MAX_HISTORY_LENGTH,
  MIN_FAMILIES,
  MAX_FAMILIES,
  REQUEST_ID_MIN,
  REQUEST_ID_MAX,
  SUPPORTED_FAMILIES,
  MISSING_REASONS,
  validateForecastRequest,
  validateMissingMaskAlignment,
  validateAndClip,
}
