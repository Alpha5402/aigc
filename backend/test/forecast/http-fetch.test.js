// Feature: market-price-forecast
// Validates: Requirement 1.3 (≥2000ms 礼貌间隔), 12.1 (UA 含联系邮箱)
// Properties: 23 (UA 正则)

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildUserAgent,
  sleepPolitely,
  MIN_POLITE_MS,
  detectEncoding,
  decodeBuffer,
  decodeHtmlEntities,
  stripTags,
  normalizeText,
  withHostLock,
  __resetHostQueues,
} = require('../../lib/http-fetch')

const UA_REGEX = /^[A-Za-z0-9._/-]{1,64}\s+\(\+contact:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\)$/

test('Property 23: User-Agent 命中正则（项目标识 + 联系邮箱）', () => {
  process.env.FORECAST_PROJECT_TAG = 'AgriCloudManager-Forecast/1.0'
  process.env.FORECAST_CONTACT_EMAIL = 'ops@ysngj.cn'
  const ua = buildUserAgent()
  assert.match(ua, UA_REGEX)
})

test('Property 23: 切换不同项目标识/邮箱后仍命中正则', () => {
  process.env.FORECAST_PROJECT_TAG = 'TestProject/2.3'
  process.env.FORECAST_CONTACT_EMAIL = 'a.b+c@example.co'
  const ua = buildUserAgent()
  assert.match(ua, UA_REGEX)
  // 复原默认值
  process.env.FORECAST_PROJECT_TAG = 'AgriCloudManager-Forecast/1.0'
  process.env.FORECAST_CONTACT_EMAIL = 'ops@ysngj.cn'
})

test('Requirement 1.3: sleepPolitely 至少 2000ms', async () => {
  const start = Date.now()
  await sleepPolitely({ minMs: 2000, maxMs: 2200 })
  const elapsed = Date.now() - start
  assert.ok(elapsed >= MIN_POLITE_MS - 50, `elapsed=${elapsed} < ${MIN_POLITE_MS}`)
})

test('Requirement 1.3: 即使外部传入 minMs<2000 也强制提升到 2000', async () => {
  const start = Date.now()
  await sleepPolitely({ minMs: 100, maxMs: 200 })
  const elapsed = Date.now() - start
  assert.ok(elapsed >= MIN_POLITE_MS - 50, `elapsed=${elapsed} < ${MIN_POLITE_MS}`)
})

test('detectEncoding: Content-Type charset 优先', () => {
  const headers = new Headers({ 'content-type': 'text/html; charset=GB18030' })
  const enc = detectEncoding(headers, Buffer.from(''))
  assert.equal(enc, 'gb18030')
})

test('detectEncoding: meta charset 兜底', () => {
  const html = '<html><head><meta charset="gbk"></head>'
  const enc = detectEncoding(new Headers(), Buffer.from(html, 'utf8'))
  assert.equal(enc, 'gbk')
})

test('decodeBuffer: 正常 UTF-8 中文解码', () => {
  const text = '价格 5.20 元/公斤'
  const buf = Buffer.from(text, 'utf8')
  const decoded = decodeBuffer(new Headers({ 'content-type': 'text/html; charset=utf-8' }), buf)
  assert.equal(decoded, text)
})

test('decodeHtmlEntities: 解码常见实体', () => {
  assert.equal(decodeHtmlEntities('A&amp;B&nbsp;C'), 'A&B C')
  assert.equal(decodeHtmlEntities('&#x4e2d;&#x6587;'), '中文')
})

test('stripTags + normalizeText: 清理 HTML 噪声', () => {
  const html = '<p>价格 <b>5.20</b> 元/公斤</p><script>alert(1)</script>'
  const txt = normalizeText(stripTags(html))
  assert.equal(txt, '价格 5.20 元/公斤')
})

test('withHostLock: 同 host 串行执行', async () => {
  __resetHostQueues()
  const order = []
  const a = withHostLock('example.com', async () => {
    order.push('a-start')
    await new Promise((r) => setTimeout(r, 50))
    order.push('a-end')
    return 'a'
  })
  const b = withHostLock('example.com', async () => {
    order.push('b-start')
    return 'b'
  })
  await Promise.all([a, b])
  // a-start 与 a-end 必须连续；b 不能在 a 结束前开始
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start'])
})

test('withHostLock: 不同 host 可并发', async () => {
  __resetHostQueues()
  const order = []
  const a = withHostLock('a.example.com', async () => {
    order.push('a-start')
    await new Promise((r) => setTimeout(r, 50))
    order.push('a-end')
  })
  const b = withHostLock('b.example.com', async () => {
    order.push('b-start')
    await new Promise((r) => setTimeout(r, 10))
    order.push('b-end')
  })
  await Promise.all([a, b])
  // 不同 host 应允许 b-start 早于 a-end
  const aStartIdx = order.indexOf('a-start')
  const bStartIdx = order.indexOf('b-start')
  const aEndIdx = order.indexOf('a-end')
  assert.ok(bStartIdx < aEndIdx, 'b-start should occur before a-end (parallel hosts)')
  assert.ok(aStartIdx < bStartIdx || bStartIdx < aStartIdx)
})
