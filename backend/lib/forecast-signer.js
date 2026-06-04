// backend/lib/forecast-signer.js
// market-price-forecast Phase 1: HMAC-SHA256 请求签名 + 防重放
// 关联：design.md §15 (安全), §2.5 (跨服务通信协议)
// Validates: Requirement 3.1 (HTTP REST + JSON + 请求签名)
// Properties: 20 (签名 + 防重放 + 时钟偏差 ≤5min)

const crypto = require('node:crypto')

const NONCE_TTL_MS = 5 * 60 * 1000 // 5 分钟
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000 // ±5 分钟
const HEADER_SIGNATURE = 'x-forecast-signature'
const HEADER_NONCE = 'x-forecast-nonce'
const HEADER_TIMESTAMP = 'x-forecast-timestamp'
const HEADER_REQUEST_ID = 'x-forecast-request-id'

// === 内存 nonce 缓存（LRU + TTL）===
// 单进程足够，符合 Phase 1 范围；后续阶段如需多进程可替换为 Redis。
const nonceStore = new Map()
const NONCE_STORE_LIMIT = 10_000

const purgeExpiredNonces = (now = Date.now()) => {
  for (const [nonce, expireAt] of nonceStore) {
    if (expireAt > now) break // Map 按插入顺序遍历，先到的先过期
    nonceStore.delete(nonce)
  }
}

const rememberNonce = (nonce, now = Date.now()) => {
  if (nonceStore.size >= NONCE_STORE_LIMIT) {
    // 简单 LRU：删除最旧的一个
    const oldestKey = nonceStore.keys().next().value
    if (oldestKey !== undefined) nonceStore.delete(oldestKey)
  }
  nonceStore.set(nonce, now + NONCE_TTL_MS)
}

const seenNonce = (nonce, now = Date.now()) => {
  purgeExpiredNonces(now)
  return nonceStore.has(nonce)
}

// === 工具：normalize path（去掉 query / fragment 与多余尾斜杠）===
const normalizePath = (rawPath) => {
  const cleaned = String(rawPath || '/').split('?')[0].split('#')[0]
  if (!cleaned.startsWith('/')) return `/${cleaned}`
  return cleaned
}

// === 核心：生成签名 ===
// canonical = METHOD + '\n' + PATH + '\n' + sha256(body) + '\n' + nonce + '\n' + timestamp
const computeSignature = ({ method, path, body, nonce, timestamp, secret }) => {
  if (!secret) throw new Error('forecast_signer_missing_secret')
  const canonicalMethod = String(method || 'GET').toUpperCase()
  const canonicalPath = normalizePath(path)
  const bodyText = body == null ? '' : Buffer.isBuffer(body) ? body.toString('utf8') : String(body)
  const bodyHash = crypto.createHash('sha256').update(bodyText, 'utf8').digest('hex')
  const canonical = [canonicalMethod, canonicalPath, bodyHash, String(nonce), String(timestamp)].join('\n')
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')
}

const generateNonce = () => crypto.randomBytes(16).toString('hex')

// 27 字符 KSUID 风格 ID（不依赖外部 lib，足以表达时序 + 随机 entropy）
// 格式：14 位时间戳（base36 padStart） + 13 位随机 base36
const generateRequestId = () => {
  const timePart = Date.now().toString(36).padStart(14, '0').slice(-14)
  const randPart = crypto.randomBytes(8).toString('hex').slice(0, 13)
  return `${timePart}${randPart}`.slice(0, 27)
}

// === 签名一次完整请求（client 端）===
const signRequest = ({ method, path, body, secret, nonce = generateNonce(), timestamp = Date.now(), requestId }) => {
  const ts = String(timestamp)
  const signature = computeSignature({ method, path, body, nonce, timestamp: ts, secret })
  return {
    headers: {
      [HEADER_SIGNATURE]: signature,
      [HEADER_NONCE]: nonce,
      [HEADER_TIMESTAMP]: ts,
      [HEADER_REQUEST_ID]: requestId || generateRequestId(),
    },
    nonce,
    timestamp: ts,
    signature,
  }
}

// === 校验签名（server 端）===
// 返回值：{ ok: true, requestId } 或 { ok: false, reason }
const verifyRequest = ({ method, path, body, headers, secret, now = Date.now() }) => {
  if (!secret) return { ok: false, reason: 'missing_secret' }
  if (!headers || typeof headers !== 'object') return { ok: false, reason: 'missing_headers' }

  // headers 可能是普通 object 或 Headers 实例；统一小写访问
  const get = (key) => {
    if (typeof headers.get === 'function') return headers.get(key)
    const lower = key.toLowerCase()
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === lower) return v
    }
    return undefined
  }

  const sig = get(HEADER_SIGNATURE)
  const nonce = get(HEADER_NONCE)
  const ts = get(HEADER_TIMESTAMP)

  if (!sig || !nonce || !ts) return { ok: false, reason: 'missing_signature_headers' }

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'invalid_timestamp' }
  if (Math.abs(now - tsNum) > TIMESTAMP_TOLERANCE_MS) return { ok: false, reason: 'expired' }

  if (seenNonce(String(nonce), now)) return { ok: false, reason: 'replay' }

  let expected
  try {
    expected = computeSignature({ method, path, body, nonce: String(nonce), timestamp: String(ts), secret })
  } catch (_error) {
    return { ok: false, reason: 'signature_compute_failed' }
  }

  const sigBuffer = Buffer.from(String(sig), 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  if (sigBuffer.length !== expectedBuffer.length) return { ok: false, reason: 'invalid_signature' }
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return { ok: false, reason: 'invalid_signature' }

  // 通过校验后才把 nonce 计入"已见"，避免无效请求消耗 nonce 槽位
  rememberNonce(String(nonce), now)
  return { ok: true, requestId: get(HEADER_REQUEST_ID) || null }
}

module.exports = {
  HEADER_SIGNATURE,
  HEADER_NONCE,
  HEADER_TIMESTAMP,
  HEADER_REQUEST_ID,
  NONCE_TTL_MS,
  TIMESTAMP_TOLERANCE_MS,
  computeSignature,
  signRequest,
  verifyRequest,
  generateNonce,
  generateRequestId,
  normalizePath,
  // 测试入口
  __resetNonceStore: () => nonceStore.clear(),
}
