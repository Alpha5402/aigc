// backend/lib/price-collector.js
// market-price-forecast Phase 1, Task 1.6.1
// 关联：design.md §5.4-§5.6, requirements.md #1.4-#1.9
// Validates: Requirement 1.4-1.9
// Properties: 2 (写入完整性), 3 (优先级合并), 4 (合法性), 5 (单点不阻塞)
//
// 入口：collectDaily({ requestId, manual, spuIds?, sources?, urlOverrides? })
//   - 取 active SPU（可由 spuIds 缩窄）× 取 sources（默认 4 个公开来源）
//   - 对每对 (spu, source)：
//       1) 构造目标 URL（默认 SOURCE_URL_TEMPLATES，可由 urlOverrides 注入）
//       2) 走 robots-cache 检查
//       3) 走 source-circuit-breaker 检查
//       4) http-fetch.fetchWithBudget 抓取 HTML
//       5) extractor 解析 → { price, observed_date, raw_text }
//       6) 价格合法性校验
//       7) 与 price_history 合并（按来源优先级）
//       8) 写 collection_logs
//   - 单 SPU 失败不阻塞批次

'use strict'

const crypto = require('node:crypto')
const { db, nowIso } = require('./db')
const { fetchWithBudget } = require('./http-fetch')
const robotsCache = require('./robots-cache')
const circuitBreaker = require('./source-circuit-breaker')
const {
  KNOWN_SOURCES,
  getExtractor,
  getSourcePriority,
} = require('./price-extractors')

const PRICE_MIN_EXCLUSIVE = 0
const PRICE_MAX_INCLUSIVE = 1_000_000

// 默认每个 SPU × source 的目标 URL 模板。
// 这里不内置 URL，避免和 market-rag 重复硬编码；调用方通过 urlOverrides 提供。
// 当 urlOverrides[source] === undefined 时，跳过该 source（reason='no_url_configured'）。
const DEFAULT_SOURCE_URL_BUILDERS = {
  // 留给 caller 注入；本文件只关注采集流程
}

// === 工具：log ===
const writeLog = ({
  requestId,
  spuId,
  sourceName,
  sourceUrl,
  status,
  httpStatus,
  durationMs,
  reason,
  rawText,
  triggeredBy = 'scheduler',
  triggeredUserId = null,
}) => {
  db.prepare(
    `INSERT INTO collection_logs (
       request_id, spu_id, source_name, source_url,
       status, http_status, duration_ms, reason, raw_text,
       triggered_by, triggered_user_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    String(requestId || ''),
    spuId || null,
    sourceName,
    sourceUrl || null,
    status,
    httpStatus == null ? null : Number(httpStatus),
    durationMs == null ? null : Number(durationMs),
    reason ? String(reason) : null,
    rawText == null ? null : String(rawText),
    triggeredBy,
    triggeredUserId,
    nowIso(),
  )
}

// === 工具：合并价格 ===
// 按来源优先级合并；保留旧记录的来源标识/url/采集时间 在 raw_text 内（避免新增列）
const mergePriceRow = ({
  spuId,
  observedDate,
  price,
  sourceName,
  sourceUrl,
  rawText,
  requestId,
}) => {
  const sourcePriority = getSourcePriority(sourceName)
  const existing = db
    .prepare(
      `SELECT spu_id, observed_date, price, source_name, source_url, source_priority,
              raw_text, collected_at
       FROM price_history WHERE spu_id = ? AND observed_date = ?`,
    )
    .get(spuId, observedDate)

  const now = nowIso()

  if (!existing) {
    db.prepare(
      `INSERT INTO price_history (
         spu_id, observed_date, price,
         source_name, source_url, source_priority,
         raw_text, missing_reason, collected_at, request_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      spuId,
      observedDate,
      price,
      sourceName,
      sourceUrl,
      sourcePriority,
      rawText,
      now,
      requestId,
    )
    return { action: 'insert' }
  }

  if (sourcePriority < existing.source_priority) {
    // 高优替换低优；把旧来源审计写到 raw_text 里
    const prevAudit = `[PREV ${existing.source_name} prio=${existing.source_priority} url=${existing.source_url} at=${existing.collected_at} raw=${existing.raw_text || ''}]`
    db.prepare(
      `UPDATE price_history SET
         price = ?, source_name = ?, source_url = ?, source_priority = ?,
         raw_text = ?, collected_at = ?, request_id = ?
       WHERE spu_id = ? AND observed_date = ?`,
    ).run(
      price,
      sourceName,
      sourceUrl,
      sourcePriority,
      `${rawText || ''} ${prevAudit}`.trim(),
      now,
      requestId,
      spuId,
      observedDate,
    )
    return { action: 'replace' }
  }

  return { action: 'skip', reason: 'lower_priority' }
}

