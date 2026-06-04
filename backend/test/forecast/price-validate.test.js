// Feature: market-price-forecast, Property 4 (价格合法性 + 拒绝路径)
// Validates: Requirement 1.6

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-pv-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'pv.sqlite')

const { initDb, initForecastDb } = require('../../lib/db')
test.before(() => {
  initDb()
  initForecastDb()
})

const { validatePrice, PRICE_MAX_INCLUSIVE } = require('../../lib/price-collector')

test('合法：正常正数', () => {
  assert.equal(validatePrice(5.2).ok, true)
  assert.equal(validatePrice(0.01).ok, true)
  assert.equal(validatePrice(PRICE_MAX_INCLUSIVE).ok, true)
})

test('非法：非数值', () => {
  for (const v of ['abc', null, undefined, NaN, '', 'eight']) {
    const r = validatePrice(v)
    assert.equal(r.ok, false, `should reject ${JSON.stringify(v)}`)
  }
})

test('非法：≤0', () => {
  for (const v of [0, -1, -100, -0.001]) {
    assert.equal(validatePrice(v).ok, false, `should reject ${v}`)
  }
})

test('非法：超过 1e6', () => {
  assert.equal(validatePrice(PRICE_MAX_INCLUSIVE + 1).ok, false)
  assert.equal(validatePrice(1e7).ok, false)
})
