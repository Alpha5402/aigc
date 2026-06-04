const fs = require('node:fs')
const path = require('node:path')

const parseEnvLine = (line) => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const equalsIndex = trimmed.indexOf('=')
  if (equalsIndex <= 0) return null

  const key = trimmed.slice(0, equalsIndex).trim()
  let value = trimmed.slice(equalsIndex + 1).trim()

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return [key, value]
}

const loadEnv = (envPath = path.join(__dirname, '..', '.env')) => {
  if (!fs.existsSync(envPath)) return

  const content = fs.readFileSync(envPath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const parsed = parseEnvLine(line)
    if (!parsed) return
    const [key, value] = parsed
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  })
}

module.exports = { loadEnv }
