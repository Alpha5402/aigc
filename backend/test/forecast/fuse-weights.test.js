// DLinear + N-BEATS 等权融合测试

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-fuse-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'fuse.sqlite')
process.env.MODEL_SERVICE_SHARED_SECRET = 'unit-test-secret-32bytes-aaaaaaaaa'

const { initDb, initForecastDb } = require('../../lib/db')
test.before(() => { initDb(); initForecastDb() })

const { fuseForecasts } = require('../../lib/forecast-engine')

const buildOutputs = (n) =>
  Array.from({ length: n }, (_, i) => ({
    family: `m_${i}`,
    point: [1.0, 1.0, 1.0],
    ci80L: [0.8, 0.8, 0.8],
    ci80U: [1.2, 1.2, 1.2],
    ci95L: [0.6, 0.6, 0.6],
    ci95U: [1.4, 1.4, 1.4],
  }))

test('等权融合：两个模型点估计 = 平均', () => {
  const out = buildOutputs(2)
  out[0].point = [2, 4, 6]
  out[1].point = [4, 8, 12]
  const fused = fuseForecasts(out)
  assert.equal(fused.point[0], 3)
  assert.equal(fused.point[1], 6)
  assert.equal(fused.point[2], 9)
})

test('等权融合：权重各 0.5', () => {
  const out = buildOutputs(2)
  const fused = fuseForecasts(out)
  assert.ok(Math.abs(fused.weights.m_0 - 0.5) < 1e-9)
  assert.ok(Math.abs(fused.weights.m_1 - 0.5) < 1e-9)
})

test('单模型：权重为 1.0', () => {
  const out = buildOutputs(1)
  const fused = fuseForecasts(out)
  assert.ok(Math.abs(fused.weights.m_0 - 1.0) < 1e-9)
})

test('null 值被跳过，不影响其他模型', () => {
  const out = buildOutputs(2)
  out[0].point = [null, 2, 3]
  out[1].point = [4, 6, 9]
  const fused = fuseForecasts(out)
  assert.equal(fused.point[0], 4)   // 只有 m_1 有值
  assert.equal(fused.point[1], 4)   // (2+6)/2
  assert.equal(fused.point[2], 6)   // (3+9)/2
})
