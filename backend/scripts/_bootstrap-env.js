// backend/scripts/_bootstrap-env.js
// 让脚本既可以从仓库根（npm run market:seed）也可以从 backend 子目录运行。
// 提前加载 backend/.env（如果存在）；不强求依赖。

'use strict'

const path = require('node:path')
const fs = require('node:fs')

const candidates = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '.env'),
]

for (const file of candidates) {
  if (!fs.existsSync(file)) continue
  try {
    const text = fs.readFileSync(file, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim()
      if (k && !(k in process.env)) {
        process.env[k] = v
      }
    }
    break
  } catch (_e) {
    // ignore
  }
}