// 写一条 missing 价格行（节假日/采集失败）
const writeMissingPriceRow = ({
  spuId,
  observedDate,
  sourceName,
  sourceUrl,
  reason,
  requestId,
}) => {
  const validReason = ['holiday', 'market_closed', 'collection_failed', 'unknown'].includes(reason)
    ? reason
    : 'collection_failed'
  const sourcePriority = getSourcePriority(sourceName)
  const now = nowIso()
  // 仅当当日尚无任何记录时才写 missing；否则跳过（避免覆盖真实数据）
  const exists = db
    .prepare('SELECT 1 FROM price_history WHERE spu_id = ? AND observed_date = ?')
    .get(spuId, observedDate)
  if (exists) return { action: 'skip', reason: 'price_exists' }
  db.prepare(
    `INSERT INTO price_history (
       spu_id, observed_date, price,
       source_name, source_url, source_priority,
       raw_text, missing_reason, collected_at, request_id
     ) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?)`,
  ).run(
    spuId,
    observedDate,
    sourceName,
    sourceUrl || '',
    sourcePriority,
    validReason,
    now,
    requestId,
  )
  return { action: 'insert_missing' }
}

// === 工具：价格合法性校验 ===
// Property 4
const validatePrice = (value) => {
  const v = Number(value)
  if (!Number.isFinite(v)) return { ok: false, reason: 'price_not_finite' }
  if (v <= PRICE_MIN_EXCLUSIVE) return { ok: false, reason: 'price_le_zero' }
  if (v > PRICE_MAX_INCLUSIVE) return { ok: false, reason: 'price_too_large' }
  return { ok: true, value: v }
}

// === 工具：取 active SPU + variety 信息 ===
const fetchActiveSpus = (spuIds) => {
  const baseSql = `
    SELECT s.spu_id, s.display_name AS spu_display, s.variety_id,
           v.code AS variety_code, v.display_name AS variety_display
    FROM spu_tuples s
    JOIN varieties v ON v.id = s.variety_id
    WHERE s.status = 'active' AND v.status = 'active'
  `
  if (Array.isArray(spuIds) && spuIds.length) {
    const placeholders = spuIds.map(() => '?').join(',')
    return db.prepare(`${baseSql} AND s.spu_id IN (${placeholders})`).all(...spuIds)
  }
  return db.prepare(baseSql).all()
}

// 取 variety 的所有别名，按 source_name 分组
const fetchAliasesByVariety = (varietyId) => {
  const rows = db
    .prepare('SELECT source_name, alias FROM variety_aliases WHERE variety_id = ?')
    .all(varietyId)
  const grouped = {}
  for (const r of rows) {
    if (!grouped[r.source_name]) grouped[r.source_name] = []
    grouped[r.source_name].push(r.alias)
  }
  return grouped
}

