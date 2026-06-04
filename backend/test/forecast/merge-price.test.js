// Feature: market-price-forecast, Property 3 (按来源优先级合并)
// Validates: Requirement 1.5

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-merge-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'merge.sqlite')

const seed = require('../../scripts/seed-master-data')
const { db } = require('../../lib/db')
const { mergePriceRow } = require('../../lib/price-collector')

test.before(() => seed.main())

const targetSpu = () => db.prepare("SELECT spu_id FROM spu_tuples WHERE status='active' LIMIT 1").get().spu_id

test('低优先级先写入', () => {
  const spuId = targetSpu()
  const r = mergePriceRow({
    spuId,
    observedDate: '2026-04-01',
    price: 4.5,
    sourceName: 'agri-cn',
    sourceUrl: 'http://x',
    rawText: '4.5 元/公斤',
    requestId: 'r1',
  })
  assert.equal(r.action, 'insert')
  const row = db.prepare("SELECT * FROM price_history WHERE spu_id = ? AND observed_date = '2026-04-01'").get(spuId)
  assert.equal(row.price, 4.5)
  assert.equal(row.source_name, 'agri-cn')
  assert.equal(row.source_priority, 4)
})

test('高优先级（moa=1）覆盖低优先级（agri-cn=4）并保留审计', () => {
  const spuId = targetSpu()
  // 第一次：agri-cn 已写入；现在 moa 覆盖
  const r = mergePriceRow({
    spuId,
    observedDate: '2026-04-01',
    price: 5.0,
    sourceName: 'moa',
    sourceUrl: 'http://moa',
    rawText: '5.0 元/公斤',
    requestId: 'r2',
  })
  assert.equal(r.action, 'replace')
  const row = db.prepare("SELECT * FROM price_history WHERE spu_id = ? AND observed_date = '2026-04-01'").get(spuId)
  assert.equal(row.price, 5.0)
  assert.equal(row.source_name, 'moa')
  assert.equal(row.source_priority, 1)
  // 审计应保留 agri-cn 的痕迹
  assert.match(row.raw_text, /PREV agri-cn/)
})

test('低优先级（mofcom=3）不覆盖现有高优先级（moa=1）', () => {
  const spuId = targetSpu()
  const r = mergePriceRow({
    spuId,
    observedDate: '2026-04-01',
    price: 4.8,
    sourceName: 'mofcom',
    sourceUrl: 'http://mof',
    rawText: '4.8 元/公斤',
    requestId: 'r3',
  })
  assert.equal(r.action, 'skip')
  const row = db.prepare("SELECT * FROM price_history WHERE spu_id = ? AND observed_date = '2026-04-01'").get(spuId)
  assert.equal(row.price, 5.0) // 仍是 moa 的价格
})

test('同优先级（同 source）不覆盖（merge=skip）', () => {
  const spuId = targetSpu()
  const r = mergePriceRow({
    spuId,
    observedDate: '2026-04-01',
    price: 5.5,
    sourceName: 'moa',
    sourceUrl: 'http://moa-2',
    rawText: '5.5 元/公斤',
    requestId: 'r4',
  })
  assert.equal(r.action, 'skip')
})
