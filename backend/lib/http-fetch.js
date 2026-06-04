// backend/lib/http-fetch.js
// market-price-forecast Phase 1 通用 HTTP 抓取工具
// 关联：design.md §5.1（与 market-rag.js 共享礼貌抓取层）, §15.6（UA 含联系邮箱）
// Validates: Requirement 1.3 (≥2000ms 间隔), 1.11 (30s 超时), 12.1 (UA 联系邮箱)
// Properties: 23 (UA 正则)

const { TextDecoder } = require('node:util')

// === 常量 ===
const MIN_POLITE_MS = 2000
const MAX_POLITE_MS = 3500
const DEFAULT_TIMEOUT_MS = 30_000
const ROBOTS_TIMEOUT_MS = 5_000

// 项目标识 + 联系邮箱（Requirement 12.1, design §15.6）
const buildUserAgent = () => {
  const project = String(process.env.FORECAST_PROJECT_TAG || 'AgriCloudManager-Forecast/1.0').trim()
  const email = String(process.env.FORECAST_CONTACT_EMAIL || 'ops@ysngj.cn').trim()
  return `${project} (+contact:${email})`
}

// === 域名级并发控制（per-host concurrency = 1）===
// 同一 host 任意时刻最多 1 个 in-flight 请求。
const hostQueues = new Map()

const acquireHostSlot = (host) => {
  const previous = hostQueues.get(host) || Promise.resolve()
  let release
  const slot = new Promise((resolve) => {
    release = resolve
  })
  hostQueues.set(
    host,
    previous.then(() => slot),
  )
  return { previous, release }
}

const withHostLock = async (host, task) => {
  const { previous, release } = acquireHostSlot(host)
  try {
    await previous
    return await task()
  } finally {
    release()
  }
}

// === 礼貌间隔（Requirement 1.3）===
// 默认 2000-3500ms 随机化；外部可指定上下限但下限不得低于 2000ms。
const sleepPolitely = async ({ minMs = MIN_POLITE_MS, maxMs = MAX_POLITE_MS } = {}) => {
  const safeMin = Math.max(MIN_POLITE_MS, Number(minMs) || MIN_POLITE_MS)
  const safeMax = Math.max(safeMin, Number(maxMs) || MAX_POLITE_MS)
  const span = safeMax - safeMin
  const delay = Math.floor(safeMin + Math.random() * span)
  await new Promise((resolve) => setTimeout(resolve, delay))
  return delay
}

// === 编码探测（兼容 GB18030 / GBK 中文站点）===
const detectEncoding = (headers, buffer) => {
  const contentType = headers.get('content-type') || ''
  const charsetMatch = contentType.match(/charset=([^;\s]+)/i)
  if (charsetMatch) return String(charsetMatch[1]).toLowerCase()

  const head = buffer.toString('latin1', 0, Math.min(buffer.length, 4096))
  const metaMatch = head.match(/<meta[^>]+charset=["']?([^"'\s/>]+)/i)
  if (metaMatch) return String(metaMatch[1]).toLowerCase()
  return 'utf-8'
}

const decodeBuffer = (headers, buffer) => {
  const encoding = detectEncoding(headers, buffer)
  const candidates = [encoding, 'utf-8', 'gb18030', 'gbk']
  for (const candidate of candidates) {
    try {
      return new TextDecoder(candidate).decode(buffer)
    } catch (_error) {
      // 当前 Node.js runtime 不支持该 encoding 时尝试下一个
    }
  }
  return buffer.toString('utf8')
}

// === HTML 实体与标签清理（与 market-rag.js 兼容）===
const HTML_ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

const decodeHtmlEntities = (value) =>
  String(value || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x'
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return HTML_ENTITY_MAP[entity] || match
  })

const stripTags = (html) =>
  decodeHtmlEntities(
    String(html || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )

const normalizeText = (value) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// === 核心抓取入口 ===
// fetchWithBudget(url, { timeoutMs, headers, throwOn5xx })
//   - 强制注入 User-Agent + Accept-Language
//   - 进入 host 队列等待，确保 per-host 并发 = 1
//   - 内置 timeoutMs 默认 30000（Requirement 1.11）
//   - 不主动重试（重试在 Collector 层处理，便于熔断器记录）
//   - 返回 { status, headers, buffer, html, durationMs, finalUrl }
//     status 在网络错误/超时时为 0
const fetchWithBudget = async (url, options = {}) => {
  const {
    method = 'GET',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers: extraHeaders = {},
    politeSleep = true,
    decodeAsHtml = true,
  } = options

  const parsed = new URL(url)
  const host = parsed.host

  return withHostLock(host, async () => {
    if (politeSleep) await sleepPolitely()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
    const startedAt = Date.now()

    try {
      const response = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': buildUserAgent(),
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
          ...extraHeaders,
        },
      })
      const buffer = Buffer.from(await response.arrayBuffer())
      const html = decodeAsHtml ? decodeBuffer(response.headers, buffer) : ''
      return {
        status: response.status,
        headers: response.headers,
        buffer,
        html,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url || url,
        timedOut: false,
      }
    } catch (error) {
      const timedOut = error?.name === 'AbortError'
      return {
        status: 0,
        headers: new Headers(),
        buffer: Buffer.alloc(0),
        html: '',
        durationMs: Date.now() - startedAt,
        finalUrl: url,
        timedOut,
        error: timedOut ? new Error(`request_timeout_after_${timeoutMs}ms`) : error,
      }
    } finally {
      clearTimeout(timer)
    }
  })
}

// 便捷入口：仅抓 robots.txt（5s 超时，不走域名锁，不礼貌等待）
const fetchRobotsTxt = async (host, scheme = 'https') => {
  const protoOk = scheme === 'http' || scheme === 'https'
  const url = host.startsWith('http')
    ? host.replace(/\/+$/, '') + '/robots.txt'
    : `${protoOk ? scheme : 'https'}://${host}/robots.txt`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ROBOTS_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': buildUserAgent() },
    })
    if (!response.ok) {
      return { status: response.status, text: '', durationMs: Date.now() - startedAt, timedOut: false }
    }
    const text = await response.text()
    return { status: response.status, text, durationMs: Date.now() - startedAt, timedOut: false }
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
    return { status: 0, text: '', durationMs: Date.now() - startedAt, timedOut }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  // 常量
  MIN_POLITE_MS,
  MAX_POLITE_MS,
  DEFAULT_TIMEOUT_MS,
  ROBOTS_TIMEOUT_MS,
  // UA
  buildUserAgent,
  // 抓取
  fetchWithBudget,
  fetchRobotsTxt,
  // 等待
  sleepPolitely,
  withHostLock,
  // 文本工具
  detectEncoding,
  decodeBuffer,
  decodeHtmlEntities,
  stripTags,
  normalizeText,
  // 测试用：清理 host 队列（避免跨用例污染）
  __resetHostQueues: () => hostQueues.clear(),
}
