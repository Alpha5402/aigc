#!/usr/bin/env node
// backend/scripts/e2e-forecast.js
// market-price-forecast Phase 1, Task 5.2.1
// 关联：tasks.md §5.2
//
// 端到端烟囱测试（不连接公网）：
//   1) 启用 in-memory SQLite（SQLITE_PATH 临时文件）
//   2) initDb + initForecastDb + seed master_data
//   3) 启动 mock Public_Data_Source（HTTP server，固定 fixture）
//   4) 启动 mock Model_Service（HTTP server，校验 HMAC，返回固定预测）
//   5) collectDaily（仅 moa 来源）→ 断言 price_history 写入
//   6) forecastDailyAll([7]) → 断言 forecast_runs.status='active'
//   7) readLatestActive → 断言响应结构
//   8) 关掉 mock；返回退出码

'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

require('./_bootstrap-env')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-e2e-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'e2e.sqlite')
process.env.MODEL_SERVICE_SHARED_SECRET =
  process.env.MODEL_SERVICE_SHARED_SECRET || 'e2e-shared-secret-32bytes-aaaaaaa'
process.env.MODEL_SERVICE_TIMEOUT_MS = process.env.MODEL_SERVICE_TIMEOUT_MS || '5000'
process.env.SCHEDULER_ENABLED = 'false'

let exitCode = 0

const log = (level, msg, payload) => {
  const line = `[e2e:${level}] ${msg}` + (payload ? ` ${JSON.stringify(payload)}` : '')
  process.stdout.write(line + '\n')
}

const main = async () => {
  log('info', 'tmp dir', { tmpDir })

  const seed = require('./seed-master-data')
  const { startMockPds } = require('../test/forecast/helpers/mock-pds-server')
  const { startMockModelService } = require('../test/forecast/helpers/mock-model-service')
  const { db, initDb, initForecastDb } = require('../lib/db')
  const { collectDaily } = require('../lib/price-collector')

  log('info', 'init db + seed master_data')
  initDb()
  initForecastDb()
  seed.main()

  log('info', 'start mock PDS')
  const pds = await startMockPds({})

  log('info', 'start mock Model_Service')
  const ms = await startMockModelService({
    secret: process.env.MODEL_SERVICE_SHARED_SECRET,
    mode: 'ok',
  })
  process.env.MODEL_SERVICE_BASE_URL = ms.baseUrl

  // 重新加载 forecast-engine 让它读到最新的 base_url
  delete require.cache[require.resolve('../lib/forecast-engine')]
  const engine = require('../lib/forecast-engine')

  // 5) 采集
  log('info', 'collectDaily (moa only)')
  const collectSummary = await collectDaily({
    requestId: 'e2e_collect',
    sources: ['moa'],
    urlBuilder: (spu, source) => {
      if (source !== 'moa') return null
      const variety = db.prepare('SELECT code FROM varieties WHERE id = ?').get(spu.variety_id).code
      if (variety === 'apple-red-fuji') return `${pds.baseUrl}/moa/apple`
      if (variety === 'soybean-yellow') return `${pds.baseUrl}/moa/soybean`
      if (variety === 'corn-yellow') return `${pds.baseUrl}/moa/corn`
      return null
    },
  })
  log('info', 'collect summary', collectSummary)
  if (collectSummary.success === 0) {
    log('error', 'no successful collection')
    exitCode = 1
  }
  const priceCount = db.prepare('SELECT COUNT(*) AS c FROM price_history WHERE price IS NOT NULL').get().c
  log('info', `price_history rows = ${priceCount}`)
  if (priceCount === 0) {
    log('error', 'price_history is empty')
    exitCode = 1
  }

  // 6) 预测
  log('info', 'forecastDailyAll([7])')
  const forecastSummary = await engine.forecastDailyAll({ horizons: [7] })
  log('info', 'forecast summary', forecastSummary)
  // 期望：success+clipped+coldStart+degraded ≥ SPU 数（= 3）
  const reachable = forecastSummary.success + forecastSummary.clipped + forecastSummary.coldStart + forecastSummary.degraded
  if (reachable < 3) {
    log('error', `forecast did not run for all SPU (reached=${reachable})`)
    exitCode = 1
  }

  // 7) 读路径
  const spus = db.prepare("SELECT spu_id FROM spu_tuples WHERE status='active'").all()
  for (const s of spus) {
    const r = engine.readLatestActive(s.spu_id, 7)
    if (!r) {
      log('error', `no active forecast for ${s.spu_id}`)
      exitCode = 1
      continue
    }
    if (r.point.length !== 7) {
      log('error', `${s.spu_id} point length != 7`, { len: r.point.length })
      exitCode = 1
    }
    // 校验单调性
    for (let i = 0; i < r.point.length; i += 1) {
      if (
        !(r.ci95Lower[i] <= r.ci80Lower[i] + 1e-9 &&
          r.ci80Lower[i] <= r.point[i] + 1e-9 &&
          r.point[i] <= r.ci80Upper[i] + 1e-9 &&
          r.ci80Upper[i] <= r.ci95Upper[i] + 1e-9)
      ) {
        log('error', `${s.spu_id} CI not monotonic at i=${i}`)
        exitCode = 1
      }
    }
    log('info', `OK ${s.spu_id} status=${r.status} families=${r.modelFamilies.join(',')} first=${r.point[0]}`)
  }

  await pds.close()
  await ms.close()

  // 清理临时目录
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch (_e) {}

  if (exitCode === 0) {
    log('info', '✅ e2e PASS')
  } else {
    log('error', `❌ e2e FAIL (exit=${exitCode})`)
  }
  process.exit(exitCode)
}

main().catch((err) => {
  log('error', 'unhandled', { error: err?.message, stack: err?.stack })
  process.exit(1)
})
