// backend/lib/price-extractors/extractor.pfsc.js
// 全国农产品批发市场价格信息系统（pfsc.agri.cn）
// 数据形态：日度品种 × 市场价格表（DOM 表格）。
// 这里实现两条路径：
//   1) 表格行匹配：<tr> ... <td>品种</td> <td>价格</td> ...
//   2) 兜底走通用正则
// 该来源是 source_priority=2，最贴近"日频价格"。

'use strict'

const {
  cleanForMatch,
  extractPublishDate,
  findKeywordIndices,
  pickNearestPrice,
  normalizeToCnyPerKg,
  findPriceMatches,
} = require('./common')

const tryParseRow = (rowHtml, variety) => {
  // 先把 <td> 拆出来
  const cells = []
  const re = /<td\b[^>]*>([\s\S]*?)<\/td>/gi
  let m
  while ((m = re.exec(rowHtml)) != null) {
    cells.push(cleanForMatch(m[1]))
  }
  if (cells.length < 2) return null

  // 是否含品种关键词
  const keywords = [variety.displayName, ...(variety.aliases || [])].filter(Boolean)
  const containsVariety = cells.some((c) => keywords.some((k) => c.includes(k)))
  if (!containsVariety) return null

  // 在该行内的所有价格中取第一个有效的
  const matches = findPriceMatches(cells.join(' '))
  if (!matches.length) return null
  const first = matches[0]
  const price = normalizeToCnyPerKg(first.value, first.unit)
  if (price == null) return null

  return {
    price,
    rawText: first.raw,
  }
}

const extract = (html, { variety, sourceUrl: _sourceUrl } = {}) => {
  if (!html || !variety || !variety.displayName) return null
  const text = cleanForMatch(html)

  // 路径 1：表格行
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch
  while ((rowMatch = rowRegex.exec(html)) != null) {
    const r = tryParseRow(rowMatch[0], variety)
    if (r) {
      return {
        price: r.price,
        observedDate: extractPublishDate(html, text),
        rawText: r.rawText,
        unit: 'CNY/kg',
      }
    }
  }

  // 路径 2：通用正则兜底
  const keywords = [variety.displayName, ...(variety.aliases || [])].filter(Boolean)
  const indices = findKeywordIndices(text, keywords)
  if (!indices.length) return null
  for (const hit of indices) {
    const matched = pickNearestPrice(text, hit.position, 80)
    if (matched) {
      const price = normalizeToCnyPerKg(matched.value, matched.unit)
      if (price != null) {
        return {
          price,
          observedDate: extractPublishDate(html, text),
          rawText: matched.raw,
          unit: 'CNY/kg',
        }
      }
    }
  }
  return null
}

module.exports = { extract, sourceName: 'pfsc' }
