// Feature: market-price-forecast, Phase 1
// Validates: Requirement 1.4 (price_history schema), 2.1 (master tables), 4.1 (forecast_runs)
//
// 用 in-memory SQLite 跑迁移，断言关键字段、CHECK 约束与索引存在。
// 不动 backend/lib/db.js 的全局 db 实例，仅复用其 SQL 字符串：
//   - 这里通过 require('./lib/db') 让 initForecastDb 跑在被复制的内存数据库上
//
// 注：原始 db 实例仍指向磁盘文件。本文件仅校验 SQL 文本可被 SQLite 接受。
// 真正端到端的"内存隔离"测试在 e2e:forecast 中处理。

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { DatabaseSync } = require('node:sqlite')

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

// 用一个临时目录的 SQLite 文件代替全局磁盘文件，避免污染 backend/data
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-forecast-schema-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'test.sqlite').replace(path.join(__dirname, '..', '..'), '')
// SQLITE_PATH 的解析逻辑见 lib/db.js：path.resolve(__dirname, '..', configuredPath)
// 这里直接用绝对路径不依赖 resolve 规则
process.env.SQLITE_PATH = path.join(tmpDir, 'test.sqlite')

// 提示：lib/db.js 用 path.resolve(__dirname, '..', SQLITE_PATH)，
// 但 path.resolve 对绝对路径返回原样，因此设置绝对路径是安全的。

const { db, initDb, initForecastDb } = require('../../lib/db')

test.before(() => {
  initDb()
  initForecastDb()
})

test.after(() => {
  try {
    db.close()
  } catch (_e) {}
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const tableExists = (name) =>
  db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(name) != null

const columnsOf = (name) =>
  db.prepare(`PRAGMA table_info(${name})`).all().map((row) => row.name)

const indexExists = (name) =>
  db
    .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name = ?`)
    .get(name) != null

test('forecast schema: 主数据 5 张表均已创建', () => {
  for (const t of ['origins', 'varieties', 'variety_aliases', 'grades', 'units', 'spu_tuples']) {
    assert.ok(tableExists(t), `table ${t} should exist`)
  }
})

test('forecast schema: price_history 与 collection_logs 字段齐全', () => {
  const priceCols = columnsOf('price_history')
  for (const c of [
    'spu_id',
    'observed_date',
    'price',
    'source_name',
    'source_url',
    'source_priority',
    'raw_text',
    'missing_reason',
    'collected_at',
    'request_id',
  ]) {
    assert.ok(priceCols.includes(c), `price_history.${c} should exist`)
  }

  const logCols = columnsOf('collection_logs')
  for (const c of ['request_id', 'spu_id', 'source_name', 'status', 'reason', 'raw_text']) {
    assert.ok(logCols.includes(c), `collection_logs.${c} should exist`)
  }
})

test('forecast schema: forecast_runs 含 6 状态与 JSON 列', () => {
  const cols = columnsOf('forecast_runs')
  for (const c of [
    'spu_id',
    'origin_date',
    'horizon_days',
    'status',
    'model_families_json',
    'point_estimates_json',
    'ci80_lower_json',
    'ci95_lower_json',
    'borrowed_history_flag',
    'request_id',
  ]) {
    assert.ok(cols.includes(c), `forecast_runs.${c} should exist`)
  }

  // CHECK 约束生效：写入非法状态应抛错
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO forecast_runs (
            request_id, spu_id, origin_date, horizon_days, status,
            model_families_json, point_estimates_json,
            ci80_lower_json, ci80_upper_json, ci95_lower_json, ci95_upper_json,
            generated_at
          ) VALUES (?, 'spu_test', '2026-01-01', 7, 'INVALID_STATUS', '[]', '[]', '[]', '[]', '[]', '[]', ?)`,
        )
        .run('req_test_invalid_status', new Date().toISOString()),
    /CHECK constraint failed|status/i,
  )
})

test('forecast schema: horizon_days 仅允许 7 / 30', () => {
  // 先插一条 spu_tuples 让外键能通过
  db.prepare(
    `INSERT INTO origins (adcode, province, city, county, display_name, status, created_at, updated_at)
     VALUES ('370613', '山东省', '烟台市', '栖霞市', '山东烟台栖霞', 'active', ?, ?)`,
  ).run(new Date().toISOString(), new Date().toISOString())
  db.prepare(
    `INSERT INTO varieties (code, display_name, category, status, created_at, updated_at)
     VALUES ('apple-red-fuji', '红富士苹果', 'fruit', 'active', ?, ?)`,
  ).run(new Date().toISOString(), new Date().toISOString())
  db.prepare(
    `INSERT INTO grades (code, display_name, category, status, created_at, updated_at)
     VALUES ('fruit-grade-1', '一级', 'fruit', 'active', ?, ?)`,
  ).run(new Date().toISOString(), new Date().toISOString())
  db.prepare(
    `INSERT INTO units (code, display_name, status, created_at, updated_at)
     VALUES ('CNY/kg', '元/公斤', 'active', ?, ?)`,
  ).run(new Date().toISOString(), new Date().toISOString())

  const o = db.prepare('SELECT id FROM origins WHERE adcode = ?').get('370613')
  const v = db.prepare('SELECT id FROM varieties WHERE code = ?').get('apple-red-fuji')
  const g = db.prepare('SELECT id FROM grades WHERE code = ?').get('fruit-grade-1')
  const u = db.prepare('SELECT id FROM units WHERE code = ?').get('CNY/kg')

  db.prepare(
    `INSERT INTO spu_tuples (spu_id, origin_id, variety_id, grade_id, unit_id, status, display_name, created_at, updated_at)
     VALUES ('spu_test', ?, ?, ?, ?, 'active', '测试', ?, ?)`,
  ).run(o.id, v.id, g.id, u.id, new Date().toISOString(), new Date().toISOString())

  // horizon_days 必须 7 或 30
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO forecast_runs (
            request_id, spu_id, origin_date, horizon_days, status,
            model_families_json, point_estimates_json,
            ci80_lower_json, ci80_upper_json, ci95_lower_json, ci95_upper_json,
            generated_at
          ) VALUES ('req_horizon_x', 'spu_test', '2026-01-01', 14, 'active',
                    '["arima"]', '[1]', '[0.5]', '[1.5]', '[0.2]', '[1.8]', ?)`,
        )
        .run(new Date().toISOString()),
    /CHECK constraint failed|horizon/i,
  )
})

test('forecast schema: 关键索引存在', () => {
  for (const idx of [
    'idx_spu_status',
    'idx_price_history_spu_date',
    'idx_collection_logs_created',
    'idx_forecast_runs_spu_active',
    'idx_forecast_run_models_run',
  ]) {
    assert.ok(indexExists(idx), `index ${idx} should exist`)
  }
})

test('forecast schema: market_items.spu_id 已挂上', () => {
  const cols = columnsOf('market_items')
  assert.ok(cols.includes('spu_id'), 'market_items.spu_id should exist')
})

test('forecast schema: 重复迁移幂等（再跑一次不应抛错）', () => {
  initForecastDb()
  initForecastDb()
})
