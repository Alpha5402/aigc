const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

const configuredPath = process.env.SQLITE_PATH
const DB_PATH = configuredPath
  ? path.resolve(__dirname, '..', configuredPath)
  : path.join(__dirname, '..', 'data', 'agricloud.sqlite')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

const nowIso = () => new Date().toISOString()

const hasColumn = (tableName, columnName) => {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return rows.some((row) => row.name === columnName)
}

const ensureColumn = (tableName, columnName, definition) => {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

const initDb = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      area TEXT NOT NULL,
      plant_date TEXT NOT NULL,
      stage TEXT NOT NULL,
      location TEXT,
      expected_yield REAL NOT NULL DEFAULT 0,
      yield_unit TEXT NOT NULL DEFAULT '斤',
      expected_market_time TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      url TEXT NOT NULL,
      object_key TEXT,
      mime_type TEXT,
      size INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ai_diagnosis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      content TEXT NOT NULL,
      image TEXT,
      reply TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ad_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      template_id INTEGER,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL,
      platform TEXT NOT NULL,
      engagement INTEGER NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS buyer_merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      merchant_type TEXT NOT NULL DEFAULT 'comprehensive',
      contact_name TEXT,
      contact_phone TEXT NOT NULL,
      address TEXT NOT NULL,
      district TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      rating REAL NOT NULL DEFAULT 4.5,
      orders_count INTEGER NOT NULL DEFAULT 0,
      badge TEXT NOT NULL DEFAULT '推荐',
      business_hours TEXT,
      source_platform TEXT,
      source_url TEXT,
      source_note TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      review_note TEXT,
      reviewed_at TEXT,
      reviewed_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS buyer_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL,
      crop_name TEXT NOT NULL,
      price REAL NOT NULL,
      demand INTEGER NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '斤',
      min_quantity INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(merchant_id, crop_name),
      FOREIGN KEY (merchant_id) REFERENCES buyer_merchants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS buyer_interest_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      merchant_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'buyer-page',
      extra_payload TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (merchant_id) REFERENCES buyer_merchants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'system',
      source_id TEXT,
      link_payload TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      read_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS weather_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adcode TEXT NOT NULL UNIQUE,
      province TEXT,
      city TEXT,
      weather TEXT NOT NULL,
      temperature TEXT NOT NULL,
      winddirection TEXT,
      windpower TEXT,
      humidity TEXT,
      reporttime TEXT,
      suggestion TEXT,
      raw_json TEXT,
      fetched_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS buyer_match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      merchant_id INTEGER NOT NULL,
      crop_snapshot TEXT NOT NULL,
      ai_summary TEXT,
      match_score INTEGER NOT NULL,
      distance_km REAL NOT NULL DEFAULT 0,
      estimated_income REAL NOT NULL DEFAULT 0,
      transport_cost REAL NOT NULL DEFAULT 0,
      loss_cost REAL NOT NULL DEFAULT 0,
      net_profit REAL NOT NULL DEFAULT 0,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (merchant_id) REFERENCES buyer_merchants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS market_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT NOT NULL,
      publish_date TEXT,
      content TEXT NOT NULL,
      products_json TEXT NOT NULL DEFAULT '[]',
      prices_json TEXT NOT NULL DEFAULT '[]',
      rates_json TEXT NOT NULL DEFAULT '[]',
      index_200 TEXT,
      basket_index TEXT,
      crawled_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT NOT NULL,
      publish_date TEXT,
      content TEXT NOT NULL,
      products_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY (doc_id) REFERENCES market_documents(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS market_chunks_fts
    USING fts5(
      chunk_id UNINDEXED,
      title,
      content,
      products,
      source_name,
      tokenize = 'unicode61'
    );

    CREATE TABLE IF NOT EXISTS market_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      crop_name TEXT NOT NULL,
      region TEXT,
      question TEXT NOT NULL,
      report_text TEXT NOT NULL,
      retrieved_sources_json TEXT NOT NULL DEFAULT '[]',
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS market_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      current_price REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '斤',
      change_percent REAL NOT NULL DEFAULT 0,
      trend TEXT NOT NULL DEFAULT 'stable',
      prediction TEXT NOT NULL,
      advice TEXT NOT NULL,
      market_status TEXT NOT NULL,
      avg_price REAL NOT NULL DEFAULT 0,
      high_price REAL NOT NULL DEFAULT 0,
      low_price REAL NOT NULL DEFAULT 0,
      week_volume INTEGER NOT NULL DEFAULT 0,
      month_volume INTEGER NOT NULL DEFAULT 0,
      user_owned INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'admin',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications(user_id, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
    ON notifications(user_id, source, source_id)
    WHERE source_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      detail TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created
    ON admin_audit_logs(created_at DESC);
  `)

  ensureColumn('buyer_merchants', 'source_platform', 'TEXT')
  ensureColumn('buyer_merchants', 'source_url', 'TEXT')
  ensureColumn('buyer_merchants', 'source_note', 'TEXT')
  ensureColumn('buyer_merchants', 'merchant_type', "TEXT NOT NULL DEFAULT 'comprehensive'")
  ensureColumn('buyer_merchants', 'review_note', 'TEXT')
  ensureColumn('buyer_merchants', 'reviewed_at', 'TEXT')
  ensureColumn('buyer_merchants', 'reviewed_by', 'INTEGER')
  ensureColumn('crops', 'expected_yield', 'REAL NOT NULL DEFAULT 0')
  ensureColumn('crops', 'yield_unit', "TEXT NOT NULL DEFAULT '斤'")
  ensureColumn('crops', 'expected_market_time', 'TEXT')
  ensureColumn('users', 'avatar', 'TEXT')
  ensureColumn('users', 'real_name', 'TEXT')
  ensureColumn('users', 'region', 'TEXT')
  ensureColumn('users', 'farm_role', 'TEXT')
  ensureColumn('users', 'bio', 'TEXT')
  ensureColumn('users', 'updated_at', 'TEXT')
}

// ===== market-price-forecast Phase 1: schema 迁移 =====
// 关联：.kiro/specs/market-price-forecast/design.md §3
// 本函数在 initDb() 之后调用，仅创建 Phase 1 范围内的表与索引；其它阶段的表
// （backtest_results / model_registry / alert_rules / alert_silences /
// audit_logs / cold_start_jobs）以注释占位，后续阶段补齐。
const initForecastDb = () => {
  db.exec(`
    -- 主数据：产地（行政区划到县级 6 位 GB/T 2260）
    CREATE TABLE IF NOT EXISTS origins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adcode TEXT NOT NULL UNIQUE,
      province TEXT NOT NULL,
      city TEXT NOT NULL,
      county TEXT,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (status IN ('active','inactive')),
      CHECK (length(adcode) = 6)
    );

    -- 主数据：品种
    CREATE TABLE IF NOT EXISTS varieties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (status IN ('active','inactive'))
    );

    -- 品种别名（外部数据源命名 → 内部 variety_id）
    CREATE TABLE IF NOT EXISTS variety_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variety_id INTEGER NOT NULL,
      source_name TEXT NOT NULL,
      alias TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(source_name, alias),
      FOREIGN KEY (variety_id) REFERENCES varieties(id) ON DELETE CASCADE
    );

    -- 主数据：规格（参考国家果蔬分级标准）
    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (status IN ('active','inactive'))
    );

    -- 主数据：单位（统一以 元/公斤 为基准）
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      base_unit TEXT NOT NULL DEFAULT 'CNY/kg',
      conversion_factor REAL NOT NULL DEFAULT 1.0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (status IN ('active','inactive'))
    );

    -- 四元组 SPU（产地 + 品种 + 规格 + 单位）
    CREATE TABLE IF NOT EXISTS spu_tuples (
      spu_id TEXT PRIMARY KEY,
      origin_id INTEGER NOT NULL,
      variety_id INTEGER NOT NULL,
      grade_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(origin_id, variety_id, grade_id, unit_id),
      FOREIGN KEY (origin_id) REFERENCES origins(id),
      FOREIGN KEY (variety_id) REFERENCES varieties(id),
      FOREIGN KEY (grade_id) REFERENCES grades(id),
      FOREIGN KEY (unit_id) REFERENCES units(id),
      CHECK (status IN ('active','inactive'))
    );

    CREATE INDEX IF NOT EXISTS idx_spu_status ON spu_tuples(status);
    CREATE INDEX IF NOT EXISTS idx_spu_variety ON spu_tuples(variety_id);

    -- 价格历史
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spu_id TEXT NOT NULL,
      observed_date TEXT NOT NULL,
      price REAL,
      source_name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_priority INTEGER NOT NULL,
      raw_text TEXT,
      missing_reason TEXT,
      collected_at TEXT NOT NULL,
      request_id TEXT NOT NULL,
      UNIQUE(spu_id, observed_date),
      FOREIGN KEY (spu_id) REFERENCES spu_tuples(spu_id) ON DELETE CASCADE,
      CHECK (price IS NULL OR (price > 0 AND price <= 1000000)),
      CHECK (
        missing_reason IS NULL
        OR missing_reason IN ('holiday','market_closed','collection_failed','unknown')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_price_history_spu_date
      ON price_history(spu_id, observed_date DESC);

    -- 采集日志
    CREATE TABLE IF NOT EXISTS collection_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      spu_id TEXT,
      source_name TEXT NOT NULL,
      source_url TEXT,
      status TEXT NOT NULL,
      http_status INTEGER,
      duration_ms INTEGER,
      reason TEXT,
      raw_text TEXT,
      triggered_by TEXT NOT NULL DEFAULT 'scheduler',
      triggered_user_id INTEGER,
      created_at TEXT NOT NULL,
      CHECK (status IN ('success','rejected','skipped','circuit_break','failed'))
    );

    CREATE INDEX IF NOT EXISTS idx_collection_logs_created
      ON collection_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_collection_logs_spu
      ON collection_logs(spu_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_collection_logs_source
      ON collection_logs(source_name, created_at DESC);

    -- robots.txt 缓存
    CREATE TABLE IF NOT EXISTS robots_cache (
      host TEXT PRIMARY KEY,
      raw_text TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- 来源熔断器状态
    CREATE TABLE IF NOT EXISTS source_circuit_breaker (
      source_name TEXT PRIMARY KEY,
      failure_count INTEGER NOT NULL DEFAULT 0,
      window_started_at TEXT NOT NULL,
      paused_until TEXT,
      updated_at TEXT NOT NULL
    );

    -- 预测主表（含融合后结果）
    CREATE TABLE IF NOT EXISTS forecast_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      spu_id TEXT NOT NULL,
      origin_date TEXT NOT NULL,
      horizon_days INTEGER NOT NULL,
      status TEXT NOT NULL,
      model_families_json TEXT NOT NULL,
      weights_json TEXT NOT NULL DEFAULT '{}',
      point_estimates_json TEXT NOT NULL,
      ci80_lower_json TEXT NOT NULL,
      ci80_upper_json TEXT NOT NULL,
      ci95_lower_json TEXT NOT NULL,
      ci95_upper_json TEXT NOT NULL,
      borrowed_history_flag INTEGER NOT NULL DEFAULT 0,
      borrowed_origin_ids_json TEXT NOT NULL DEFAULT '[]',
      explanation TEXT,
      explanation_summary TEXT,
      generated_at TEXT NOT NULL,
      inference_ms INTEGER,
      shadow_of_run_id INTEGER,
      FOREIGN KEY (spu_id) REFERENCES spu_tuples(spu_id) ON DELETE CASCADE,
      CHECK (horizon_days IN (7, 30)),
      CHECK (status IN (
        'active','superseded','degraded','cold_start','clipped','qualitative-only'
      ))
    );

    CREATE INDEX IF NOT EXISTS idx_forecast_runs_spu_active
      ON forecast_runs(spu_id, horizon_days, status, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_forecast_runs_origin_date
      ON forecast_runs(spu_id, origin_date, horizon_days);

    -- 单模型独立预测结果（便于回测与影子诊断）
    CREATE TABLE IF NOT EXISTS forecast_run_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      forecast_run_id INTEGER NOT NULL,
      model_family TEXT NOT NULL,
      model_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      weight REAL NOT NULL DEFAULT 0,
      point_estimates_json TEXT NOT NULL,
      ci80_lower_json TEXT NOT NULL,
      ci80_upper_json TEXT NOT NULL,
      ci95_lower_json TEXT NOT NULL,
      ci95_upper_json TEXT NOT NULL,
      inference_ms INTEGER,
      error_message TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (forecast_run_id) REFERENCES forecast_runs(id) ON DELETE CASCADE,
      CHECK (status IN ('success','failed','shadow'))
    );

    CREATE INDEX IF NOT EXISTS idx_forecast_run_models_run
      ON forecast_run_models(forecast_run_id);

    -- 调度器分布式锁
    CREATE TABLE IF NOT EXISTS scheduler_locks (
      task_name TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      expire_at INTEGER NOT NULL
    );

    -- ============================================================
    -- Phase 2+ 钩子（占位，仅注释；下一阶段 spec 落地）
    -- backtest_results / model_registry / alert_rules / alert_silences /
    -- audit_logs / cold_start_jobs
    -- 见 .kiro/specs/market-price-forecast/design.md §3.4
    -- ============================================================
  `)

  // 与现有 market_items 衔接（Requirement 2.1, design §3.5）
  ensureColumn('market_items', 'spu_id', 'TEXT REFERENCES spu_tuples(spu_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_market_items_spu ON market_items(spu_id)')
}

const resetDemoData = () => {
  db.exec(`
    DELETE FROM crops;
    DELETE FROM uploads;
    DELETE FROM ai_diagnosis_history;
    DELETE FROM ad_history;
    DELETE FROM buyer_interest_logs;
    DELETE FROM buyer_match_history;
    DELETE FROM notifications;
  `)
}

module.exports = {
  db,
  initDb,
  initForecastDb,
  resetDemoData,
  nowIso,
  ensureColumn,
}
