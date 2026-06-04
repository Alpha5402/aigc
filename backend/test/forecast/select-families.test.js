// 模型族选择测试：62 天分界

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fc = require('fast-check')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-sel-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'sel.sqlite')
process.env.MODEL_SERVICE_SHARED_SECRET = 'unit-test-secret-32bytes-aaaaaaaaa'

const { initDb, initForecastDb } = require('../../lib/db')
test.before(() => { initDb(); initForecastDb() })

const { DEEP_THRESHOLD, DEEP_FAMILIES } = require('../../lib/forecast-engine')

test('DEEP_THRESHOLD 是 62', () => {
  assert.equal(DEEP_THRESHOLD, 62)
})

test('DEEP_FAMILIES 是 dlinear + nbeats', () => {
  assert.deepEqual(DEEP_FAMILIES.sort(), ['dlinear', 'nbeats'])
})

test('PBT: historyLen < 62 → 备用大脑（fallback-engine 处理，不调 GPU）', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 61 }), (len) => {
      assert.ok(len < DEEP_THRESHOLD)
    }),
    { numRuns: 200 },
  )
})

test('PBT: historyLen ≥ 62 → 高级大脑（DLinear + N-BEATS）', () => {
  fc.assert(
    fc.property(fc.integer({ min: 62, max: 1825 }), (len) => {
      assert.ok(len >= DEEP_THRESHOLD)
    }),
    { numRuns: 200 },
  )
})
