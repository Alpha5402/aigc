// backend/lib/price-extractors/common.js
// 通用工具：单位归一化、日期识别、价格抽取。
// 单位归一化目标：所有抽取器统一输出 元/公斤（CNY/kg），即使原文是元/斤、元/吨。

'use strict'

const { stripTags, normalizeText } = require('../http-fetch')

// 单位归一化（×系数 → 元/公斤）
//  元/公斤 → ×1
//  元/斤   → ×2  （1 斤 = 0.5 公斤；价格"元/斤" → "元/公斤" 的数值乘以 2）
//  元/千克 → ×1
//  元/克   → ×1000
//  元/吨   → ÷1000
//  元/箱（4-5 公斤）→ 视为不可靠，返回 null，让调用方决定是否跳过
const UNIT_MULTIPLIER = {
  '元/公斤': 1,
  '元/千克': 1,
  '元/kg': 1,
  '元/斤': 2,
  '元/克': 1000,
  '元/g': 1000,
}

const TON_TO_KG_DIVISOR = 1000

const PRICE_REGEXES = [
  // 价格 + 单位（带空格容忍）
  /(\d+(?:\.\d+)?)\s*元\s*\/\s*公斤/g,
  /(\d+(?:\.\d+)?)\s*元\s*\/\s*千克/g,
  /(\d+(?:\.\d+)?)\s*元\s*\/\s*kg/gi,
  /(\d+(?:\.\d+)?)\s*元\s*\/\s*斤/g,
  /(\d+(?:\.\d+)?)\s*元\s*\/\s*克/g,
  /(\d+(?:\.\d+)?)\s*元\s*\/\s*吨/g,
]

// 把任意 (数值, 单位) 映射到 元/公斤
const normalizeToCnyPerKg = (value, unitText) => {
  const v = Number(value)
  if (!Number.isFinite(v) || v <= 0) return null
  const t = String(unitText || '').trim()
  if (UNIT_MULTIPLIER[t] != null) return Number((v * UNIT_MULTIPLIER[t]).toFixed(4))
  if (t.includes('元/吨')) return Number((v / TON_TO_KG_DIVISOR).toFixed(4))
  return null
}

// 提取价格的统一入口；返回数组，每项 { value: number, unit: 元/X, raw: string, index: number }
const findPriceMatches = (text) => {
  const out = []
  for (const re of PRICE_REGEXES) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) != null) {
      const raw = m[0]
      const value = Number(m[1])
      const unit = raw.replace(m[1], '').replace(/\s+/g, '')
      out.push({ value, unit, raw, index: m.index })
    }
  }
  // 按出现位置排序
  out.sort((a, b) => a.index - b.index)
  return out
}

// 在 text 内寻找品种关键字（display_name 或别名）出现的位置；返回数组 of index
const findKeywordIndices = (text, keywords) => {
  const idx = []
  for (const kw of keywords) {
    if (!kw) continue
    let pos = 0
    while ((pos = text.indexOf(kw, pos)) !== -1) {
      idx.push({ keyword: kw, position: pos })
      pos += kw.length
    }
  }
  return idx
}

// 在品种关键字附近 ±window 字符内寻找最接近的价格
const pickNearestPrice = (text, keywordIdx, window = 100) => {
  const matches = findPriceMatches(text)
  if (!matches.length) return null
  let best = null
  let bestDistance = Infinity
  for (const m of matches) {
    const center = m.index + m.raw.length / 2
    const distance = Math.abs(center - keywordIdx)
    if (distance < bestDistance && distance <= window) {
      bestDistance = distance
      best = m
    }
  }
  return best
}

// 从 HTML 中提取发布日期（先 H1，再 title，最后正文）
const extractPublishDate = (html, plainText) => {
  // 先在 head/h1/h2 中找
  const headMatch =
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    ''
  const head = normalizeText(stripTags(headMatch))
  const hit =
    head.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/) ||
    plainText.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/)
  if (!hit) return null
  const y = hit[1]
  const m = hit[2].padStart(2, '0')
  const d = hit[3].padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 把任意中文/英文长串清理成可用于正则匹配的单行
const cleanForMatch = (html) => normalizeText(stripTags(html || ''))

module.exports = {
  UNIT_MULTIPLIER,
  PRICE_REGEXES,
  normalizeToCnyPerKg,
  findPriceMatches,
  findKeywordIndices,
  pickNearestPrice,
  extractPublishDate,
  cleanForMatch,
}
