// Feature: market-price-forecast, Task 1.5.1
// 验证 resolveSpuFromExternalRecord 的归一化路径。

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-alias-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'alias.sqlite')

const seed = require('../../scripts/seed-master-data')
const { resolveSpuFromExternalRecord } = require('../../lib/master-alias')

test.before(() => seed.main())

test('alias 命中：moa "苹果" + 山东烟台栖霞 → spu_id', () => {
  const r = resolveSpuFromExternalRecord({
    sourceName: 'moa',
    externalVariety: '苹果',
    externalOriginText: '山东省烟台市栖霞市',
  })
  assert.ok(r.spuId, JSON.stringify(r))
})

test('alias 命中：agri-cn "红富士" + 烟台栖霞 → spu_id', () => {
  const r = resolveSpuFromExternalRecord({
    sourceName: 'agri-cn',
    externalVariety: '红富士',
    externalOriginText: '烟台栖霞',
  })
  assert.ok(r.spuId)
})

test('未知 source → unknown_source', () => {
  const r = resolveSpuFromExternalRecord({
    sourceName: 'xinhua',
    externalVariety: '苹果',
    externalOriginText: '山东烟台',
  })
  assert.equal(r.spuId, null)
  assert.match(r.reason, /unknown_source/)
})

test('未知品种别名 → unknown_alias', () => {
  const r = resolveSpuFromExternalRecord({
    sourceName: 'moa',
    externalVariety: '榴莲',
    externalOriginText: '山东烟台',
  })
  assert.equal(r.spuId, null)
  assert.match(r.reason, /unknown_alias/)
})

test('缺产地 → missing_origin_text', () => {
  const r = resolveSpuFromExternalRecord({
    sourceName: 'moa',
    externalVariety: '苹果',
  })
  assert.equal(r.spuId, null)
  assert.match(r.reason, /missing_origin/)
})

test('未知产地 → unknown_origin', () => {
  const r = resolveSpuFromExternalRecord({
    sourceName: 'moa',
    externalVariety: '苹果',
    externalOriginText: '阿尔法星',
  })
  assert.equal(r.spuId, null)
  assert.match(r.reason, /unknown_origin/)
})
