// backend/lib/master-alias.js
// market-price-forecast Phase 1, Task 1.5.1
// 关联：design.md §6.4
//
// 将外部数据源的原始命名（如 "苹果"、"白菜"）归一化到内部 spu_id。
// 找不到时返回 null，让 Collector 写 collection_logs.reason='unknown_alias'。

'use strict'

const { db } = require('./db')

const KNOWN_SOURCES = new Set(['moa', 'pfsc', 'mofcom', 'agri-cn'])

const normalize = (s) => String(s || '').trim()

// 通过别名 + 来源查 variety
const findVarietyByAlias = (sourceName, externalAlias) => {
  const src = normalize(sourceName).toLowerCase()
  const alias = normalize(externalAlias)
  if (!src || !alias) return null
  return db
    .prepare(
      `SELECT v.* FROM variety_aliases a
       JOIN varieties v ON v.id = a.variety_id
       WHERE a.source_name = ? AND a.alias = ? AND v.status = 'active'`,
    )
    .get(src, alias)
}

// 直接通过 display_name 查 variety（兜底）
const findVarietyByDisplayName = (displayName) => {
  const name = normalize(displayName)
  if (!name) return null
  return db
    .prepare("SELECT * FROM varieties WHERE display_name = ? AND status = 'active'")
    .get(name)
}

// 在 origins 表中模糊匹配产地
// 优先精确匹配 display_name；再尝试双向子串包含 display_name；
// 最后按 county/city/province 子串包含逐级回退。
const findOriginByText = (text) => {
  const t = normalize(text)
  if (!t) return null
  const exact = db
    .prepare("SELECT * FROM origins WHERE display_name = ? AND status = 'active'")
    .get(t)
  if (exact) return exact
  const all = db.prepare("SELECT * FROM origins WHERE status = 'active'").all()
  let best = null
  for (const row of all) {
    const dn = row.display_name || ''
    const matches =
      (dn && (t.includes(dn) || dn.includes(t))) ||
      (row.county && t.includes(row.county)) ||
      (row.city && t.includes(row.city)) ||
      (row.province && t.includes(row.province))
    if (matches) {
      if (!best || dn.length > (best.display_name || '').length) {
        best = row
      }
    }
  }
  return best
}

// 按 category 取该 variety 的"统货" grade（Requirement 2.3 默认）
const findDefaultGradeForCategory = (category) => {
  const cat = normalize(category)
  if (!cat) return null
  return (
    db
      .prepare(
        `SELECT * FROM grades WHERE category = ? AND status = 'active'
         ORDER BY (display_name = '统货') DESC, id ASC LIMIT 1`,
      )
      .get(cat) || null
  )
}

// 默认 unit：CNY/kg（design §4.4）
const findDefaultUnit = () =>
  db.prepare("SELECT * FROM units WHERE code = 'CNY/kg' AND status = 'active'").get()

// 反查 spu_tuples
const findSpuByQuad = ({ originId, varietyId, gradeId, unitId }) =>
  db
    .prepare(
      `SELECT * FROM spu_tuples
       WHERE origin_id = ? AND variety_id = ? AND grade_id = ? AND unit_id = ?
         AND status = 'active'`,
    )
    .get(originId, varietyId, gradeId, unitId)

// 主入口：返回 { spuId, variety, origin, grade, unit, reason? } 或 { reason: 'unknown_*' }
const resolveSpuFromExternalRecord = ({
  sourceName,
  externalVariety,
  externalGrade = null,
  externalOriginText = null,
}) => {
  const src = normalize(sourceName).toLowerCase()
  if (!KNOWN_SOURCES.has(src)) {
    return { spuId: null, reason: `unknown_source:${sourceName}` }
  }

  const variety =
    findVarietyByAlias(src, externalVariety) ||
    findVarietyByDisplayName(externalVariety)
  if (!variety) {
    return { spuId: null, reason: `unknown_alias:${externalVariety}` }
  }

  const grade = externalGrade
    ? findVarietyByDisplayName(externalGrade) || findDefaultGradeForCategory(variety.category)
    : findDefaultGradeForCategory(variety.category)
  if (!grade) {
    return { spuId: null, reason: `unknown_grade:${variety.display_name}` }
  }

  const unit = findDefaultUnit()
  if (!unit) {
    return { spuId: null, reason: 'unknown_unit:CNY/kg' }
  }

  let origin = null
  if (externalOriginText) {
    origin = findOriginByText(externalOriginText)
    if (!origin) {
      return { spuId: null, reason: `unknown_origin:${externalOriginText}` }
    }
  } else {
    // 没有 origin 信息：兜底用第一个 active origin？
    // Phase 1：返回 unknown_origin 让 Collector 看到样本（避免数据进错产地）。
    return { spuId: null, reason: 'missing_origin_text' }
  }

  // 优先按完整四元组（含归一化得到的默认 grade）反查；
  // 失败则按 (origin, variety, unit) 三元组宽松匹配，落到该品种实际可用的任一 grade。
  let spu = findSpuByQuad({
    originId: origin.id,
    varietyId: variety.id,
    gradeId: grade.id,
    unitId: unit.id,
  })
  if (!spu) {
    spu = db
      .prepare(
        `SELECT * FROM spu_tuples
         WHERE origin_id = ? AND variety_id = ? AND unit_id = ? AND status = 'active'
         ORDER BY rowid ASC LIMIT 1`,
      )
      .get(origin.id, variety.id, unit.id)
  }
  if (!spu) {
    return {
      spuId: null,
      reason: `spu_not_registered:${origin.display_name}|${variety.display_name}|${grade.display_name}|${unit.code}`,
    }
  }

  return {
    spuId: spu.spu_id,
    variety,
    origin,
    grade,
    unit,
  }
}

module.exports = {
  KNOWN_SOURCES,
  resolveSpuFromExternalRecord,
  // 内部工具暴露给测试
  __findVarietyByAlias: findVarietyByAlias,
  __findOriginByText: findOriginByText,
  __findDefaultGradeForCategory: findDefaultGradeForCategory,
}
