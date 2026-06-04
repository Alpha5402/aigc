// Feature: market-price-forecast, Task 4.1.2
// 调度器锁的基本契约：单进程内自我可重入；过期后自动可被抢占。

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-lock-'))
process.env.SQLITE_PATH = path.join(tmpDir, 'lock.sqlite')

const { initDb, initForecastDb } = require('../../lib/db')
const lock = require('../../lib/scheduler-lock')

test.before(() => {
  initDb()
  initForecastDb()
  lock.forceReleaseLock()
})

test.beforeEach(() => lock.forceReleaseLock())

test('acquireLock: 首次获取成功', () => {
  assert.equal(lock.acquireLock('task_a', 60), true)
  const row = lock.inspectLock('task_a')
  assert.ok(row)
  assert.ok(row.expire_at > Date.now())
})

test('acquireLock: 同进程重入成功（owner 相同）', () => {
  assert.equal(lock.acquireLock('task_b', 60), true)
  // 同进程允许刷新自己持有的锁
  assert.equal(lock.acquireLock('task_b', 120), true)
})

test('acquireLock: 过期锁可被抢占', () => {
  // 写一个已过期的锁
  const { db } = require('../../lib/db')
  db.prepare('INSERT INTO scheduler_locks (task_name, owner_id, expire_at) VALUES (?, ?, ?)').run(
    'task_c',
    'other-process',
    Date.now() - 1000,
  )
  assert.equal(lock.acquireLock('task_c', 60), true)
})

test('releaseLock: 仅当本进程持有时才释放', () => {
  assert.equal(lock.acquireLock('task_d', 60), true)
  lock.releaseLock('task_d')
  assert.equal(lock.inspectLock('task_d'), undefined)

  // 别人持有的锁不会被本进程 release
  const { db } = require('../../lib/db')
  db.prepare('INSERT INTO scheduler_locks (task_name, owner_id, expire_at) VALUES (?, ?, ?)').run(
    'task_e',
    'other-process',
    Date.now() + 60_000,
  )
  lock.releaseLock('task_e')
  assert.ok(lock.inspectLock('task_e'))
})