// === 单次 (spu, source) 采集 ===
// urlBuilder(spu, sourceName) → string | null
const collectOne = async ({
  spu,
  sourceName,
  sourceUrl,
  requestId,
  triggeredBy,
  triggeredUserId,
}) => {
  if (!sourceUrl) {
    writeLog({
      requestId,
      spuId: spu.spu_id,
      sourceName,
      sourceUrl: null,
      status: 'skipped',
      reason: 'no_url_configured',
      triggeredBy,
      triggeredUserId,
    })
    return { status: 'skipped' }
  }

  // 1) 熔断器
  if (circuitBreaker.isPaused(sourceName)) {
    writeLog({
      requestId,
      spuId: spu.spu_id,
      sourceName,
      sourceUrl,
      status: 'circuit_break',
      reason: 'source_paused',
      triggeredBy,
      triggeredUserId,
    })
    return { status: 'circuit_break' }
  }

  // 2) robots
  let robotsResult
  try {
    robotsResult = await robotsCache.isAllowed(sourceUrl)
  } catch (e) {
    robotsResult = { allowed: false, reason: 'fetch_error' }
  }
  if (!robotsResult.allowed) {
    writeLog({
      requestId,
      spuId: spu.spu_id,
      sourceName,
      sourceUrl,
      status: 'skipped',
      reason: `robots:${robotsResult.reason}`,
      triggeredBy,
      triggeredUserId,
    })
    return { status: 'skipped' }
  }

  // 3) 抓取
  let fetched
  try {
    fetched = await fetchWithBudget(sourceUrl, { timeoutMs: 30_000 })
  } catch (e) {
    fetched = { status: 0, html: '', durationMs: 0, timedOut: false, error: e }
  }

  if (fetched.timedOut || fetched.status === 0 || fetched.status >= 500) {
    circuitBreaker.record(sourceName, 'failure')
    writeLog({
      requestId,
      spuId: spu.spu_id,
      sourceName,
      sourceUrl,
      status: 'failed',
      httpStatus: fetched.status,
      durationMs: fetched.durationMs,
      reason: fetched.timedOut ? 'timeout' : `http_${fetched.status || 0}`,
      triggeredBy,
      triggeredUserId,
    })
    return { status: 'failed' }
  }

  if (fetched.status >= 400) {
    // 4xx 一般是 URL 错配，不算来源故障
    writeLog({
      requestId,
      spuId: spu.spu_id,
      sourceName,
      sourceUrl,
      status: 'failed',
      httpStatus: fetched.status,
      durationMs: fetched.durationMs,
      reason: `http_${fetched.status}`,
      triggeredBy,
      triggeredUserId,
    })
    return { status: 'failed' }
  }

  // 4) 抽取
  const extractor = getExtractor(sourceName)
  if (!extractor) {
    writeLog({
      requestId,
      spuId: spu.spu_id,
      sourceName,
      sourceUrl,
      status: 'failed',
      durationMs: fetched.durationMs,
      reason: 'no_extractor',
      triggeredBy,
      triggeredUserId,
    })
    return { status: 'failed' }
  }

  const aliases = fetchAliasesByVariety(spu.variety_id)
  const sourceAliases = aliases[sourceName] || []
  const variety = {
    displayName: spu.variety_display,
    aliases: sourceAliases,
  }

  let result
  try {
    result = extractor.extract(fetched.html, { variety, sourceUrl })
  } catch (e) {
    result = null
    writeLog({
      requestId,
      spuId: spu.spu_id,
      sourceName,
      sourceUrl,
      status: 'failed',
      httpStatus: fetched.status,
      durationMs: fetched.durationMs,
      reason: `extract_error:${e?.message || 'unknown'}`,
      triggeredBy,
      triggeredUserId,
    })
    circuitBreaker.record(sourceName, 'success') // 抽取异常但来源 200，不算来源故障
    return { status: 'failed' }
  }

  if (!result) {
    circuitBreaker.record(sourceName, 'success')
    writeLog({
      requestId,
      spuId: spu.spu_id,
      sourceName,
      sourceUrl,
      status: 'skipped',
      httpStatus: fetched.status,
      durationMs: fetched.durationMs,
      reason: 'no_price_extracted',
      triggeredBy,
      triggeredUserId,
    })
    return { status: 'skipped' }
  }

  // 5) 价格合法性
  const validation = validatePrice(result.price)
  if (!validation.ok) {
    circuitBreaker.record(sourceName, 'success')
    writeLog({
      requestId,
      spuId: spu.spu_id,
      sourceName,
      sourceUrl,
      status: 'rejected',
      httpStatus: fetched.status,
      durationMs: fetched.durationMs,
      reason: validation.reason,
      rawText: result.rawText,
      triggeredBy,
      triggeredUserId,
    })
    return { status: 'rejected' }
  }

  // 6) 落库（按来源优先级合并）
  // observedDate 兜底：如果 extractor 没抽到日期，则用今天
  const observedDate = result.observedDate || new Date().toISOString().slice(0, 10)
  const merge = mergePriceRow({
    spuId: spu.spu_id,
    observedDate,
    price: validation.value,
    sourceName,
    sourceUrl,
    rawText: result.rawText || '',
    requestId,
  })

  circuitBreaker.record(sourceName, 'success')
  writeLog({
    requestId,
    spuId: spu.spu_id,
    sourceName,
    sourceUrl,
    status: 'success',
    httpStatus: fetched.status,
    durationMs: fetched.durationMs,
    reason: merge.action,
    rawText: result.rawText,
    triggeredBy,
    triggeredUserId,
  })

  return { status: 'success', merge: merge.action, price: validation.value, observedDate }
}

