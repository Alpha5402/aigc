#!/usr/bin/env node
// backend/scripts/import-imf-prices.js
// 把 IMF 大宗商品月度价格 CSV 导入 price_history 表
//
// 数据来源：IMF Primary Commodity Prices（1980-2016，月频，USD/公吨 或 USD/磅等）
// 单位统一转换为 元/公斤（CNY/kg），使用固定汇率 7.2 CNY/USD
//
// 使用：
//   node backend/scripts/import-imf-prices.js
//   node backend/scripts/import-imf-prices.js --dry-run   # 只打印，不写库

'use strict'

require('./_bootstrap-env')

const fs = require('node:fs')
const path = require('node:path')
const { db, initDb, initForecastDb, nowIso } = require('../lib/db')

const CSV_PATH = path.join(__dirname, '../../model-service/data/raw/commodity-prices.csv')
const DRY_RUN = process.argv.includes('--dry-run')

// 固定汇率（用于将 USD 价格转换为 CNY）
const USD_TO_CNY = 7.2

// IMF CSV 列名 → 我们的品种 code 映射
// 单位说明：
//   USD/mt  = 美元/公吨 → ÷1000 → USD/kg → ×7.2 → CNY/kg
//   USD/kg  = 美元/公斤 → ×7.2 → CNY/kg
//   USD/lb  = 美元/磅  → ÷0.4536 → USD/kg → ×7.2 → CNY/kg
//   USD/bu  = 美元/蒲式耳（小麦/玉米约 27.2 kg/bu）→ ÷27.2 → USD/kg → ×7.2 → CNY/kg
const COLUMN_MAP = [
  // 粮食/油料
  { col: 'Maize corn',       code: 'corn-yellow',      unit: 'USD/mt',  name: '黄玉米' },
  { col: 'Soybeans',         code: 'soybean-yellow',   unit: 'USD/mt',  name: '黄大豆' },
  { col: 'Soybean Oil',      code: 'soybean-oil',      unit: 'USD/mt',  name: '豆油' },
  { col: 'Soybean Meal',     code: 'soybean-meal',     unit: 'USD/mt',  name: '豆粕' },
  { col: 'Wheat',            code: 'wheat',            unit: 'USD/mt',  name: '小麦' },
  { col: 'Rice',             code: 'rice',             unit: 'USD/mt',  name: '大米' },
  { col: 'Barley',           code: 'barley',           unit: 'USD/mt',  name: '大麦' },
  { col: 'Palm oil',         code: 'palm-oil',         unit: 'USD/mt',  name: '棕榈油' },
  { col: 'Rapeseed oil',     code: 'rapeseed-oil',     unit: 'USD/mt',  name: '菜籽油' },
  { col: 'Sunflower oil',    code: 'sunflower-oil',    unit: 'USD/mt',  name: '葵花籽油' },
  { col: 'Groundnuts peanuts', code: 'peanut',         unit: 'USD/mt',  name: '花生' },
  // 肉类/水产
  { col: 'Beef',             code: 'beef',             unit: 'USD/kg',  name: '牛肉' },
  { col: 'Lamb',             code: 'lamb',             unit: 'USD/kg',  name: '羊肉' },
  { col: 'Swine - pork',     code: 'pork',             unit: 'USD/kg',  name: '猪肉' },
  { col: 'Poultry chicken',  code: 'chicken',          unit: 'USD/kg',  name: '鸡肉' },
  { col: 'Fish salmon',      code: 'salmon',           unit: 'USD/kg',  name: '三文鱼' },
  { col: 'Shrimp',           code: 'shrimp',           unit: 'USD/kg',  name: '虾' },
  { col: 'Fishmeal',         code: 'fishmeal',         unit: 'USD/mt',  name: '鱼粉' },
  // 水果/经济作物
  { col: 'Bananas',          code: 'banana',           unit: 'USD/mt',  name: '香蕉' },
  { col: 'Oranges',          code: 'orange',           unit: 'USD/mt',  name: '橙子' },
  { col: 'Sugar Free Market',code: 'sugar',            unit: 'USD/kg',  name: '白糖' },
  { col: 'Cotton',           code: 'cotton',           unit: 'USD/kg',  name: '棉花' },
  { col: 'Rubber',           code: 'rubber',           unit: 'USD/kg',  name: '橡胶' },
  { col: 'Tea',              code: 'tea',              unit: 'USD/kg',  name: '茶叶' },
  { col: 'Cocoa beans',      code: 'cocoa',            unit: 'USD/mt',  name: '可可豆' },
  { col: 'Coffee Other Mild Arabicas', code: 'coffee-arabica', unit: 'USD/kg', name: '阿拉比卡咖啡' },
]

// 单位转换到 CNY/kg
const toCnyPerKg = (value, unit) => {
  if (!Number.isFinite(value) || value <= 0) return null
  let usdPerKg
  switch (unit) {
    case 'USD/mt':  usdPerKg = value / 1000; break
    case 'USD/kg':  usdPerKg = value; break
    case 'USD/lb':  usdPerKg = value / 0.4536; break
    case 'USD/bu':  usdPerKg = value / 27.2; break
    default: return null
  }
  const cny = usdPerKg * USD_TO_CNY
  return Number(cny.toFixed(4))
}

