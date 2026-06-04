// backend/lib/price-extractors/extractor.moa.js
// 农业农村部市场与信息化司 / 监测预警（scs.moa.gov.cn）
// HTML 周报/月报正文，价格散落在段落里，常用单位"元/公斤"。

'use strict'

const {
  cleanForMatch,
  extractPublishDate,
  findKeywordIndices,
  pickNearestPrice,
  normalizeToCnyPerKg,
} = require('./common')

// extract(html, { variety, sourceUrl })
//   variety: { displayName: string, aliases: string[] }
//   sourceUrl: 来源 URL（透传，不参与抽取）
// 返回：{ price, observedDate, rawText, unit:'CNY/kg' } 或 null
const extract = (html, { variety, sourceUrl: _sourceUrl } = {}) => {
  if (!html || !variety || !variety.displayName) return null
  const text = cleanForMatch(html)
  if (text.length < 30) return null

  const keywords = [variety.displayName, ...(variety.aliases || [])].filter(Boolean)
  const indices = findKeywordIndices(text, keywords)
  if (!indices.length) return null

  // 在每个品种命中位置 ±100 字内寻找价格；取最早的命中
  for (const hit of indices) {
    const matched = pickNearestPrice(text, hit.position, 100)
    if (!matched) continue
    const price = normalizeToCnyPerKg(matched.value, matched.unit)
    if (price == null) continue
    return {
      price,
      observedDate: extractPublishDate(html, text),
      rawText: matched.raw,
      unit: 'CNY/kg',
    }
  }
  return null
}

module.exports = { extract, sourceName: 'moa' }
