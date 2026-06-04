// Feature: market-price-forecast, Property 5 (单 SPU 故障不阻塞批次)
// 通过 mock PDS server 模拟一个 SPU × source 失败，其他成功。

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-batch-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'batch.sqlite')
// 关键：让礼貌间隔降到测试可接受
process.env.FORECAST_PROJECT_TAG = 'AgriCloudManager-Forecast/1.0'
process.env.FORECAST_CONTACT_EMAIL = 'ops@ysngj.cn'

const seed = require('../../scripts/seed-master-data')
const { db } = require('../../lib/db')
const { collectDaily } = require('../../lib/price-collector')
const { startMockPds } = require('./helpers/mock-pds-server')

test.before(() => seed.main())

test('Property 5: 单 SPU 单源失败不阻塞其他 (spu × source) 组合', { timeout: 120_000 }, async () => {
  const pds = await startMockPds({})

  // 仅启用 moa 来源以缩短测试时长（4 来源 × 3 SPU × 2s 间隔会接近 24s）
  const summary = await collectDaily({
    requestId: 'req_test_batch',
    sources: ['moa'],
    urlBuilder: (spu, source) => {
      // 苹果走存在的路径，其他两个走 404 让其失败
      if (source !== 'moa') return null
      const variety = db.prepare('SELECT code FROM varieties WHERE id = ?').get(spu.variety_id).code
      if (variety === 'apple-red-fuji') return `${pds.baseUrl}/moa/apple`
      if (variety === 'soybean-yellow') return `${pds.baseUrl}/moa/missing`
      return `${pds.baseUrl}/moa/corn`
    },
  })
  await pds.close()

  // 至少应有 1 个 success（苹果） + 1 个 failed（大豆 404）
  assert.ok(summary.success >= 1)
  assert.ok(summary.failed >= 1)
  // 总尝试数 = 3 SPU × 1 source = 3
  assert.equal(summary.success + summary.failed + summary.skipped + summary.rejected + summary.circuitBreak, 3)

  const successRows = db
    .prepare("SELECT * FROM collection_logs WHERE request_id = ? AND status = 'success'")
    .all('req_test_batch')
  assert.ok(successRows.length >= 1)
})