// === 主入口 ===
// options:
//   requestId?: string（默认自动生成）
//   manual?: boolean（true 写入 triggered_by='admin_manual'）
//   triggeredUserId?: number
//   spuIds?: string[]（不传默认所有 active）
//   sources?: string[]（默认 4 个公开来源）
//   urlBuilder?: (spu, sourceName) => string | null  ← 由调用方注入
//   throwOnError?: boolean（默认 false：单 SPU 失败不阻塞批次）
const collectDaily = async (options = {}) => {
  const requestId = options.requestId || `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
  const triggeredBy = options.manual ? 'admin_manual' : 'scheduler'
  const triggeredUserId = options.triggeredUserId || null
  const sources = Array.isArray(options.sources) && options.sources.length
    ? options.sources.filter((s) => KNOWN_SOURCES.includes(s))
    : KNOWN_SOURCES.slice()
  const urlBuilder = typeof options.urlBuilder === 'function' ? options.urlBuilder : () => null

  const spus = fetchActiveSpus(options.spuIds)
  const summary = {
    requestId,
    triggeredBy,
    spuCount: spus.length,
    sourceCount: sources.length,
    success: 0,
    rejected: 0,
    skipped: 0,
    failed: 0,
    circuitBreak: 0,
  }

  for (const spu of spus) {
    for (const source of sources) {
      let url = null
      try {
        url = urlBuilder(spu, source) || null
      } catch (_e) {
        url = null
      }
      let outcome
      try {
        outcome = await collectOne({
          spu,
          sourceName: source,
          sourceUrl: url,
          requestId,
          triggeredBy,
          triggeredUserId,
        })
      } catch (e) {
        // 任何异常都记日志但不中断
        writeLog({
          requestId,
          spuId: spu.spu_id,
          sourceName: source,
          sourceUrl: url,
          status: 'failed',
          reason: `unhandled:${e?.message || 'unknown'}`,
          triggeredBy,
          triggeredUserId,
        })
        outcome = { status: 'failed' }
      }
      switch (outcome.status) {
        case 'success':
          summary.success += 1
          break
        case 'rejected':
          summary.rejected += 1
          break
        case 'skipped':
          summary.skipped += 1
          break
        case 'circuit_break':
          summary.circuitBreak += 1
          break
        case 'failed':
        default:
          summary.failed += 1
      }
    }
  }

  return summary
}

module.exports = {
  collectDaily,
  collectOne,
  validatePrice,
  mergePriceRow,
  writeMissingPriceRow,
  writeLog,
  PRICE_MIN_EXCLUSIVE,
  PRICE_MAX_INCLUSIVE,
}
