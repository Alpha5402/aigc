// backend/lib/price-extractors/extractor.agri-cn.js
// 中国农业农村信息网（www.agri.cn）
// 月度评论文章，价格散落正文最多的来源；窗口最大、容忍最强。

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

  // agri.cn 评论性文章；窗口放宽到 200 字符，按命中顺序取首个有效价格
  for (const hit of indices) {
    const matched = pickNearestPrice(text, hit.position, 200)
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

module.exports = { extract, sourceName: 'agri-cn' }
