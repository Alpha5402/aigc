// Feature: market-price-forecast, Task 2.4.1
// 同品种跨产地借数。

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-borrow-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'borrow.sqlite')

const { db, initDb, initForecastDb, nowIso } = require('../../lib/db')
const { tryBorrowedHistory } = require('../../lib/borrowed-history')

const seed = () => {
  const now = nowIso()
  // 两个产地（origin） + 一个品种 + 一个 grade / unit
  db.prepare(
    `INSERT INTO origins (adcode, province, city, county, display_name, status, created_at, updated_at)
     VALUES ('370613','山东省','烟台市','栖霞市','山东烟台栖霞','active',?,?)`,
  ).run(now, now)
  db.prepare(
    `INSERT INTO origins (adcode, province, city, county, display_name, status, created_at, updated_at)
     VALUES ('410882','河南省','三门峡市','灵宝市','河南灵宝','active',?,?)`,
  ).run(now, now)
  db.prepare(
    `INSERT INTO varieties (code, display_name, category, status, created_at, updated_at)
     VALUES ('apple-red-fuji','红富士苹果','fruit','active',?,?)`,
  ).run(now, now)
  db.prepare(
    `INSERT INTO grades (code, display_name, category, status, created_at, updated_at)
     VALUES ('fruit-grade-stand','统货','fruit','active',?,?)`,
  ).run(now, now)
  db.prepare(
    `INSERT INTO units (code, display_name, conversion_factor, status, created_at, updated_at)
     VALUES ('CNY/kg','元/公斤',1.0,'active',?,?)`,
  ).run(now, now)

  const o1 = db.prepare("SELECT id FROM origins WHERE adcode='370613'").get()
  const o2 = db.prepare("SELECT id FROM origins WHERE adcode='410882'").get()
  const v = db.prepare("SELECT id FROM varieties WHERE code='apple-red-fuji'").get()
  const g = db.prepare("SELECT id FROM grades WHERE code='fruit-grade-stand'").get()
  const u = db.prepare("SELECT id FROM units WHERE code='CNY/kg'").get()

  const mkSpu = (originId) => {
    const spuId = `spu_${crypto.randomBytes(8).toString('hex')}`
    db.prepare(
      `INSERT INTO spu_tuples (spu_id, origin_id, variety_id, grade_id, unit_id, status, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 'test', ?, ?)`,
    ).run(spuId, originId, v.id, g.id, u.id, now, now)
    return spuId
  }
  const target = mkSpu(o1.id)
  const sibling = mkSpu(o2.id)

  // 给 sibling 灌 5 天数据；target 不灌
  const today = new Date('2026-04-01')
  for (let i = 0; i < 5; i += 1) {
    const d = new Date(today.getTime() + i * 86400000).toISOString().slice(0, 10)
    db.prepare(
      `INSERT INTO price_history (
         spu_id, observed_date, price, source_name, source_url, source_priority, raw_text, collected_at, request_id
       ) VALUES (?, ?, ?, 'moa', 'http://test', 1, '4.x 元/公斤', ?, ?)`,
    ).run(sibling, d, 4.5 + i * 0.1, now, `req_${i}`)
  }
  return { target, sibling }
}

test.before(() => {
  initDb()
  initForecastDb()
})

test('tryBorrowedHistory: 同品种跨产地按日期合并', () => {
  const { target } = seed()
  const r = tryBorrowedHistory(target, 30)
  assert.ok(r)
  assert.equal(r.values.length, 5)
  assert.equal(r.dates.length, 5)
  assert.equal(r.dates[0], '2026-04-01')
  assert.equal(r.values[0], 4.5)
  assert.equal(r.values[4], 4.9)
  assert.ok(r.originIds.length > 0)
})

test('tryBorrowedHistory: 没有 sibling → null', () => {
  // 用一个孤儿 SPU
  db.exec(`INSERT INTO origins (adcode,province,city,display_name,status,created_at,updated_at)
           VALUES ('500000','上海市','上海市','上海全市','active','2026-01-01','2026-01-01');
           INSERT INTO varieties (code,display_name,category,status,created_at,updated_at)
           VALUES ('orphan-variety','孤儿品种','grain','active','2026-01-01','2026-01-01');`)
  const o = db.prepare("SELECT id FROM origins WHERE adcode='500000'").get()
  const v = db.prepare("SELECT id FROM varieties WHERE code='orphan-variety'").get()
  const g = db.prepare("SELECT id FROM grades WHERE code='fruit-grade-stand'").get()
  const u = db.prepare("SELECT id FROM units WHERE code='CNY/kg'").get()
  const spuId = 'spu_orphan_sole'
  db.prepare(
    `INSERT INTO spu_tuples (spu_id,origin_id,variety_id,grade_id,unit_id,status,display_name,created_at,updated_at)
     VALUES (?,?,?,?,?, 'active','孤儿','2026-01-01','2026-01-01')`,
  ).run(spuId, o.id, v.id, g.id, u.id)
  const r = tryBorrowedHistory(spuId, 30)
  assert.equal(r, null)
})
