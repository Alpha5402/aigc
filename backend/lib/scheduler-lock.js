// backend/lib/scheduler-lock.js
// market-price-forecast Phase 1, Task 4.1.1
// 关联：design.md §14.2
//
// 用 scheduler_locks 表 + UNIQUE 主键 + TTL 比较实现进程间分布式锁。
// 当前部署是单进程 PM2，主要为未来横向扩展预留。

'use strict'

const crypto = require('node:crypto')
const { db } = require('./db')

const PROCESS_OWNER_ID = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`

// 尝试获取锁。返回 true 表示获取成功，调用方持有 ttl 秒。
// 实现：UPSERT；只有当 task_name 不存在或既有锁过期时才认为获取成功。
const acquireLock = (taskName, ttlSeconds) => {
  const ttl = Math.max(1, Number(ttlSeconds) || 1)
  const expireAt = Date.now() + ttl * 1000

  // node:sqlite DatabaseSync 不暴露 db.transaction() 函数，使用裸 BEGIN/COMMIT 代替
  db.exec('BEGIN IMMEDIATE')
  try {
    const row = db
      .prepare('SELECT owner_id, expire_at FROM scheduler_locks WHERE task_name = ?')
      .get(taskName)
    if (row && row.expire_at > Date.now() && row.owner_id !== PROCESS_OWNER_ID) {
      db.exec('ROLLBACK')
      return false
    }
    db.prepare(
      `INSERT INTO scheduler_locks (task_name, owner_id, expire_at)
       VALUES (?, ?, ?)
       ON CONFLICT(task_name) DO UPDATE SET
         owner_id = excluded.owner_id,
         expire_at = excluded.expire_at`,
    ).run(taskName, PROCESS_OWNER_ID, expireAt)
    db.exec('COMMIT')
    return true
  } catch (e) {
    try {
      db.exec('ROLLBACK')
    } catch (_e2) {
      // ignore
    }
    throw e
  }
}

// 主动释放锁（仅当本进程持有时才删）
const releaseLock = (taskName) => {
  db.prepare('DELETE FROM scheduler_locks WHERE task_name = ? AND owner_id = ?').run(
    taskName,
    PROCESS_OWNER_ID,
  )
}

// 测试 / 运营用：强制释放
const forceReleaseLock = (taskName) => {
  if (taskName) {
    db.prepare('DELETE FROM scheduler_locks WHERE task_name = ?').run(taskName)
  } else {
    db.prepare('DELETE FROM scheduler_locks').run()
  }
}

const inspectLock = (taskName) =>
  db.prepare('SELECT task_name, owner_id, expire_at FROM scheduler_locks WHERE task_name = ?').get(
    taskName,
  )

module.exports = {
  PROCESS_OWNER_ID,
  acquireLock,
  releaseLock,
  forceReleaseLock,
  inspectLock,
}
