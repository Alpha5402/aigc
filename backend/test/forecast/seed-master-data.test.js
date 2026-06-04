// Feature: market-price-forecast, Task 1.2.1
// 验证 seed 脚本幂等地写入 origins / varieties / variety_aliases / grades / units / spu_tuples。

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-seed-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'seed.sqlite')

const seed = require('../../scripts/seed-master-data')
const { db } = require('../../lib/db')

test.before(() => {
  // 第一次跑：建表 + 写数据
  seed.main()
})

test('seed: origins/varieties/grades/units 行数符合预期', () => {
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM origins').get().c, 3)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM varieties').get().c, 3)
  assert.ok(db.prepare('SELECT COUNT(*) AS c FROM grades').get().c >= 3)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM units').get().c, 2)
})

test('seed: variety_aliases 至少 12 条（3 品种 × 4 来源）', () => {
  const c = db.prepare('SELECT COUNT(*) AS c FROM variety_aliases').get().c
  assert.ok(c >= 12, `aliases=${c}`)
})

test('seed: spu_tuples 写入 3 个，spu_id 长度合理', () => {
  const rows = db.prepare("SELECT spu_id FROM spu_tuples WHERE status='active'").all()
  assert.equal(rows.length, 3)
  for (const r of rows) {
    assert.ok(r.spu_id.startsWith('spu_'))
    assert.ok(r.spu_id.length >= 16 && r.spu_id.length <= 64, `len=${r.spu_id.length}`)
  }
})

test('seed 幂等: 再跑一次行数不变', () => {
  const before = db.prepare('SELECT COUNT(*) AS c FROM spu_tuples').get().c
  seed.main()
  const after = db.prepare('SELECT COUNT(*) AS c FROM spu_tuples').get().c
  assert.equal(before, after)
})
