const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { db, nowIso } = require('../lib/db')
const { mergePriceRow } = require('../lib/price-collector')

const CSV_PATH = path.join(__dirname, '../../model-service/data/raw/china_wholesale_daily.csv')

const ensureOrigin = (marketName) => {
  const cleanName = String(marketName || '全国均价').trim()
  const adcode = cleanName === '全国均价' ? '000000' : crypto.createHash('md5').update(cleanName).digest('hex').substring(0, 6)
  
  let row = db.prepare('SELECT * FROM origins WHERE display_name = ?').get(cleanName)
  if (!row) {
    const now = nowIso()
    db.prepare(`
      INSERT INTO origins (adcode, province, city, county, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      adcode,
      cleanName === '全国均价' ? '全国' : '未知',
      cleanName === '全国均价' ? '全国' : '未知',
      null,
      cleanName,
      now,
      now
    )
    row = db.prepare('SELECT * FROM origins WHERE display_name = ?').get(cleanName)
  }
  return row
}

const getPinyinApprox = (text) => {
  // Simple fallback for variety codes if no library available
  const map = { '苹果': 'apple', '大豆': 'soybean', '玉米': 'corn', '小麦': 'wheat', '猪肉': 'pork' }
  return map[text] || crypto.createHash('md5').update(text).digest('hex').substring(0, 6)
}

const ensureVariety = (productName) => {
  const cleanName = String(productName).trim()
  let row = db.prepare('SELECT * FROM varieties WHERE display_name = ?').get(cleanName)
  if (!row) {
    const now = nowIso()
    const code = getPinyinApprox(cleanName)
    db.prepare(`
      INSERT INTO varieties (code, display_name, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(code, cleanName, 'general', now, now)
    row = db.prepare('SELECT * FROM varieties WHERE display_name = ?').get(cleanName)
  }
  return row
}

const ensureUnit = (unitName) => {
  const cleanName = String(unitName).trim()
  let row = db.prepare('SELECT * FROM units WHERE display_name = ?').get(cleanName)
  if (!row) {
    const now = nowIso()
    const code = cleanName === '元/公斤' ? 'cny_kg' : 'cny_jin'
    const factor = cleanName === '元/公斤' ? 1.0 : 2.0
    db.prepare(`
      INSERT INTO units (code, display_name, base_unit, conversion_factor, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code, cleanName, 'CNY/kg', factor, now, now)
    row = db.prepare('SELECT * FROM units WHERE display_name = ?').get(cleanName)
  }
  return row
}

const ensureGrade = (gradeName = '通货') => {
  let row = db.prepare('SELECT * FROM grades WHERE display_name = ?').get(gradeName)
  if (!row) {
    const now = nowIso()
    db.prepare(`
      INSERT INTO grades (code, display_name, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('standard', gradeName, 'general', now, now)
    row = db.prepare('SELECT * FROM grades WHERE display_name = ?').get(gradeName)
  }
  return row
}

const ensureSpu = (origin, variety, grade, unit) => {
  const spuId = `spu_${origin.adcode}_${variety.code}_${grade.code}_${unit.code}`
  let row = db.prepare('SELECT * FROM spu_tuples WHERE spu_id = ?').get(spuId)
  if (!row) {
    const now = nowIso()
    const displayName = `${origin.display_name}${variety.display_name}`
    db.prepare(`
      INSERT INTO spu_tuples (spu_id, origin_id, variety_id, grade_id, unit_id, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(spuId, origin.id, variety.id, grade.id, unit.id, displayName, now, now)
    row = db.prepare('SELECT * FROM spu_tuples WHERE spu_id = ?').get(spuId)
  }
  return row
}

const importPfscData = () => {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV file not found at ${CSV_PATH}`)
    console.error('Please run Python crawler first: python model-service/data/scripts/crawl_pfsc.py')
    process.exit(1)
  }

  console.log(`Reading ${CSV_PATH}...`)
  const content = fs.readFileSync(CSV_PATH, 'utf-8')
  
  const lines = content.split('\n').map(l => l.trim()).filter(l => l)
  if (lines.length < 2) {
    console.error('No data found in CSV.')
    process.exit(1)
  }
  
  const headers = lines[0].split(',')
  const records = lines.slice(1).map(line => {
    const values = line.split(',')
    const record = {}
    headers.forEach((h, i) => record[h] = values[i])
    return record
  })
  
  console.log(`Found ${records.length} records. Importing to DB...`)

  const requestId = 'import_pfsc_' + Date.now()
  let insertCount = 0
  let replaceCount = 0
  let skipCount = 0

  db.exec('BEGIN TRANSACTION')
  try {
    for (const record of records) {
      const { date, product, market, price_avg, unit } = record
      if (!price_avg || !date || !product) continue

      const origin = ensureOrigin(market)
      const variety = ensureVariety(product)
      const unitRow = ensureUnit(unit)
      const grade = ensureGrade()
      const spu = ensureSpu(origin, variety, grade, unitRow)

      const result = mergePriceRow({
        spuId: spu.spu_id,
        observedDate: date,
        price: Number(price_avg),
        sourceName: '全国农产品批发市场价格信息系统',
        sourceUrl: 'https://pfsc.agri.cn',
        rawText: JSON.stringify(record),
        requestId
      })

      if (result.action === 'insert') insertCount++
      else if (result.action === 'replace') replaceCount++
      else skipCount++
    }
    db.exec('COMMIT')
    console.log(`Import complete! Inserted: ${insertCount}, Replaced: ${replaceCount}, Skipped: ${skipCount}`)
  } catch (error) {
    db.exec('ROLLBACK')
    console.error('Import failed:', error)
  }
}

importPfscData()
