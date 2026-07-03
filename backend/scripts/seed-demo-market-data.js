const { loadEnv } = require('../lib/env')

loadEnv()

const { db, initDb, nowIso } = require('../lib/db')
const { forecastOne } = require('../lib/forecast-engine')

initDb()

const toChinaDate = (date = new Date()) => new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)

const addDays = (dateText, delta) => {
  const date = new Date(`${dateText}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

const roundPrice = (value) => Number(value.toFixed(2))

const buildSeries = ({ days, base, trend, seasonal, event, weekly, floor }) => {
  const values = []
  for (let i = 0; i < days; i += 1) {
    const t = i / Math.max(1, days - 1)
    const seasonalWave = Math.sin(i / 8.5) * seasonal + Math.cos(i / 19) * seasonal * 0.55
    const weeklyWave = Math.sin((i % 7) / 7 * Math.PI * 2) * weekly
    const eventWave = Math.exp(-Math.pow((t - event.center) / event.width, 2)) * event.strength
    const correctionWave = Math.exp(-Math.pow((t - 0.82) / 0.08, 2)) * -event.strength * 0.45
    const price = base + trend * t + seasonalWave + weeklyWave + eventWave + correctionWave
    values.push(roundPrice(Math.max(floor, price)))
  }
  return values
}

const demoConfigs = [
  {
    marketName: '苹果',
    spuId: 'spu_370600_apple_standard_cny_jin',
    base: 4.34,
    trend: 0.42,
    seasonal: 0.18,
    weekly: 0.05,
    event: { center: 0.62, width: 0.12, strength: 0.34 },
    floor: 3.6,
    prediction: '优果需求回暖，短期价格预计温和震荡上行',
    advice: '建议按等级分批出货，优先锁定高品质订单，普通果源随行就市。',
  },
  {
    marketName: '大豆',
    spuId: 'spu_370600_soybean_standard_cny_jin',
    base: 5.72,
    trend: -0.18,
    seasonal: 0.11,
    weekly: 0.03,
    event: { center: 0.45, width: 0.16, strength: 0.22 },
    floor: 4.9,
    prediction: '供应相对充足，价格以窄幅震荡为主',
    advice: '建议关注饲料厂采购节奏，分批成交降低库存波动风险。',
  },
  {
    marketName: '玉米',
    spuId: 'spu_370600_corn_standard_cny_jin',
    base: 2.22,
    trend: 0.16,
    seasonal: 0.07,
    weekly: 0.02,
    event: { center: 0.72, width: 0.1, strength: -0.12 },
    floor: 1.8,
    prediction: '基层上量放缓，短期价格存在小幅修复空间',
    advice: '建议结合烘干成本和本地收购价，小批量滚动销售。',
  },
]

const upsertHistory = db.prepare(`
  INSERT INTO price_history (
    spu_id, observed_date, price, source_name, source_url, source_priority,
    raw_text, collected_at, request_id
  ) VALUES (?, ?, ?, 'demo-market', 'local://demo-market-data', 9, ?, ?, ?)
  ON CONFLICT(spu_id, observed_date) DO UPDATE SET
    price = excluded.price,
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    source_priority = excluded.source_priority,
    raw_text = excluded.raw_text,
    collected_at = excluded.collected_at,
    request_id = excluded.request_id,
    missing_reason = NULL
`)

const updateMarketItem = db.prepare(`
  UPDATE market_items
  SET current_price = ?,
      avg_price = ?,
      high_price = ?,
      low_price = ?,
      change_percent = ?,
      trend = ?,
      prediction = ?,
      advice = ?,
      market_status = ?,
      updated_at = ?
  WHERE spu_id = ?
`)

const seedOne = async (config, endDate) => {
  const days = 120
  const startDate = addDays(endDate, -(days - 1))
  const values = buildSeries({ ...config, days })
  const requestId = `demo_market_${Date.now().toString(36)}_${config.marketName}`
  const collectedAt = nowIso()

  db.exec('BEGIN')
  try {
    values.forEach((price, index) => {
      const observedDate = addDays(startDate, index)
      const rawText = `演示行情数据：${config.marketName} ${observedDate} 价格 ${price} 元/斤，包含季节性、采购节奏和短期供需波动。`
      upsertHistory.run(config.spuId, observedDate, price, rawText, collectedAt, requestId)
    })

    const lastPrice = values[values.length - 1]
    const prevWeekPrice = values[values.length - 8]
    const changePercent = Number((((lastPrice - prevWeekPrice) / prevWeekPrice) * 100).toFixed(1))
    const recentValues = values.slice(-30)
    const trend = changePercent > 1 ? 'up' : changePercent < -1 ? 'down' : 'stable'
    const marketStatus = trend === 'up' ? '偏强运行' : trend === 'down' ? '震荡偏弱' : '平稳震荡'

    updateMarketItem.run(
      lastPrice,
      roundPrice(recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length),
      Math.max(...recentValues),
      Math.min(...recentValues),
      changePercent,
      trend,
      config.prediction,
      config.advice,
      marketStatus,
      collectedAt,
      config.spuId,
    )
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  const forecast7 = await forecastOne({ spuId: config.spuId, horizonDays: 7, originDate: toChinaDate() })
  const forecast30 = await forecastOne({ spuId: config.spuId, horizonDays: 30, originDate: toChinaDate() })

  return {
    marketName: config.marketName,
    spuId: config.spuId,
    startDate,
    endDate,
    rows: values.length,
    lastPrice: values[values.length - 1],
    minPrice: Math.min(...values),
    maxPrice: Math.max(...values),
    forecast7,
    forecast30,
  }
}

const main = async () => {
  const endDate = addDays(toChinaDate(), -1)
  const results = []

  for (const config of demoConfigs) {
    const exists = db.prepare("SELECT 1 FROM spu_tuples WHERE spu_id = ? AND status = 'active'").get(config.spuId)
    if (!exists) {
      results.push({ marketName: config.marketName, spuId: config.spuId, skipped: 'spu_not_found' })
      continue
    }
    results.push(await seedOne(config, endDate))
  }

  console.log(JSON.stringify({ endDate, results }, null, 2))
}

main().catch((error) => {
  console.error('[seed-demo-market-data] failed:', error)
  process.exit(1)
})
