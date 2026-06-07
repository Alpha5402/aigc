// backend/lib/forecast-engine.js
// 价格预测引擎
//
// 两个大脑：
//   高级大脑（≥ 62 天历史）：调 GPU Model_Service，运行 DLinear + N-BEATS
//   备用大脑（< 62 天历史）：Node.js 内直接运行 MA + SES，不需要 GPU

'use strict'

const { db, nowIso } = require('./db')
const { signRequest, generateRequestId } = require('./forecast-signer')
const { validateAndClip } = require('./forecast-validators')
const { fallbackForecast } = require('./fallback-engine')
const { tryBorrowedHistory } = require('./borrowed-history')

// ─── 常量 ────────────────────────────────────────────────────────────────────
const HORIZONS = [7, 30]
const HISTORY_LOOKBACK_DAYS = 365

// 62 天是高级大脑 / 备用大脑的分界线
const DEEP_THRESHOLD = 62

const MS_TIMEOUT_MS = Number(process.env.MODEL_SERVICE_TIMEOUT_MS || 30_000)
const MS_BASE_URL = process.env.MODEL_SERVICE_BASE_URL || 'http://127.0.0.1:8000'
const MS_SHARED_SECRET = process.env.MODEL_SERVICE_SHARED_SECRET || ''

// 高级大脑：DLinear（趋势/季节）+ N-BEATS（短期波动）
const DEEP_FAMILIES = ['dlinear', 'nbeats']

// ─── 工具：加载历史价格 ───────────────────────────────────────────────────────
const loadHistory = (spuId, lookbackDays = HISTORY_LOOKBACK_DAYS) => {
  const rows = db
    .prepare(
      `SELECT observed_date, price FROM price_history
       WHERE spu_id = ? ORDER BY observed_date DESC LIMIT ?`,
    )
    .all(spuId, lookbackDays)

  if (!rows.length) return { dates: [], values: [], missingMask: [], forwardFilledValues: [] }
  rows.reverse()

  const dates = rows.map((r) => r.observed_date)
  const values = rows.map((r) => (r.price == null ? null : Number(r.price)))
  const missingMask = values.map((v) => (v == null ? 1 : 0))

  // 前向填充
  const forward = []
  let last = null
  for (const v of values) {
    if (v != null && Number.isFinite(v)) last = v
    forward.push(last)
  }
  let firstFinite = null
  for (const v of values) {
    if (v != null && Number.isFinite(v)) { firstFinite = v; break }
  }
  for (let i = 0; i < forward.length; i += 1) {
    if (forward[i] == null) forward[i] = firstFinite ?? 0
  }

  return { dates, values, missingMask, forwardFilledValues: forward }
}

// ─── 工具：等权融合（DLinear + N-BEATS 各占 50%）────────────────────────────
const fuseForecasts = (modelOutputs) => {
  if (!modelOutputs.length) return null
  const horizon = modelOutputs[0].point.length
  const n = modelOutputs.length
  const weight = 1 / n
  const weightMap = {}
  modelOutputs.forEach((m) => { weightMap[m.family] = weight })

  const avg = (arrays) => {
    return Array.from({ length: horizon }, (_, h) => {
      let acc = 0, cnt = 0
      for (const arr of arrays) {
        const v = arr[h]
        if (v != null && Number.isFinite(v)) { acc += v; cnt++ }
      }
      return cnt > 0 ? acc / cnt : null
    })
  }

  return {
    point:     avg(modelOutputs.map((m) => m.point)),
    ci80Lower: avg(modelOutputs.map((m) => m.ci80L)),
    ci80Upper: avg(modelOutputs.map((m) => m.ci80U)),
    ci95Lower: avg(modelOutputs.map((m) => m.ci95L)),
    ci95Upper: avg(modelOutputs.map((m) => m.ci95U)),
    weights: weightMap,
  }
}

