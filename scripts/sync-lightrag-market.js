const fs = require('node:fs')
const path = require('node:path')
const { db, initDb } = require('../backend/lib/db')

const DEFAULT_LIGHTRAG_BASE_URL = 'http://127.0.0.1:9621'

const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = {
    limit: Number(process.env.LIGHTRAG_SYNC_LIMIT || 0),
    batchSize: Number(process.env.LIGHTRAG_SYNC_BATCH_SIZE || 8),
    dryRun: false,
  }

  args.forEach((arg, index) => {
    if (arg === '--dry-run') options.dryRun = true
    if (arg === '--limit') options.limit = Number(args[index + 1] || 0)
    if (arg.startsWith('--limit=')) options.limit = Number(arg.split('=')[1] || 0)
    if (arg === '--batch-size') options.batchSize = Number(args[index + 1] || 8)
    if (arg.startsWith('--batch-size=')) options.batchSize = Number(arg.split('=')[1] || 8)
  })

  options.batchSize = Math.max(1, Math.min(options.batchSize || 8, 20))
  return options
}

const normalizeText = (value) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value)
  } catch (_error) {
    return fallback
  }
}

const splitSentences = (text) => {
  const normalized = normalizeText(text)
  const matches = normalized.match(/[^。！？；;!?]+[。！？；;!?]?/g) || []
  return matches.map((item) => normalizeText(item)).filter(Boolean)
}

const chunkText = (text, { maxChars = 1200, minChars = 260, overlapSentences = 2 } = {}) => {
  const sentences = splitSentences(text)
  if (!sentences.length) return []

  const chunks = []
  let current = []
  let currentLen = 0

  const flush = () => {
    if (!current.length) return
    const content = normalizeText(current.join(' '))
    if (content.length >= minChars || !chunks.length) chunks.push(content)
    current = current.slice(-overlapSentences)
    currentLen = current.join(' ').length
  }

  sentences.forEach((sentence) => {
    const nextLen = currentLen + sentence.length + 1
    if (current.length && nextLen > maxChars) flush()
    current.push(sentence)
    currentLen += sentence.length + 1
  })
  flush()

  return chunks.filter((item) => item.length >= 80)
}

const buildLightRagDocuments = (row) => {
  const products = safeJsonParse(row.products_json || '[]', [])
  const chunks = chunkText(row.content)

  return chunks.map((chunk, index) => ({
    text: [
      `标题：${row.title}`,
      `来源：${row.source_name}`,
      `类型：${row.source_type}`,
      `日期：${row.publish_date || '未标注'}`,
      `链接：${row.source_url}`,
      `产品：${products.join('、') || '未抽取'}`,
      `正文：${chunk}`,
    ].join('\n'),
    fileSource: `market/${row.id}-${String(index + 1).padStart(3, '0')}.txt`,
  }))
}

const readJsonlFallbackRows = (limit) => {
  const jsonlPath = process.env.MARKET_DOCS_JSONL || path.join(__dirname, '..', 'backend', 'data', 'market_docs.jsonl')
  if (!fs.existsSync(jsonlPath)) return []

  const rows = fs
    .readFileSync(jsonlPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => safeJsonParse(line, null))
    .filter(Boolean)
    .map((item) => ({
      id: item.id,
      title: item.title || '',
      source_name: item.source_name || item.sourceName || '',
      source_type: item.source_type || item.sourceType || 'jsonl',
      source_url: item.source_url || item.sourceUrl || '',
      publish_date: item.publish_date || item.publishDate || '',
      content: item.content || '',
      products_json: JSON.stringify(item.products || []),
    }))
    .filter((item) => item.id && item.content)

  return rows.slice(0, limit > 0 ? limit : undefined)
}

const postJson = async (url, payload, apiKey) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch (_error) {
    body = text
  }

  if (!response.ok) {
    const detail = typeof body === 'object' && body ? body.detail || body.message : body
    throw new Error(`HTTP ${response.status}: ${detail || 'LightRAG request failed'}`)
  }

  return body
}

const syncBatch = async ({ baseUrl, apiKey, batch, batchIndex }) => {
  const payload = {
    texts: batch.map((item) => item.text),
    file_sources: batch.map((item) => item.fileSource),
  }

  const result = await postJson(`${baseUrl}/documents/texts`, payload, apiKey)
  console.log(
    `[lightrag-sync] batch=${batchIndex} docs=${batch.length} status=${result?.status || 'ok'} track_id=${
      result?.track_id || ''
    }`,
  )
}

const main = async () => {
  const options = parseArgs()
  const baseUrl = String(process.env.LIGHTRAG_BASE_URL || DEFAULT_LIGHTRAG_BASE_URL).replace(/\/+$/, '')
  const apiKey = String(process.env.LIGHTRAG_API_KEY || '').trim()

  initDb()

  let rows = db
    .prepare(
      `SELECT id, title, source_name, source_type, source_url, publish_date, content, products_json
       FROM market_documents
       ORDER BY publish_date DESC, crawled_at DESC`,
    )
    .all()
    .slice(0, options.limit > 0 ? options.limit : undefined)

  if (!rows.length) {
    rows = readJsonlFallbackRows(options.limit)
  }

  const documents = rows.flatMap(buildLightRagDocuments)
  console.log(`[lightrag-sync] market_docs=${rows.length} chunks=${documents.length} base_url=${baseUrl}`)

  if (options.dryRun) {
    documents.slice(0, 3).forEach((item, index) => {
      console.log(`\n--- chunk ${index + 1}: ${item.fileSource} ---`)
      console.log(item.text.slice(0, 700))
    })
    return
  }

  for (let start = 0, batchIndex = 1; start < documents.length; start += options.batchSize, batchIndex += 1) {
    await syncBatch({
      baseUrl,
      apiKey,
      batch: documents.slice(start, start + options.batchSize),
      batchIndex,
    })
  }
}

main().catch((error) => {
  console.error(`[lightrag-sync] failed: ${error.message}`)
  process.exitCode = 1
})
