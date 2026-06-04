// Feature: market-price-forecast, Task 1.4.2-1.4.5
// 价格抽取器 + 单位归一化的合成 HTML 测试。

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { getExtractor, isKnownSource, getSourcePriority, KNOWN_SOURCES } = require('../../lib/price-extractors')
const { normalizeToCnyPerKg, findPriceMatches } = require('../../lib/price-extractors/common')

const APPLE = { displayName: '红富士苹果', aliases: ['苹果', '红富士'] }
const SOYBEAN = { displayName: '黄大豆', aliases: ['大豆', '黄豆'] }

test('extractors registry: 4 个公开来源全部命中', () => {
  for (const name of ['moa', 'pfsc', 'mofcom', 'agri-cn']) {
    assert.ok(getExtractor(name), `extractor ${name} should exist`)
    assert.ok(isKnownSource(name))
  }
  assert.deepEqual(new Set(KNOWN_SOURCES), new Set(['moa', 'pfsc', 'mofcom', 'agri-cn']))
})

test('source priority: moa < pfsc < mofcom < agri-cn', () => {
  assert.ok(getSourcePriority('moa') < getSourcePriority('pfsc'))
  assert.ok(getSourcePriority('pfsc') < getSourcePriority('mofcom'))
  assert.ok(getSourcePriority('mofcom') < getSourcePriority('agri-cn'))
  assert.equal(getSourcePriority('xx-unknown'), 99)
})

test('单位归一化: 元/公斤 ×1', () => {
  assert.equal(normalizeToCnyPerKg(5.2, '元/公斤'), 5.2)
  assert.equal(normalizeToCnyPerKg(5.2, '元/千克'), 5.2)
})

test('单位归一化: 元/斤 ×2 → 元/公斤', () => {
  assert.equal(normalizeToCnyPerKg(2.6, '元/斤'), 5.2)
})

test('单位归一化: 元/吨 ÷1000', () => {
  assert.equal(normalizeToCnyPerKg(7200, '元/吨'), 7.2)
})

test('单位归一化: 拒绝零或负', () => {
  assert.equal(normalizeToCnyPerKg(0, '元/公斤'), null)
  assert.equal(normalizeToCnyPerKg(-1, '元/公斤'), null)
  assert.equal(normalizeToCnyPerKg('abc', '元/公斤'), null)
})

test('单位归一化: 拒绝未知单位', () => {
  assert.equal(normalizeToCnyPerKg(5, '元/箱'), null)
})

test('findPriceMatches: 多种单位混合识别', () => {
  const text = '红富士苹果 5.20 元/公斤；山东批发价 2.60 元/斤；产地价 4800 元/吨'
  const matches = findPriceMatches(text)
  assert.ok(matches.length >= 3)
})

test('moa extractor: 周报正文段落抽取', () => {
  const html = `<html><head><title>2026年4月20日 农业农村部周报</title></head><body>
    <h1>近期重点品种价格</h1>
    <p>本周全国苹果（红富士）批发价格 5.20 元/公斤，环比上涨 1.2%。</p>
    <p>大豆批发价格 4.80 元/公斤，保持平稳。</p>
  </body></html>`
  const r = getExtractor('moa').extract(html, { variety: APPLE })
  assert.ok(r, JSON.stringify(r))
  assert.equal(r.price, 5.2)
  assert.equal(r.unit, 'CNY/kg')
  assert.equal(r.observedDate, '2026-04-20')
})

test('moa extractor: 单位为元/斤时归一化为元/公斤', () => {
  const html = `<title>2026年3月10日 周报</title>
    <p>苹果近期产地批发价 2.50 元/斤，处于偏强水平。</p>`
  const r = getExtractor('moa').extract(html, { variety: APPLE })
  assert.ok(r)
  assert.equal(r.price, 5.0)
})

test('pfsc extractor: 表格行抽取', () => {
  const html = `<table><tr><th>品种</th><th>价格</th><th>单位</th></tr>
    <tr><td>红富士苹果</td><td>5.30 元/公斤</td><td>kg</td></tr>
    <tr><td>黄大豆</td><td>4.80 元/公斤</td><td>kg</td></tr>
  </table>`
  const r = getExtractor('pfsc').extract(html, { variety: APPLE })
  assert.ok(r)
  assert.equal(r.price, 5.3)
})

test('pfsc extractor: 表格行兜底走通用正则', () => {
  const html = `<title>2026年5月1日</title>
    <p>本周红富士苹果价格 6.10 元/公斤。</p>`
  const r = getExtractor('pfsc').extract(html, { variety: APPLE })
  assert.ok(r)
  assert.equal(r.price, 6.1)
})

test('mofcom extractor: 周度评论正文抽取（窗口较大）', () => {
  const html = `<title>2026年4月3日 商务部商务预报</title>
    <p>本周食用农产品价格指数环比走低。其中，水果类继续小幅上行。
    红富士苹果在山东产地的批发价回升至 5.50 元/公斤，较上周上涨 1.8%。</p>`
  const r = getExtractor('mofcom').extract(html, { variety: APPLE })
  assert.ok(r)
  assert.equal(r.price, 5.5)
})

test('agri-cn extractor: 月度评论散落价格', () => {
  const html = `<title>2026年3月份农产品市场动态</title>
    <p>三月份国内大宗农产品市场总体平稳。
    苹果方面，主产区库存压力下，山东产地批发价小幅承压，月均 4.80 元/公斤；
    红富士主流价格区间 4.50-5.20 元/公斤。</p>`
  const r = getExtractor('agri-cn').extract(html, { variety: APPLE })
  assert.ok(r)
  // 通用正则会取最近的一个价格
  assert.ok(r.price === 4.8 || r.price === 4.5)
})

test('extractor: 品种不存在时返回 null', () => {
  const html = `<p>2026年4月 玉米批发价 2.80 元/公斤</p>`
  const r = getExtractor('moa').extract(html, { variety: APPLE })
  assert.equal(r, null)
})

test('extractor: HTML 太短时返回 null', () => {
  const r = getExtractor('moa').extract('<p>苹果</p>', { variety: APPLE })
  assert.equal(r, null)
})

test('extractor: 别名匹配（moa "苹果"）', () => {
  const html = `<title>2026年4月15日</title>
    <p>本周全国苹果批发价格 5.40 元/公斤。</p>`.repeat(3)
  const r = getExtractor('moa').extract(html, { variety: APPLE })
  assert.ok(r)
  assert.equal(r.price, 5.4)
})

test('extractor: 大豆别名 "黄豆"', () => {
  const html = `<title>2026年4月10日</title>
    <p>本月黄豆产地价 4.90 元/公斤。</p>`.repeat(3)
  const r = getExtractor('agri-cn').extract(html, { variety: SOYBEAN })
  assert.ok(r)
  assert.equal(r.price, 4.9)
})