// ─── 工具：调用 GPU Model_Service ────────────────────────────────────────────
const callModelService = async ({ requestId, spuId, history, horizonDays }) => {
  if (!MS_SHARED_SECRET) return { ok: false, reason: 'missing_shared_secret' }

  const path = '/forecast'
  const body = JSON.stringify({
    request_id: requestId,
    spu_id: spuId,
    horizon_days: horizonDays,
    families: DEEP_FAMILIES,
    history: {
      dates: history.dates,
      values: history.values,
      missing_mask: history.missingMask,
      forward_filled_values: history.forwardFilledValues,
    },
  })

  const { headers } = signRequest({ method: 'POST', path, body, secret: MS_SHARED_SECRET, requestId })
  const url = `${MS_BASE_URL.replace(/\/$/, '')}${path}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), MS_TIMEOUT_MS)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
      signal: ctrl.signal,
    })
    if (!resp.ok) return { ok: false, reason: `http_${resp.status}` }
    const data = await resp.json()
    if (!data || !Array.isArray(data.models)) return { ok: false, reason: 'invalid_response_shape' }
    return {
      ok: true,
      models: data.models.map((m) => ({
        family: m.family,
        version: m.version || 'unknown',
        status: m.status || 'success',
        point: m.point_estimates || [],
        ci80L: m.ci80_lower || [],
        ci80U: m.ci80_upper || [],
        ci95L: m.ci95_lower || [],
        ci95U: m.ci95_upper || [],
        inferenceMs: Number(m.inference_ms || 0),
        errorMessage: m.error_message || null,
      })),
      totalInferenceMs: Number(data.total_inference_ms || 0),
    }
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, reason: 'timeout' }
    return { ok: false, reason: `fetch_error:${e?.message || 'unknown'}` }
  } finally {
    clearTimeout(timer)
  }
}

// ─── 工具：持久化预测结果 ─────────────────────────────────────────────────────
const persistForecastRun = ({
  requestId, spuId, originDate, horizonDays, status,
  modelFamilies, weights, fused, perModel,
  borrowedHistoryFlag = 0, borrowedOriginIds = [], inferenceMs = null,
}) => {
  const generatedAt = nowIso()

  // 同键旧记录 → superseded
  if (['active', 'clipped', 'cold_start', 'degraded'].includes(status)) {
    db.prepare(
      `UPDATE forecast_runs SET status = 'superseded'
       WHERE spu_id = ? AND origin_date = ? AND horizon_days = ?
         AND status IN ('active','clipped','cold_start','degraded','qualitative-only')`,
    ).run(spuId, originDate, horizonDays)
  }

  const result = db.prepare(
    `INSERT INTO forecast_runs (
       request_id, spu_id, origin_date, horizon_days, status,
       model_families_json, weights_json, point_estimates_json,
       ci80_lower_json, ci80_upper_json, ci95_lower_json, ci95_upper_json,
       borrowed_history_flag, borrowed_origin_ids_json, generated_at, inference_ms
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    requestId, spuId, originDate, horizonDays, status,
    JSON.stringify(modelFamilies),
    JSON.stringify(weights || {}),
    JSON.stringify(fused?.point || []),
    JSON.stringify(fused?.ci80Lower || []),
    JSON.stringify(fused?.ci80Upper || []),
    JSON.stringify(fused?.ci95Lower || []),
    JSON.stringify(fused?.ci95Upper || []),
    borrowedHistoryFlag ? 1 : 0,
    JSON.stringify(borrowedOriginIds),
    generatedAt,
    inferenceMs == null ? null : Number(inferenceMs),
  )
  const forecastRunId = Number(result.lastInsertRowid)

  if (Array.isArray(perModel)) {
    const stmt = db.prepare(
      `INSERT INTO forecast_run_models (
         forecast_run_id, model_family, model_version, status, weight,
         point_estimates_json, ci80_lower_json, ci80_upper_json,
         ci95_lower_json, ci95_upper_json, inference_ms, error_message, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const m of perModel) {
      stmt.run(
        forecastRunId, m.family, m.version || 'unknown', m.status || 'success',
        Number(weights?.[m.family] ?? 0),
        JSON.stringify(m.point || []),
        JSON.stringify(m.ci80L || []),
        JSON.stringify(m.ci80U || []),
        JSON.stringify(m.ci95L || []),
        JSON.stringify(m.ci95U || []),
        m.inferenceMs == null ? null : Number(m.inferenceMs),
        m.errorMessage || null,
        generatedAt,
      )
    }
  }

  return { forecastRunId, generatedAt, status }
}

// ─── 备用大脑：直接用 Node.js fallback 产出预测 ───────────────────────────────
const runFallback = ({ requestId, spuId, originDate, horizonDays, history, borrowedHistoryFlag, borrowedOriginIds, isColdStart }) => {
  const fb = fallbackForecast({ history: history.forwardFilledValues, horizonDays })
  if (!fb) {
    return persistForecastRun({
      requestId, spuId, originDate, horizonDays,
      status: 'qualitative-only',
      modelFamilies: [], weights: {},
      fused: { point: [], ci80Lower: [], ci80Upper: [], ci95Lower: [], ci95Upper: [] },
      perModel: [], borrowedHistoryFlag, borrowedOriginIds,
    })
  }
  const validated = validateAndClip({
    point: fb.point, ci80Lower: fb.ci80Lower, ci80Upper: fb.ci80Upper,
    ci95Lower: fb.ci95Lower, ci95Upper: fb.ci95Upper,
  })
  const status = isColdStart ? 'cold_start' : (validated.ok ? validated.status : 'degraded')
  return persistForecastRun({
    requestId, spuId, originDate, horizonDays, status,
    modelFamilies: [fb.family],
    weights: { [fb.family]: 1.0 },
    fused: validated.ok
      ? { point: validated.point, ci80Lower: validated.ci80Lower, ci80Upper: validated.ci80Upper, ci95Lower: validated.ci95Lower, ci95Upper: validated.ci95Upper }
      : { point: fb.point, ci80Lower: fb.ci80Lower, ci80Upper: fb.ci80Upper, ci95Lower: fb.ci95Lower, ci95Upper: fb.ci95Upper },
    perModel: [{ family: fb.family, version: 'fallback', status: 'success', point: fb.point, ci80L: fb.ci80Lower, ci80U: fb.ci80Upper, ci95L: fb.ci95Lower, ci95U: fb.ci95Upper }],
    borrowedHistoryFlag, borrowedOriginIds,
  })
}

// ─── 主流程：单 SPU 单 horizon ────────────────────────────────────────────────
const forecastOne = async ({ spuId, horizonDays = 7, originDate }) => {
  const requestId = generateRequestId()
  const today = originDate || new Date().toISOString().slice(0, 10)

  let history = loadHistory(spuId)
  let borrowedHistoryFlag = 0
  let borrowedOriginIds = []

  // 数据不足时尝试借同品种其他产地的数据
  if (history.values.length < DEEP_THRESHOLD) {
    const borrowed = tryBorrowedHistory(spuId, 30)
    if (borrowed && borrowed.values.length) {
      borrowedHistoryFlag = 1
      borrowedOriginIds = borrowed.originIds
      history = {
        dates: borrowed.dates,
        values: borrowed.values,
        missingMask: borrowed.values.map(() => 0),
        forwardFilledValues: borrowed.values.slice(),
      }
    }
  }

  const historyLen = history.values.filter((v) => v != null).length

  // ── 备用大脑：< 62 天，用 MA / SES ──────────────────────────────────────────
  if (historyLen < DEEP_THRESHOLD) {
    return runFallback({
      requestId, spuId, originDate: today, horizonDays,
      history, borrowedHistoryFlag, borrowedOriginIds,
      isColdStart: true,
    })
  }

  // ── 高级大脑：≥ 62 天，调 GPU DLinear + N-BEATS ──────────────────────────────
  const msResult = await callModelService({ requestId, spuId, history, horizonDays })

  if (!msResult.ok) {
    // GPU 不可用时降级到备用大脑
    return runFallback({
      requestId, spuId, originDate: today, horizonDays,
      history, borrowedHistoryFlag, borrowedOriginIds,
      isColdStart: false,
    })
  }

  const succeeded = msResult.models.filter((m) => m.status === 'success')
  if (!succeeded.length) {
    return runFallback({
      requestId, spuId, originDate: today, horizonDays,
      history, borrowedHistoryFlag, borrowedOriginIds,
      isColdStart: false,
    })
  }

  // DLinear + N-BEATS 等权融合
  const fused = fuseForecasts(succeeded)
  const validated = validateAndClip({
    point: fused.point, ci80Lower: fused.ci80Lower, ci80Upper: fused.ci80Upper,
    ci95Lower: fused.ci95Lower, ci95Upper: fused.ci95Upper,
  })

  return persistForecastRun({
    requestId, spuId, originDate: today, horizonDays,
    status: validated.ok ? validated.status : 'degraded',
    modelFamilies: succeeded.map((m) => m.family),
    weights: fused.weights,
    fused: validated.ok
      ? { point: validated.point, ci80Lower: validated.ci80Lower, ci80Upper: validated.ci80Upper, ci95Lower: validated.ci95Lower, ci95Upper: validated.ci95Upper }
      : fused,
    perModel: msResult.models,
    borrowedHistoryFlag, borrowedOriginIds,
    inferenceMs: msResult.totalInferenceMs,
  })
}

// ─── 批量入口 ─────────────────────────────────────────────────────────────────
const forecastDailyAll = async ({ horizons = HORIZONS, spuIds = null } = {}) => {
  const baseSql = "SELECT spu_id FROM spu_tuples WHERE status = 'active'"
  const rows = Array.isArray(spuIds) && spuIds.length
    ? db.prepare(`${baseSql} AND spu_id IN (${spuIds.map(() => '?').join(',')})`).all(...spuIds)
    : db.prepare(baseSql).all()

  const summary = { total: rows.length * horizons.length, success: 0, degraded: 0, coldStart: 0, qualitative: 0, clipped: 0 }
  for (const row of rows) {
    for (const h of horizons) {
      try {
        const r = await forecastOne({ spuId: row.spu_id, horizonDays: h })
        switch (r.status) {
          case 'active':    summary.success += 1; break
          case 'clipped':   summary.clipped += 1; break
          case 'degraded':  summary.degraded += 1; break
          case 'cold_start': summary.coldStart += 1; break
          case 'qualitative-only': summary.qualitative += 1; break
        }
      } catch (_e) {
        summary.degraded += 1
      }
    }
  }
  return summary
}

// ─── 读路径 ───────────────────────────────────────────────────────────────────
const readLatestActive = (spuId, horizonDays = 7) => {
  const row = db
    .prepare(
      `SELECT * FROM forecast_runs
       WHERE spu_id = ? AND horizon_days = ?
         AND status IN ('active','clipped','cold_start','degraded','qualitative-only')
       ORDER BY generated_at DESC LIMIT 1`,
    )
    .get(spuId, horizonDays)
  if (!row) return null
  return {
    forecastRunId: row.id,
    spuId: row.spu_id,
    originDate: row.origin_date,
    horizonDays: row.horizon_days,
    status: row.status,
    modelFamilies: JSON.parse(row.model_families_json || '[]'),
    weights: JSON.parse(row.weights_json || '{}'),
    point: JSON.parse(row.point_estimates_json || '[]'),
    ci80Lower: JSON.parse(row.ci80_lower_json || '[]'),
    ci80Upper: JSON.parse(row.ci80_upper_json || '[]'),
    ci95Lower: JSON.parse(row.ci95_lower_json || '[]'),
    ci95Upper: JSON.parse(row.ci95_upper_json || '[]'),
    borrowedHistoryFlag: !!row.borrowed_history_flag,
    borrowedOriginIds: JSON.parse(row.borrowed_origin_ids_json || '[]'),
    generatedAt: row.generated_at,
    inferenceMs: row.inference_ms,
  }
}

module.exports = {
  HORIZONS,
  HISTORY_LOOKBACK_DAYS,
  DEEP_THRESHOLD,
  DEEP_FAMILIES,
  loadHistory,
  fuseForecasts,
  forecastOne,
  forecastDailyAll,
  readLatestActive,
  __callModelService: callModelService,
  __persistForecastRun: persistForecastRun,
}
