// Feature: market-price-forecast, Property 6: 来源熔断状态机
// Validates: Requirement 1.9 (24h 内 3 次失败 → 暂停 1h)

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fc = require('fast-check')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-circuit-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'circuit.sqlite')

const { initDb, initForecastDb } = require('../../lib/db')
const cb = require('../../lib/source-circuit-breaker')

test.before(() => {
  initDb()
  initForecastDb()
  cb.reset()
})

test.beforeEach(() => cb.reset())

test('Property 6: 单次失败不进入 tripped', () => {
  const r = cb.record('moa', 'failure')
  assert.equal(r.tripped, false)
  assert.equal(r.failureCount, 1)
  assert.equal(cb.isPaused('moa'), false)
})

test('Property 6: 24h 内连续 3 次失败 → tripped', () => {
  const t0 = Date.now()
  cb.record('pfsc', 'failure', t0)
  cb.record('pfsc', 'failure', t0 + 1000)
  const r = cb.record('pfsc', 'failure', t0 + 2000)
  assert.equal(r.tripped, true)
  assert.equal(r.failureCount, 3)
  assert.equal(cb.isPaused('pfsc', t0 + 3000), true)
})

test('Property 6: 暂停 1h 后回到允许', () => {
  const t0 = Date.now()
  cb.record('mofcom', 'failure', t0)
  cb.record('mofcom', 'failure', t0 + 1000)
  cb.record('mofcom', 'failure', t0 + 2000)
  // 触发熔断那一刻 paused_until ≈ t0 + 2000 + 1h
  assert.equal(cb.isPaused('mofcom', t0 + 30 * 60 * 1000), true)
  // 1 小时 + 5 秒后必定恢复
  assert.equal(cb.isPaused('mofcom', t0 + 60 * 60 * 1000 + 5_000), false)
})

test('Property 6: 成功事件复位失败计数与暂停', () => {
  const t0 = Date.now()
  cb.record('agri-cn', 'failure', t0)
  cb.record('agri-cn', 'failure', t0 + 1000)
  cb.record('agri-cn', 'success', t0 + 2000)
  // 再来一次失败应当重新从 1 开始
  const r = cb.record('agri-cn', 'failure', t0 + 3000)
  assert.equal(r.failureCount, 1)
  assert.equal(cb.isPaused('agri-cn', t0 + 4000), false)
})

test('Property 6: 24h 窗口外的旧失败不计入', () => {
  const t0 = Date.now()
  cb.record('moa', 'failure', t0)
  cb.record('moa', 'failure', t0 + 1000)
  // 25 小时后再失败：应作为新窗口起点
  const r = cb.record('moa', 'failure', t0 + 25 * 3600 * 1000)
  assert.equal(r.failureCount, 1)
  assert.equal(r.tripped, false)
})

test('Property 6 PBT (200 iter): 任意事件序列都满足"3次失败=暂停"', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          deltaSec: fc.integer({ min: 0, max: 30 }), // 30s 内连续，确保都在 24h 窗口
          outcome: fc.constantFrom('failure', 'success'),
        }),
        { minLength: 1, maxLength: 30 },
      ),
      (events) => {
        cb.reset('xt')
        const t0 = Date.now()
        let cursor = t0
        let consecFail = 0
        let trippedAt = null
        for (const ev of events) {
          cursor += ev.deltaSec * 1000
          if (ev.outcome === 'failure') {
            consecFail += 1
          } else {
            consecFail = 0
          }
          const r = cb.record('xt', ev.outcome, cursor)
          if (consecFail >= 3 && trippedAt == null) {
            trippedAt = cursor
            assert.equal(r.tripped, true, `should be tripped at consec=${consecFail}`)
          }
          if (consecFail < 3 && trippedAt != null) {
            // 一旦 reset，trippedAt 失效（被 success 解锁）
            // 但 paused_until 仍可能在表里直到下次 reset；本属性聚焦"3次失败=暂停"
            trippedAt = null
          }
        }
      },
    ),
    { numRuns: 200 },
  )
})
