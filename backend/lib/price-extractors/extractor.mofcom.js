// backend/lib/price-extractors/extractor.mofcom.js
// 商务部商务预报（cif.mofcom.gov.cn）
// 数据形态：周度食用农产品价格指数 + 各地周报正文。

'use strict'

const {
  cleanForMatch,
  extractPublishDate,
  findKeywordIndices,
  pickNearestPrice,
  normalizeToCnyPerKg,
} = require('./common')

const extract = (html, { variety, sourceUrl: _sourceUrl } = {}) => {
  if (!html || !variety || !variety.displayName) return null
  const text = cleanForMatch(html)
  if (text.length < 50) return null

  const keywords = [variety.displayName, ...(variety.aliases || [])].filter(Boolean)
  const indices = findKeywordIndices(text, keywords)
  if (!indices.length) return null

  // mofcom 周报中价格出现的窗口比 moa 略大，给到 150 字符
  for (const hit of indices) {
    const matched = pickNearestPrice(text, hit.position, 150)
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

module.exports = { extract, sourceName: 'mofcom' }
