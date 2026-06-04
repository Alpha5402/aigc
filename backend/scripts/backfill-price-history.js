#!/usr/bin/env node
// backend/scripts/backfill-price-history.js
// market-price-forecast Phase 1, Task 1.7.1
// 关联：design.md §18.1 / tasks.md §1.7
//
// 用 market-rag.js 中既有的 TARGETED_ARTICLE_SOURCES 列表，把过去若干月的
// 公开行情文章一次性灌入 price_history。
//
// 使用：
//   node backend/scripts/backfill-price-history.js               # 默认全部目标 URL
//   node backend/scripts/backfill-price-history.js --source moa  # 仅来源 source
//   node backend/scripts/backfill-price-history.js --spu-id ...  # 仅指定 SPU
//   node backend/scripts/backfill-price-history.js --max-urls 5  # 调试限流
//
// 与 collectDaily 的区别：
//   - daily 走 SPU × source 矩阵；backfill 走"已知文章 URL × 已 active SPU"
//   - daily 的 URL 由调用方传入；backfill 直接从 market-rag.js 拿现成 URL
//   - daily 一天一次；backfill 一次性把过去文章里的价格扫一遍

'use strict'

require('./_bootstrap-env')

const crypto = require('node:crypto')
const { db, initDb, initForecastDb } = require('../lib/db')
const { collectOne } = require('../lib/price-collector')
const { TARGETED_ARTICLE_SOURCES, SEED_SOURCES } = require('../lib/market-rag')
const { isKnownSource } = require('../lib/price-extractors')

// 把 market-rag 的 source 名称映射到我们 4 个来源 ID
const SOURCE_NAME_TO_ID = {
  '中国农业农村信息网-国内外农产品市场动态': 'agri-cn',
  '中国农业农村信息网-最新发布': 'agri-cn',
  '商务部商务预报-地方食用农产品监测': 'mofcom',
  '商务部商务预报-食用农产品市场价格指数': 'mofcom',
  '农业农村部市场与信息化司-监测预警': 'moa',
  '全国农产品批发市场价格信息系统': 'pfsc',
}

const parseArgs = (argv) => {
  const out = {}
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.replace(/^--/, '')
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    out[key] = val
  }
  return out
}

const fetchActiveSpus = (spuIds) => {
  const baseSql = `
    SELECT s.spu_id, s.display_name AS spu_display, s.variety_id,
           v.code AS variety_code, v.display_name AS variety_display
    FROM spu_tuples s
    JOIN varieties v ON v.id = s.variety_id
    WHERE s.status = 'active' AND v.status = 'active'
  `
  if (Array.isArray(spuIds) && spuIds.length) {
    const placeholders = spuIds.map(() => '?').join(',')
    return db.prepare(`${baseSql} AND s.spu_id IN (${placeholders})`).all(...spuIds)
  }
  return db.prepare(baseSql).all()
}

const buildUrlBatches = ({ sourceFilter, maxUrls }) => {
  const batches = []
  for (const source of TARGETED_ARTICLE_SOURCES) {
    const sourceId = SOURCE_NAME_TO_ID[source.name]
    if (!sourceId || !isKnownSource(sourceId)) continue
    if (sourceFilter && sourceId !== sourceFilter) continue
    const urls = Array.isArray(source.urls) ? source.urls.slice() : []
    if (!urls.length) continue
    if (typeof maxUrls === 'number' && maxUrls > 0) urls.length = Math.min(urls.length, maxUrls)
    batches.push({ sourceId, sourceLabel: source.name, urls })
  }
  return batches
}

const main = async () => {
  initDb()
  initForecastDb()

  const args = parseArgs(process.argv)
  const sourceFilter = typeof args.source === 'string' ? args.source.toLowerCase() : null
  const maxUrls = args['max-urls'] != null ? Number(args['max-urls']) : null
  const spuIds = typeof args['spu-id'] === 'string' ? [args['spu-id']] : null

  if (sourceFilter && !isKnownSource(sourceFilter)) {
    console.error(`[backfill] unknown --source value: ${sourceFilter}; expect one of moa|pfsc|mofcom|agri-cn`)
    process.exit(2)
  }

  const requestId = `backfill_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
  const spus = fetchActiveSpus(spuIds)
  if (!spus.length) {
    console.error('[backfill] no active SPU found; run `npm run market:seed` first')
    process.exit(2)
  }

  const batches = buildUrlBatches({ sourceFilter, maxUrls })
  if (!batches.length) {
    console.error('[backfill] no URLs to process')
    process.exit(0)
  }

  const totalAttempts = batches.reduce((acc, b) => acc + b.urls.length, 0) * spus.length
  console.log(`[backfill] requestId=${requestId}`)
  console.log(`[backfill] active SPUs = ${spus.length}, sources = ${batches.length}, total (spu × url) = ${totalAttempts}`)

  let success = 0
  let rejected = 0
  let skipped = 0
  let failed = 0

  for (const batch of batches) {
    console.log(`\n[backfill] === source=${batch.sourceId} (${batch.sourceLabel}) urls=${batch.urls.length} ===`)
    for (const url of batch.urls) {
      for (const spu of spus) {
        let outcome
        try {
          outcome = await collectOne({
            spu,
            sourceName: batch.sourceId,
            sourceUrl: url,
            requestId,
            triggeredBy: 'admin_manual',
          })
        } catch (e) {
          outcome = { status: 'failed', error: e?.message }
        }
        switch (outcome.status) {
          case 'success':
            success += 1
            console.log(`  ✅ ${spu.variety_code} ${url} → ${outcome.observedDate} ¥${outcome.price}`)
            break
          case 'rejected':
            rejected += 1
            console.log(`  ⚠️  ${spu.variety_code} ${url} → rejected`)
            break
          case 'skipped':
            skipped += 1
            break
          case 'failed':
            failed += 1
            console.log(`  ❌ ${spu.variety_code} ${url} → failed`)
            break
        }
      }
    }
  }

  console.log(`\n[backfill] DONE  success=${success} rejected=${rejected} skipped=${skipped} failed=${failed}`)
  process.exit(0)
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[backfill] unhandled', err)
    process.exit(1)
  })
}

module.exports = { main }