// 解析 CSV（不依赖 pandas，纯 Node.js）
const parseCsv = (filePath) => {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/).filter(Boolean)
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(',')
    const row = {}
    headers.forEach((h, j) => {
      row[h] = cells[j]?.trim().replace(/^"|"$/g, '') || ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

// 确保品种主数据存在（INSERT OR IGNORE）
const ensureVariety = (code, displayName, category) => {
  const now = nowIso()
  db.prepare(
    `INSERT OR IGNORE INTO varieties (code, display_name, category, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
  ).run(code, displayName, category, now, now)
  return db.prepare('SELECT id FROM varieties WHERE code = ?').get(code)
}

// 确保 SPU 存在（全球均价，不绑定具体产地）
const ensureGlobalSpu = (varietyId) => {
  // 用 adcode='000000' 表示"全球/国际"产地
  const now = nowIso()
  db.prepare(
    `INSERT OR IGNORE INTO origins (adcode, province, city, display_name, status, created_at, updated_at)
     VALUES ('000000', '国际', '全球', '国际市场', 'active', ?, ?)`,
  ).run(now, now)
  const origin = db.prepare("SELECT id FROM origins WHERE adcode = '000000'").get()

  db.prepare(
    `INSERT OR IGNORE INTO grades (code, display_name, category, status, created_at, updated_at)
     VALUES ('global-standard', '国际标准', 'global', 'active', ?, ?)`,
  ).run(now, now)
  const grade = db.prepare("SELECT id FROM grades WHERE code = 'global-standard'").get()

  const unit = db.prepare("SELECT id FROM units WHERE code = 'CNY/kg'").get()
  if (!unit) throw new Error('CNY/kg unit not found — run npm run market:seed first')

  db.prepare(
    `INSERT OR IGNORE INTO spu_tuples
       (spu_id, origin_id, variety_id, grade_id, unit_id, status, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).run(
    `spu_imf_${varietyId}`,
    origin.id, varietyId, grade.id, unit.id,
    `国际市场 ${db.prepare('SELECT display_name FROM varieties WHERE id = ?').get(varietyId).display_name} 国际标准 元/公斤`,
    now, now,
  )
  return db.prepare("SELECT spu_id FROM spu_tuples WHERE spu_id = ?").get(`spu_imf_${varietyId}`)
}

const main = () => {
  initDb()
  initForecastDb()

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`)
    process.exit(1)
  }

  console.log(`[import] reading ${CSV_PATH}`)
  const { rows } = parseCsv(CSV_PATH)
  console.log(`[import] ${rows.length} rows, ${COLUMN_MAP.length} commodities to import`)

  let totalInserted = 0
  let totalSkipped = 0

  for (const mapping of COLUMN_MAP) {
    const category = ['corn-yellow','soybean-yellow','soybean-oil','soybean-meal','wheat','rice','barley','palm-oil','rapeseed-oil','sunflower-oil','peanut'].includes(mapping.code)
      ? 'grain' : ['beef','lamb','pork','chicken','salmon','shrimp','fishmeal'].includes(mapping.code)
      ? 'meat' : 'other'

    const variety = ensureVariety(mapping.code, mapping.name, category)
    const spu = ensureGlobalSpu(variety.id)
    const spuId = spu.spu_id

    let inserted = 0
    let skipped = 0
    const now = nowIso()

    for (const row of rows) {
      const dateStr = row['Date']
      if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue

      const rawVal = parseFloat(row[mapping.col])
      const price = toCnyPerKg(rawVal, mapping.unit)
      if (price == null) { skipped++; continue }

      // 月频数据：用月份第一天作为 observed_date
      const observedDate = dateStr.slice(0, 10)

      const existing = db.prepare(
        'SELECT 1 FROM price_history WHERE spu_id = ? AND observed_date = ?'
      ).get(spuId, observedDate)
      if (existing) { skipped++; continue }

      if (!DRY_RUN) {
        db.prepare(
          `INSERT INTO price_history
             (spu_id, observed_date, price, source_name, source_url, source_priority, raw_text, collected_at, request_id)
           VALUES (?, ?, ?, 'imf', 'https://imf.org/commodity-prices', 5, ?, ?, ?)`,
        ).run(
          spuId, observedDate, price,
          `${rawVal} ${mapping.unit}`,
          now,
          `import_imf_${Date.now()}`,
        )
      }
      inserted++
    }

    totalInserted += inserted
    totalSkipped += skipped
    console.log(`  ${mapping.name} (${mapping.code}): inserted=${inserted} skipped=${skipped}`)
  }

  console.log(`\n[import] DONE  total_inserted=${totalInserted} total_skipped=${totalSkipped}`)
  if (DRY_RUN) console.log('[import] DRY RUN — nothing written to DB')
}

if (require.main === module) {
  try {
    main()
    process.exit(0)
  } catch (err) {
    console.error('[import] failed:', err)
    process.exit(1)
  }
}

module.exports = { main }
