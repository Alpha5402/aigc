// backend/lib/borrowed-history.js
// market-price-forecast Phase 1, Task 2.4.1
// 关联：requirements.md #8.8, design.md §7.10 / §9.4
//
// 同品种、不同产地的近 N 天价格按日均合并，作为 cold-start 借数序列。
// 仅在 Forecast_Engine 标记 borrowed_history=1 时使用。

'use strict'

const { db } = require('./db')

const DEFAULT_DAYS = 30

// 找出同品种的其他 active SPU
const findSiblingSpus = (spuId) => {
  const me = db.prepare("SELECT spu_id, variety_id FROM spu_tuples WHERE spu_id = ?").get(spuId)
  if (!me) return []
  return db
    .prepare(
      `SELECT spu_id FROM spu_tuples
       WHERE variety_id = ? AND status = 'active' AND spu_id <> ?`,
    )
    .all(me.variety_id, spuId)
}

const getRecentDailyPrices = (spuId, days) => {
  const rows = db
    .prepare(
      `SELECT observed_date, price FROM price_history
       WHERE spu_id = ? AND price IS NOT NULL
       ORDER BY observed_date DESC LIMIT ?`,
    )
    .all(spuId, Math.max(1, Number(days) || DEFAULT_DAYS))
  // 升序便于对齐
  return rows.sort((a, b) => a.observed_date.localeCompare(b.observed_date))
}

// 输入：spu_id；返回 { values: number[], dates: string[], originIds: string[] } 或 null
const tryBorrowedHistory = (spuId, days = DEFAULT_DAYS) => {
  const sibs = findSiblingSpus(spuId)
  if (!sibs.length) return null

  // 收集所有 sibling 的近 days 天价格，按日期分组求均值
  const buckets = new Map() // date → number[]
  const usedSpus = []
  for (const s of sibs) {
    const rows = getRecentDailyPrices(s.spu_id, days)
    if (!rows.length) continue
    usedSpus.push(s.spu_id)
    for (const r of rows) {
      if (!buckets.has(r.observed_date)) buckets.set(r.observed_date, [])
      buckets.get(r.observed_date).push(Number(r.price))
    }
  }

  if (!buckets.size) return null

  const dates = [...buckets.keys()].sort()
  const values = dates.map((d) => {
    const arr = buckets.get(d)
    const sum = arr.reduce((acc, v) => acc + v, 0)
    return Number((sum / arr.length).toFixed(4))
  })

  return {
    dates,
    values,
    originIds: usedSpus,
  }
}

module.exports = {
  DEFAULT_DAYS,
  tryBorrowedHistory,
  __findSiblingSpus: findSiblingSpus,
}
