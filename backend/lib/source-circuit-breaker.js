// backend/lib/source-circuit-breaker.js
// market-price-forecast Phase 1, Task 1.3.3
// 关联：requirements.md #1.9, design.md §5.5
// Validates: Requirement 1.9 (24h 内 3 次失败 → 暂停 1h)
// Properties: 6 (熔断器状态机)
//
// 状态持久化在 source_circuit_breaker 表；24h 滚动窗口失败计数。
// 进入 tripped 后 isAllowed() 返回 false 直到 paused_until 到期。

'use strict'

const { db, nowIso } = require('./db')

const WINDOW_HOURS = 24
const FAILURE_THRESHOLD = 3
const PAUSE_HOURS = 1

const readState = (sourceName) =>
  db
    .prepare(
      `SELECT source_name, failure_count, window_started_at, paused_until, updated_at
       FROM source_circuit_breaker WHERE source_name = ?`,
    )
    .get(sourceName)

const writeState = ({ sourceName, failureCount, windowStartedAt, pausedUntil }) => {
  const now = nowIso()
  db.prepare(
    `INSERT INTO source_circuit_breaker (
       source_name, failure_count, window_started_at, paused_until, updated_at
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_name) DO UPDATE SET
       failure_count = excluded.failure_count,
       window_started_at = excluded.window_started_at,
       paused_until = excluded.paused_until,
       updated_at = excluded.updated_at`,
  ).run(sourceName, failureCount, windowStartedAt, pausedUntil || null, now)
}

const isWindowExpired = (windowStartedAt, nowMs) => {
  const startMs = new Date(windowStartedAt).getTime()
  if (!Number.isFinite(startMs)) return true
  return nowMs - startMs > WINDOW_HOURS * 3600 * 1000
}

// 单次事件接收：outcome ∈ {'success','failure'}，timestampMs 默认现在
const record = (sourceName, outcome, timestampMs = Date.now()) => {
  const nowMs = timestampMs
  const nowIsoStr = new Date(nowMs).toISOString()
  const state = readState(sourceName)

  if (outcome === 'success') {
    // 成功事件：清除失败窗口与暂停（无副作用复位）
    writeState({
      sourceName,
      failureCount: 0,
      windowStartedAt: nowIsoStr,
      pausedUntil: null,
    })
    return { tripped: false, failureCount: 0 }
  }

  // failure
  let failureCount = 1
  let windowStartedAt = nowIsoStr
  let pausedUntil = null

  if (state) {
    if (state.paused_until && new Date(state.paused_until).getTime() > nowMs) {
      // 仍在暂停期内：失败计数不变，保持原状态
      return { tripped: true, failureCount: state.failure_count, pausedUntil: state.paused_until }
    }
    if (isWindowExpired(state.window_started_at, nowMs)) {
      // 24h 窗口已过期：以本次失败为新窗口起点
      failureCount = 1
      windowStartedAt = nowIsoStr
    } else {
      failureCount = (state.failure_count || 0) + 1
      windowStartedAt = state.window_started_at
    }
  }

  if (failureCount >= FAILURE_THRESHOLD) {
    pausedUntil = new Date(nowMs + PAUSE_HOURS * 3600 * 1000).toISOString()
  }

  writeState({ sourceName, failureCount, windowStartedAt, pausedUntil })
  return {
    tripped: !!pausedUntil,
    failureCount,
    pausedUntil,
  }
}

// 是否处于暂停期；返回 false 表示允许访问。
const isPaused = (sourceName, nowMs = Date.now()) => {
  const state = readState(sourceName)
  if (!state || !state.paused_until) return false
  return new Date(state.paused_until).getTime() > nowMs
}

// 主动复位（运营手动用 / 测试用）
const reset = (sourceName) => {
  if (sourceName) {
    db.prepare('DELETE FROM source_circuit_breaker WHERE source_name = ?').run(sourceName)
  } else {
    db.prepare('DELETE FROM source_circuit_breaker').run()
  }
}

module.exports = {
  WINDOW_HOURS,
  FAILURE_THRESHOLD,
  PAUSE_HOURS,
  record,
  isPaused,
  reset,
  __readState: readState, // 测试入口
}
