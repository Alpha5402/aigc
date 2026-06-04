// backend/lib/robots-cache.js
// market-price-forecast Phase 1, Task 1.3.2
// 关联：requirements.md #1.2 / #1.10, design.md §5.2
// Validates: Requirement 1.2 (robots.txt 遵守), 1.10 (Disallow / 5s timeout 跳过)
//
// 24 小时缓存（写入 robots_cache 表）；首次访问主机时 fetch + 解析后入库。
// 解析使用 npm 包 robots-parser（< 50KB）。

'use strict'

const robotsParser = require('robots-parser')
const { db, nowIso } = require('./db')
const { fetchRobotsTxt, buildUserAgent } = require('./http-fetch')

const CACHE_TTL_HOURS = 24
const ROBOTS_TIMEOUT_MS = 5000

const inMemoryParsers = new Map()

const purgeMemoryParser = (host) => inMemoryParsers.delete(host)

const readCacheRow = (host) =>
  db.prepare('SELECT host, raw_text, fetched_at, expires_at FROM robots_cache WHERE host = ?').get(host)

const writeCacheRow = (host, rawText, ttlHours = CACHE_TTL_HOURS) => {
  const now = nowIso()
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString()
  db.prepare(
    `INSERT INTO robots_cache (host, raw_text, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(host) DO UPDATE SET raw_text = excluded.raw_text,
       fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
  ).run(host, String(rawText || ''), now, expiresAt)
  purgeMemoryParser(host)
}

const isExpired = (row) => {
  if (!row?.expires_at) return true
  return new Date(row.expires_at).getTime() <= Date.now()
}

const buildParser = (host, rawText) => {
  const robotsUrl = `https://${host}/robots.txt`
  const parser = robotsParser(robotsUrl, rawText || '')
  inMemoryParsers.set(host, parser)
  return parser
}

const ensureParserFromCache = (host) => {
  if (inMemoryParsers.has(host)) return inMemoryParsers.get(host)
  const row = readCacheRow(host)
  if (!row || isExpired(row)) return null
  return buildParser(host, row.raw_text)
}

// 输入：完整 URL 与 user-agent 名称（默认从环境变量构建）
// 返回：{ allowed: boolean, reason: 'allow'|'disallow'|'cache_hit_disallow'|'fetched_disallow'|'timeout'|'fetch_error', source: 'cache'|'live' }
const isAllowed = async (url, userAgent = buildUserAgent()) => {
  const parsed = new URL(url)
  const host = parsed.host
  const scheme = parsed.protocol.replace(':', '')

  // 1) 缓存命中
  let parser = ensureParserFromCache(host)
  if (parser) {
    const allowed = parser.isAllowed(url, userAgent)
    return {
      allowed: allowed !== false, // robots-parser 在无规则时返回 undefined → 视为允许
      reason: allowed === false ? 'cache_hit_disallow' : 'allow',
      source: 'cache',
    }
  }

  // 2) 抓取 robots.txt（5s 超时）
  const result = await fetchRobotsTxt(host, scheme)
  if (result.timedOut) {
    return { allowed: false, reason: 'timeout', source: 'live' }
  }
  if (result.status === 0) {
    // 网络层错误（DNS 失败、连接拒绝等）：不缓存，按拒绝处理
    return { allowed: false, reason: 'fetch_error', source: 'live' }
  }
  if (result.status >= 400 && result.status < 500) {
    // 4xx：通常表示 robots.txt 不存在；按"全部允许"处理并缓存空字符串以避免重复请求
    writeCacheRow(host, '', CACHE_TTL_HOURS)
    parser = buildParser(host, '')
    return { allowed: true, reason: 'allow', source: 'live' }
  }
  if (result.status >= 500) {
    // 5xx 不缓存；当次按拒绝处理（保守），下次再尝试
    return { allowed: false, reason: 'fetch_error', source: 'live' }
  }

  // 2xx：写缓存 + 构建解析器
  writeCacheRow(host, result.text, CACHE_TTL_HOURS)
  parser = buildParser(host, result.text)
  const allowed = parser.isAllowed(url, userAgent)
  return {
    allowed: allowed !== false,
    reason: allowed === false ? 'fetched_disallow' : 'allow',
    source: 'live',
  }
}

const invalidate = (host) => {
  if (host) {
    db.prepare('DELETE FROM robots_cache WHERE host = ?').run(host)
    purgeMemoryParser(host)
  } else {
    db.prepare('DELETE FROM robots_cache').run()
    inMemoryParsers.clear()
  }
}

module.exports = {
  isAllowed,
  invalidate,
  CACHE_TTL_HOURS,
  ROBOTS_TIMEOUT_MS,
  // 测试入口
  __resetMemory: () => inMemoryParsers.clear(),
}
