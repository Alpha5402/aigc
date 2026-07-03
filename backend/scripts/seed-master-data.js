#!/usr/bin/env node
// backend/scripts/seed-master-data.js
// market-price-forecast Phase 1, Task 1.2.1
// 关联：design.md §4.5
//
// 写入首批 master_data：origins / varieties / variety_aliases / grades / units / spu_tuples。
// 幂等：通过 INSERT OR IGNORE 与 UNIQUE 约束保证多次运行无副作用。
//
// 使用：
//   node scripts/seed-master-data.js
//   或 npm run market:seed

'use strict'

const crypto = require('node:crypto')

// 让脚本可以独立从仓库根或 backend 子目录运行
require('./_bootstrap-env')

const { db, initDb, initForecastDb, nowIso } = require('../lib/db')

// === 数据 ===

const ORIGINS = [
  // GB/T 2260 行政区划码
  { adcode: '370613', province: '山东省', city: '烟台市', county: '栖霞市', display_name: '山东烟台栖霞' },
  { adcode: '410882', province: '河南省', city: '三门峡市', county: '灵宝市', display_name: '河南灵宝' },
  { adcode: '150400', province: '内蒙古自治区', city: '赤峰市', county: null, display_name: '内蒙古赤峰' },
]

const VARIETIES = [
  { code: 'apple-red-fuji', display_name: '红富士苹果', category: 'fruit' },
  { code: 'soybean-yellow', display_name: '黄大豆', category: 'grain' },
  { code: 'corn-yellow', display_name: '黄玉米', category: 'grain' },
]

// 别名（外部源命名 → variety code）
const VARIETY_ALIASES = [
  { code: 'apple-red-fuji', sources: { moa: '苹果', 'agri-cn': '红富士', mofcom: '苹果(红富士)', pfsc: '苹果' } },
  { code: 'soybean-yellow', sources: { moa: '大豆', 'agri-cn': '黄豆', mofcom: '大豆', pfsc: '大豆' } },
  { code: 'corn-yellow', sources: { moa: '玉米', 'agri-cn': '玉米', mofcom: '玉米', pfsc: '玉米' } },
]

const GRADES = [
  { code: 'fruit-grade-1', display_name: '一级 80mm 以上', category: 'fruit' },
  { code: 'fruit-grade-stand', display_name: '统货', category: 'fruit' },
  { code: 'grain-grade-stand', display_name: '统货', category: 'grain' },
]

const UNITS = [
  { code: 'CNY/kg', display_name: '元/公斤', conversion_factor: 1.0 },
  { code: 'CNY/jin', display_name: '元/斤', conversion_factor: 0.5 },
]

// SPU 4-tuple：origin × variety × grade × unit
// 与现有 market_items 中"苹果/大豆/玉米"对齐
const SPUS = [
  {
    origin: '370613',
    variety: 'apple-red-fuji',
    grade: 'fruit-grade-1',
    unit: 'CNY/kg',
    market_item_name: '苹果',
  },
  {
    origin: '150400',
    variety: 'soybean-yellow',
    grade: 'grain-grade-stand',
    unit: 'CNY/kg',
    market_item_name: '大豆',
  },
  {
    origin: '150400',
    variety: 'corn-yellow',
    grade: 'grain-grade-stand',
    unit: 'CNY/kg',
    market_item_name: '玉米',
  },
]

// === 工具 ===

// 27 字符 KSUID 风格（不引外部 lib）：14 位 base36 时间 + 13 位 base36 随机
const generateSpuId = () => {
  const t = Date.now().toString(36).padStart(14, '0').slice(-14)
  const r = crypto.randomBytes(8).toString('hex').slice(0, 13)
  return `spu_${(t + r).slice(0, 23)}`
}

const upsertOrigin = (o) => {
  const now = nowIso()
  db.prepare(
    `INSERT INTO origins (adcode, province, city, county, display_name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
     ON CONFLICT(adcode) DO NOTHING`,
  ).run(o.adcode, o.province, o.city, o.county, o.display_name, now, now)
}

const upsertVariety = (v) => {
  const now = nowIso()
  db.prepare(
    `INSERT INTO varieties (code, display_name, category, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)
     ON CONFLICT(code) DO NOTHING`,
  ).run(v.code, v.display_name, v.category, now, now)
}

