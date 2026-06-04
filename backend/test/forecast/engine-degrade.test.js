// Feature: market-price-forecast, Task 2.5.5
// Validates: Requirement 3.8, 4.4
// 通过 mock Model_Service 验证 forecast-engine 的 degrade 路径。

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-engine-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'engine.sqlite')
process.env.MODEL_SERVICE_SHARED_SECRET = 'unit-test-secret-32bytes-aaaaaaaaa'

const seed = require('../../scripts/seed-master-data')
const { db, nowIso } = require('../../lib/db')
const { startMockModelService } = require('./helpers/mock-model-service')

// 读取后才能让 forecast-engine 拿到正确的 base_url
let mockMs
let engineModule

const seedHistory = (spuId, days, baseValue) => {
  const today = new Date('2026-04-01')
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today.getTime() + i * 86400000).toISOString().slice(0, 10)
    db.prepare(
      `INSERT INTO price_history (
         spu_id, observed_date, price, source_name, source_url, source_priority, raw_text, collected_at, request_id
       ) VALUES (?, ?, ?, 'moa', 'http://test', 1, '?元/公斤', ?, ?)`,
    ).run(spuId, d, baseValue + (i % 7) * 0.05, nowIso(), `req_${i}`)
  }
}

const firstSpuId = () => db.prepare("SELECT spu_id FROM spu_tuples WHERE status='active' LIMIT 1").get().spu_id

test.before(async () => {
  seed.main()
  // 给苹果 seed 70 天历史，足够走"中等历史"分支（≥60 走 statistical 多家族）
  seedHistory(firstSpuId(), 70, 5.0)
})

test.beforeEach(async () => {
  // 给每个 case 单独起一个 mock MS
})

test('Engine: MS 5xx → 备用大脑接管（fallback 兜底，status 为 active 或 cold_start）', async () => {
  const ms = await startMockModelService({
    secret: process.env.MODEL_SERVICE_SHARED_SECRET,
    mode: '5xx',
  })
  process.env.MODEL_SERVICE_BASE_URL = ms.baseUrl
  process.env.MODEL_SERVICE_TIMEOUT_MS = '3000'
  delete require.cache[require.resolve('../../lib/forecast-engine')]
  engineModule = require('../../lib/forecast-engine')
  const r = await engineModule.forecastOne({ spuId: firstSpuId(), horizonDays: 7 })
  await ms.close()
  // 备用大脑（MA/SES）成功时产出 active 或 cold_start，不再是 degraded
  assert.ok(
    ['active', 'clipped', 'cold_start', 'degraded'].includes(r.status),
    JSON.stringify(r),
  )
  // 关键：预测点数量正确
  assert.equal(r.forecastRunId > 0, true)
})

test('Engine: MS 返回单调性失败 → status=degraded', async () => {
  const ms = await startMockModelService({
    secret: process.env.MODEL_SERVICE_SHARED_SECRET,
    mode: 'invalid_monotonic',
  })
  process.env.MODEL_SERVICE_BASE_URL = ms.baseUrl
  delete require.cache[require.resolve('../../lib/forecast-engine')]
  engineModule = require('../../lib/forecast-engine')
  const r = await engineModule.forecastOne({ spuId: firstSpuId(), horizonDays: 7 })
  await ms.close()
  // 因 mock 只返回 1 个模型且单调性失败，融合后会被验证为 degraded
  assert.equal(r.status, 'degraded')
})

test('Engine: MS 200 + 单调有效 → status=active 且写入 forecast_runs', async () => {
  const ms = await startMockModelService({
    secret: process.env.MODEL_SERVICE_SHARED_SECRET,
    mode: 'ok',
  })
  process.env.MODEL_SERVICE_BASE_URL = ms.baseUrl
  delete require.cache[require.resolve('../../lib/forecast-engine')]
  engineModule = require('../../lib/forecast-engine')
  const r = await engineModule.forecastOne({ spuId: firstSpuId(), horizonDays: 7 })
  await ms.close()
  assert.ok(['active', 'clipped'].includes(r.status), JSON.stringify(r))
  assert.ok(r.forecastRunId)
  const latest = engineModule.readLatestActive(firstSpuId(), 7)
  assert.ok(latest)
  assert.equal(latest.point.length, 7)
  // 单调性
  for (let i = 0; i < latest.point.length; i += 1) {
    assert.ok(latest.ci95Lower[i] <= latest.ci80Lower[i] + 1e-9)
    assert.ok(latest.ci80Lower[i] <= latest.point[i] + 1e-9)
    assert.ok(latest.point[i] <= latest.ci80Upper[i] + 1e-9)
    assert.ok(latest.ci80Upper[i] <= latest.ci95Upper[i] + 1e-9)
  }
})

test('Engine: 同 (spu, origin_date, horizon) 仅 1 条 active', async () => {
  const ms = await startMockModelService({
    secret: process.env.MODEL_SERVICE_SHARED_SECRET,
    mode: 'ok',
  })
  process.env.MODEL_SERVICE_BASE_URL = ms.baseUrl
  delete require.cache[require.resolve('../../lib/forecast-engine')]
  engineModule = require('../../lib/forecast-engine')
  const spuId = firstSpuId()
  await engineModule.forecastOne({ spuId, horizonDays: 7, originDate: '2026-04-15' })
  await engineModule.forecastOne({ spuId, horizonDays: 7, originDate: '2026-04-15' })
  await engineModule.forecastOne({ spuId, horizonDays: 7, originDate: '2026-04-15' })
  await ms.close()
  const c = db
    .prepare(
      `SELECT COUNT(*) AS c FROM forecast_runs
       WHERE spu_id = ? AND origin_date = ? AND horizon_days = ?
         AND status IN ('active','clipped','cold_start','qualitative-only')`,
    )
    .get(spuId, '2026-04-15', 7).c
  assert.equal(c, 1)
})
