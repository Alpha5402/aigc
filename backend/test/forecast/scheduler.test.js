// Feature: market-price-forecast, Task 4.2
// 调度器：cron 注册 + 触发器 + 与分布式锁的集成。
// 由于 cron 时间无法在测试里等到，直接调用 triggerCollectDaily / triggerForecastDailyAll。

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-sched-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'sched.sqlite')
process.env.MODEL_SERVICE_SHARED_SECRET = 'unit-test-secret-32bytes-aaaaaaaaa'
process.env.MODEL_SERVICE_TIMEOUT_MS = '3000'
process.env.SCHEDULER_ENABLED = 'true'

const seed = require('../../scripts/seed-master-data')
const { db, nowIso } = require('../../lib/db')
const lock = require('../../lib/scheduler-lock')
const { startMockPds } = require('./helpers/mock-pds-server')
const { startMockModelService } = require('./helpers/mock-model-service')

test.before(() => {
  seed.main()
})

test.beforeEach(() => {
  lock.forceReleaseLock()
})

test('scheduler.start: 注册并停止两条 cron', () => {
  const scheduler = require('../../lib/scheduler')
  const r = scheduler.start({})
  try {
    assert.equal(r.started, true)
    assert.deepEqual(scheduler.listHandles().sort(), [
      scheduler.TASKS.collect.name,
      scheduler.TASKS.forecast.name,
    ].sort())
  } finally {
    scheduler.stop()
  }
  assert.deepEqual(scheduler.listHandles(), [])
})

test('SCHEDULER_ENABLED=false 时 start() 跳过', () => {
  process.env.SCHEDULER_ENABLED = 'false'
  delete require.cache[require.resolve('../../lib/scheduler')]
  const scheduler = require('../../lib/scheduler')
  const r = scheduler.start({})
  assert.equal(r.started, false)
  assert.equal(r.reason, 'disabled')
  process.env.SCHEDULER_ENABLED = 'true'
  delete require.cache[require.resolve('../../lib/scheduler')]
})

test('triggerCollectDaily: 通过 mock PDS 完整跑一次', { timeout: 60_000 }, async () => {
  const pds = await startMockPds({})
  const scheduler = require('../../lib/scheduler')

  const result = await scheduler.triggerCollectDaily((spu, source) => {
    if (source !== 'moa') return null
    const variety = db.prepare('SELECT code FROM varieties WHERE id = ?').get(spu.variety_id).code
    if (variety === 'apple-red-fuji') return `${pds.baseUrl}/moa/apple`
    if (variety === 'soybean-yellow') return `${pds.baseUrl}/moa/soybean`
    if (variety === 'corn-yellow') return `${pds.baseUrl}/moa/corn`
    return null
  })

  await pds.close()
  assert.equal(result.skipped, false)
  // 4 个 source × 3 SPU = 12 attempts；3 success（moa）+ 9 skipped（其他 source 没 URL）
  assert.ok(result.result.success >= 1, JSON.stringify(result))
})

test('triggerForecastDailyAll: 通过 mock MS 写入 forecast_runs', { timeout: 60_000 }, async () => {
  const ms = await startMockModelService({
    secret: process.env.MODEL_SERVICE_SHARED_SECRET,
    mode: 'ok',
  })
  process.env.MODEL_SERVICE_BASE_URL = ms.baseUrl

  // 先给 SPU 灌一些 history（70 天，触发统计模型族路径）
  const spuId = db.prepare("SELECT spu_id FROM spu_tuples WHERE status='active' LIMIT 1").get().spu_id
  const today = new Date('2026-04-01')
  for (let i = 0; i < 70; i += 1) {
    const d = new Date(today.getTime() + i * 86400000).toISOString().slice(0, 10)
    db.prepare(
      `INSERT OR IGNORE INTO price_history (
         spu_id, observed_date, price, source_name, source_url, source_priority, raw_text, collected_at, request_id
       ) VALUES (?, ?, ?, 'moa', 'http://test', 1, '5.x 元/公斤', ?, ?)`,
    ).run(spuId, d, 5.0 + (i % 7) * 0.05, nowIso(), `req_${i}`)
  }

  // 重新加载 forecast-engine 让其读到 mock baseUrl
  delete require.cache[require.resolve('../../lib/forecast-engine')]
  delete require.cache[require.resolve('../../lib/scheduler')]
  const scheduler = require('../../lib/scheduler')

  const result = await scheduler.triggerForecastDailyAll({ horizons: [7] })
  await ms.close()
  assert.equal(result.skipped, false)
  // 至少有一个 SPU 完成了一次 forecast
  const total = result.result.success + result.result.clipped + result.result.coldStart + result.result.degraded
  assert.ok(total >= 1, JSON.stringify(result))
})

test('锁互斥：同一任务被并发触发时第二次 skipped', async () => {
  delete require.cache[require.resolve('../../lib/scheduler')]
  const scheduler = require('../../lib/scheduler')
  // 手动占住 collect 锁
  const taken = lock.acquireLock(scheduler.TASKS.collect.name, 60)
  assert.equal(taken, true)

  // 第二次触发应当 skipped（但锁是同一进程持有所以会被视为同 owner，实际可重入）
  // 用一个虚拟的 task_name 模拟跨进程
  // 这里把场景简化为：手动用 forceReleaseLock + setLock 模拟其他 owner
  lock.forceReleaseLock()
  // 写一个假的 owner 占住锁
  db.prepare(
    `INSERT INTO scheduler_locks (task_name, owner_id, expire_at) VALUES (?, ?, ?)`,
  ).run(scheduler.TASKS.collect.name, 'other-process', Date.now() + 60_000)

  const r = await scheduler.triggerCollectDaily(() => null)
  // 因为锁被 other-process 持有，应该被 skipped
  assert.equal(r.skipped, true)
  lock.forceReleaseLock()
})