const upsertGrade = (g) => {
  const now = nowIso()
  db.prepare(
    `INSERT INTO grades (code, display_name, category, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)
     ON CONFLICT(code) DO NOTHING`,
  ).run(g.code, g.display_name, g.category, now, now)
}

const upsertUnit = (u) => {
  const now = nowIso()
  db.prepare(
    `INSERT INTO units (code, display_name, conversion_factor, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)
     ON CONFLICT(code) DO NOTHING`,
  ).run(u.code, u.display_name, u.conversion_factor, now, now)
}

const upsertAlias = (varietyId, sourceName, alias) => {
  const now = nowIso()
  db.prepare(
    `INSERT INTO variety_aliases (variety_id, source_name, alias, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(source_name, alias) DO NOTHING`,
  ).run(varietyId, sourceName, alias, now)
}

const upsertSpu = (spu) => {
  const now = nowIso()
  const o = db.prepare('SELECT id FROM origins WHERE adcode = ?').get(spu.origin)
  const v = db.prepare('SELECT id, display_name, category FROM varieties WHERE code = ?').get(spu.variety)
  const g = db.prepare('SELECT id, display_name FROM grades WHERE code = ?').get(spu.grade)
  const u = db.prepare('SELECT id, display_name FROM units WHERE code = ?').get(spu.unit)
  if (!o || !v || !g || !u) {
    throw new Error(`master_data_missing: origin=${spu.origin} variety=${spu.variety} grade=${spu.grade} unit=${spu.unit}`)
  }

  const existing = db
    .prepare(
      `SELECT spu_id FROM spu_tuples
       WHERE origin_id = ? AND variety_id = ? AND grade_id = ? AND unit_id = ?`,
    )
    .get(o.id, v.id, g.id, u.id)
  if (existing) return { spuId: existing.spu_id, created: false }

  const spuId = generateSpuId()
  const displayName = `${db.prepare('SELECT display_name FROM origins WHERE id = ?').get(o.id).display_name} ${v.display_name} ${g.display_name} ${u.display_name}`
  db.prepare(
    `INSERT INTO spu_tuples (
       spu_id, origin_id, variety_id, grade_id, unit_id, status, display_name, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).run(spuId, o.id, v.id, g.id, u.id, displayName, now, now)
  return { spuId, created: true }
}

// 把 market_items 中既有的 苹果/大豆/玉米 行回填 spu_id
const backfillMarketItem = (itemName, spuId) => {
  const row = db.prepare('SELECT id FROM market_items WHERE name = ?').get(itemName)
  if (!row) return false
  db.prepare("UPDATE market_items SET spu_id = ? WHERE id = ? AND (spu_id IS NULL OR spu_id = '')").run(
    spuId,
    row.id,
  )
  return true
}

// === 主流程 ===

const main = () => {
  initDb()
  initForecastDb()

  console.log('[seed] 写入 origins ...')
  ORIGINS.forEach(upsertOrigin)

  console.log('[seed] 写入 varieties ...')
  VARIETIES.forEach(upsertVariety)

  console.log('[seed] 写入 grades ...')
  GRADES.forEach(upsertGrade)

  console.log('[seed] 写入 units ...')
  UNITS.forEach(upsertUnit)

  console.log('[seed] 写入 variety_aliases ...')
  for (const v of VARIETY_ALIASES) {
    const variety = db.prepare('SELECT id FROM varieties WHERE code = ?').get(v.code)
    if (!variety) continue
    for (const [src, alias] of Object.entries(v.sources)) {
      upsertAlias(variety.id, src, alias)
    }
  }

  console.log('[seed] 写入 spu_tuples ...')
  const summary = []
  for (const spu of SPUS) {
    const r = upsertSpu(spu)
    if (spu.market_item_name) {
      const updated = backfillMarketItem(spu.market_item_name, r.spuId)
      summary.push({ spuId: r.spuId, created: r.created, marketItem: spu.market_item_name, marketItemUpdated: updated })
    } else {
      summary.push({ spuId: r.spuId, created: r.created })
    }
  }

  console.log('[seed] 完成。')
  console.log(JSON.stringify(summary, null, 2))
}

if (require.main === module) {
  try {
    main()
    process.exit(0)
  } catch (err) {
    console.error('[seed] 失败：', err)
    process.exit(1)
  }
}

module.exports = { main }
