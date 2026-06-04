// Feature: market-price-forecast, Property 20: HMAC + nonce + timestamp
// Validates: Requirement 3.1
//
// 覆盖：
//   - 同密钥同输入恒等
//   - 任一字段改变 verify 失败
//   - 同 nonce 二次失败（防重放）
//   - timestamp 偏差 > 5 分钟失败
//   - 密钥不一致失败

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fc = require('fast-check')

const {
  computeSignature,
  signRequest,
  verifyRequest,
  generateNonce,
  generateRequestId,
  TIMESTAMP_TOLERANCE_MS,
  __resetNonceStore,
} = require('../../lib/forecast-signer')

const SECRET = 'unit-test-secret-32bytes-aaaaaaaa'
const ALT_SECRET = 'different-secret-32bytes-bbbbbbbbb'

test.beforeEach(() => __resetNonceStore())

test('Property 20: 同密钥同输入恒等', () => {
  const args = {
    method: 'POST',
    path: '/forecast',
    body: '{"hello":"world"}',
    nonce: 'nonce-1234567890ab',
    timestamp: '1700000000000',
    secret: SECRET,
  }
  const a = computeSignature(args)
  const b = computeSignature(args)
  assert.equal(a, b)
  assert.equal(a.length, 64) // SHA-256 hex
})

test('Property 20: signRequest 输出可被 verify 接受', () => {
  const body = JSON.stringify({ spu_id: 'spu_test', horizon_days: 7 })
  const { headers } = signRequest({
    method: 'POST',
    path: '/forecast',
    body,
    secret: SECRET,
  })
  const result = verifyRequest({
    method: 'POST',
    path: '/forecast',
    body,
    headers,
    secret: SECRET,
  })
  assert.equal(result.ok, true)
  assert.match(headers['x-forecast-request-id'], /^.{16,64}$/)
})

test('Property 20: 任一字段改变 verify 失败', () => {
  const body = '{"a":1}'
  const ts = String(Date.now())
  const nonce = generateNonce()
  const sig = computeSignature({ method: 'POST', path: '/forecast', body, nonce, timestamp: ts, secret: SECRET })

  const baseHeaders = {
    'x-forecast-signature': sig,
    'x-forecast-nonce': nonce,
    'x-forecast-timestamp': ts,
  }

  // body 改变 → 失败
  __resetNonceStore()
  let r = verifyRequest({
    method: 'POST',
    path: '/forecast',
    body: '{"a":2}',
    headers: { ...baseHeaders },
    secret: SECRET,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'invalid_signature')

  // method 改变 → 失败
  __resetNonceStore()
  r = verifyRequest({
    method: 'GET',
    path: '/forecast',
    body,
    headers: { ...baseHeaders },
    secret: SECRET,
  })
  assert.equal(r.ok, false)

  // path 改变 → 失败
  __resetNonceStore()
  r = verifyRequest({
    method: 'POST',
    path: '/forecast/batch',
    body,
    headers: { ...baseHeaders },
    secret: SECRET,
  })
  assert.equal(r.ok, false)

  // 密钥改变 → 失败
  __resetNonceStore()
  r = verifyRequest({
    method: 'POST',
    path: '/forecast',
    body,
    headers: { ...baseHeaders },
    secret: ALT_SECRET,
  })
  assert.equal(r.ok, false)
})

test('Property 20: 同 nonce 二次失败（防重放）', () => {
  const body = '{}'
  const { headers } = signRequest({ method: 'POST', path: '/forecast', body, secret: SECRET })
  const r1 = verifyRequest({ method: 'POST', path: '/forecast', body, headers, secret: SECRET })
  assert.equal(r1.ok, true)
  const r2 = verifyRequest({ method: 'POST', path: '/forecast', body, headers, secret: SECRET })
  assert.equal(r2.ok, false)
  assert.equal(r2.reason, 'replay')
})

test('Property 20: timestamp 偏差 > 5 分钟失败', () => {
  const body = '{}'
  const oldTs = Date.now() - TIMESTAMP_TOLERANCE_MS - 60_000
  const { headers } = signRequest({
    method: 'POST',
    path: '/forecast',
    body,
    secret: SECRET,
    timestamp: oldTs,
  })
  const r = verifyRequest({ method: 'POST', path: '/forecast', body, headers, secret: SECRET })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'expired')
})

test('Property 20: 缺少签名头返回 missing_signature_headers', () => {
  const r = verifyRequest({
    method: 'POST',
    path: '/forecast',
    body: '{}',
    headers: {},
    secret: SECRET,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'missing_signature_headers')
})

test('Property 20: PBT 200 iter — 任意输入只要参数对得上就能 verify', () => {
  fc.assert(
    fc.property(
      fc.record({
        method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
        path: fc.string({ minLength: 1, maxLength: 64 }).map((s) => `/${s.replace(/[^a-zA-Z0-9_/-]/g, '')}`),
        body: fc.string({ maxLength: 200 }),
        secret: fc.string({ minLength: 16, maxLength: 64 }),
      }),
      ({ method, path, body, secret }) => {
        __resetNonceStore()
        const { headers } = signRequest({ method, path, body, secret })
        const r = verifyRequest({ method, path, body, headers, secret })
        if (!r.ok) {
          // verify 失败时唯一允许的原因是 path 在 normalizePath 后退化为 '/'
          assert.equal(r.ok, true, `verify failed unexpectedly: ${JSON.stringify({ method, path, body, secret, reason: r.reason })}`)
        }
      },
    ),
    { numRuns: 200 },
  )
})

test('Property 20: PBT 200 iter — 任意位变更后 verify 应失败', () => {
  fc.assert(
    fc.property(
      fc.record({
        body: fc.string({ minLength: 1, maxLength: 200 }),
        secret: fc.string({ minLength: 16, maxLength: 64 }),
        flipBit: fc.integer({ min: 0, max: 200 }),
      }),
      ({ body, secret, flipBit }) => {
        __resetNonceStore()
        const { headers } = signRequest({ method: 'POST', path: '/forecast', body, secret })
        // 翻转 body 中某个字符；若 body 为空则跳过
        if (!body.length) return
        const idx = flipBit % body.length
        const tampered = body.slice(0, idx) + (body[idx] === 'X' ? 'Y' : 'X') + body.slice(idx + 1)
        if (tampered === body) return
        const r = verifyRequest({ method: 'POST', path: '/forecast', body: tampered, headers, secret })
        assert.equal(r.ok, false)
      },
    ),
    { numRuns: 200 },
  )
})

test('generateRequestId 长度在 16-64 之间', () => {
  for (let i = 0; i < 1000; i += 1) {
    const id = generateRequestId()
    assert.ok(id.length >= 16 && id.length <= 64, `len=${id.length}`)
  }
})
