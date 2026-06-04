// backend/lib/price-extractors/index.js
// market-price-forecast Phase 1, Task 1.4.1
// 关联：design.md §5.3
// 提供 source_name → extractor 的注册中心。
// 每个 extractor 实现统一接口：
//   extract(html, { variety, sourceUrl }) →
//     { price: number, observed_date: string|null, raw_text: string, unit?: 'CNY/kg' } | null

'use strict'

const moa = require('./extractor.moa')
const pfsc = require('./extractor.pfsc')
const mofcom = require('./extractor.mofcom')
const agriCn = require('./extractor.agri-cn')

// source_name 与四个公开来源 ID 的映射（Requirement 1.1 白名单）
const REGISTRY = {
  moa, // 农业农村部市场监测（scs.moa.gov.cn）
  pfsc, // 全国农产品批发市场价格信息系统（pfsc.agri.cn）
  mofcom, // 商务部商务预报（cif.mofcom.gov.cn）
  'agri-cn': agriCn, // 中国农业农村信息网（www.agri.cn）
}

// 每个 source 对应的优先级（与 design §5.4 一致）
const SOURCE_PRIORITY = {
  moa: 1,
  pfsc: 2,
  mofcom: 3,
  'agri-cn': 4,
}

const KNOWN_SOURCES = Object.freeze(Object.keys(REGISTRY))

const getExtractor = (sourceName) => {
  const key = String(sourceName || '').toLowerCase().trim()
  return REGISTRY[key] || null
}

const getSourcePriority = (sourceName) => {
  const key = String(sourceName || '').toLowerCase().trim()
  return SOURCE_PRIORITY[key] || 99
}

const isKnownSource = (sourceName) =>
  KNOWN_SOURCES.includes(String(sourceName || '').toLowerCase().trim())

module.exports = {
  REGISTRY,
  SOURCE_PRIORITY,
  KNOWN_SOURCES,
  getExtractor,
  getSourcePriority,
  isKnownSource,
}
