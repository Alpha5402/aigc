// backend/lib/fallback-engine.js
// 备用大脑：纯 Node.js 实现，零外部依赖
//
// 当历史数据 < 62 天，或 GPU Model_Service 不可用时，自动启用。
// 算法：
//   - 移动平均 (MA)：最近 N 天均值平推
//   - 简单指数平滑 (SES)：越近的价格权重越大，自动搜索最优 α

'use strict'

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

// 前向填充（null → 用前一个有效值填）
const forwardFill = (series) => {
  const out = series.slice()
  let last = null
  for (let i = 0; i < out.length; i += 1) {
    if (isFiniteNumber(out[i])) { last = out[i] }
    else if (last !== null) { out[i] = last }
  }
  // 首部仍为 null：用第一个有限值反向填
  let firstFinite = null
  for (let i = 0; i < out.length; i += 1) {
    if (isFiniteNumber(out[i])) { firstFinite = out[i]; break }
  }
  if (firstFinite === null) return null
  for (let i = 0; i < out.length; i += 1) {
    if (!isFiniteNumber(out[i])) out[i] = firstFinite
  }
  return out
}

const meanOf = (arr) => {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

const sampleStd = (arr) => {
  if (arr.length < 2) return 0
  const m = meanOf(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1))
}

// ── 移动平均 ──────────────────────────────────────────────────────────────────
const movingAverage = (series, { window = 7, horizon = 7 } = {}) => {
  const filled = forwardFill(series)
  if (!filled) return null
  const slice = filled.slice(-Math.min(window, filled.length))
  const m = meanOf(slice)
  const point = new Array(horizon).fill(m)
  const residuals = slice.map((v) => v - m)
  return { point, residuals, family: 'moving_average' }
}

// ── 简单指数平滑 ──────────────────────────────────────────────────────────────
const sesOnce = (series, alpha) => {
  let level = series[0]
  const fitted = [level]
  for (let i = 1; i < series.length; i += 1) {
    level = alpha * series[i] + (1 - alpha) * level
    fitted.push(level)
  }
  return { level, fitted }
}

const simpleExponentialSmoothing = (series, { horizon = 7, alphas = [0.1, 0.3, 0.5, 0.7] } = {}) => {
  const filled = forwardFill(series)
  if (!filled || filled.length < 2) return null
  let best = null
  for (const alpha of alphas) {
    const { level, fitted } = sesOnce(filled, alpha)
    const mse = filled.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0) / filled.length
    if (!best || mse < best.mse) best = { alpha, level, fitted, mse }
  }
  const point = new Array(horizon).fill(best.level)
  const residuals = filled.map((v, i) => v - best.fitted[i])
  return { point, residuals, alpha: best.alpha, family: 'simple_exp_smoothing' }
}

// ── 置信区间（残差标准差 × z 分位数）────────────────────────────────────────
const residualBasedCI = (point, residuals, level) => {
  const z = level === 0.95 ? 1.96 : 1.282
  const std = sampleStd(residuals.filter(isFiniteNumber))
  const margin = z * std
  return {
    lower: point.map((p) => p - margin),
    upper: point.map((p) => p + margin),
  }
}

// ── 主入口 ────────────────────────────────────────────────────────────────────
// 自动选择算法：
//   ≥ 14 天 → SES（越近权重越大）
//   < 14 天 → MA（简单均值）
const fallbackForecast = ({ history, horizonDays = 7 }) => {
  if (!Array.isArray(history) || !history.length) return null
  const horizon = Number(horizonDays) === 30 ? 30 : 7
  const len = history.length

  let result = null
  if (len >= 14) {
    result = simpleExponentialSmoothing(history, { horizon })
  }
  if (!result) {
    result = movingAverage(history, { window: Math.min(7, len), horizon })
  }
  if (!result) return null

  const ci80 = residualBasedCI(result.point, result.residuals, 0.8)
  const ci95 = residualBasedCI(result.point, result.residuals, 0.95)

  return {
    point: result.point,
    ci80Lower: ci80.lower,
    ci80Upper: ci80.upper,
    ci95Lower: ci95.lower,
    ci95Upper: ci95.upper,
    family: result.family,
  }
}

module.exports = {
  forwardFill,
  meanOf,
  sampleStd,
  movingAverage,
  simpleExponentialSmoothing,
  residualBasedCI,
  fallbackForecast,
}
