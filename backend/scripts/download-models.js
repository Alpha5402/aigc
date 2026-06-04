// backend/scripts/download-models.js
'use strict'

require('dotenv').config()
const fs = require('node:fs')
const path = require('node:path')
const { loadHistory } = require('../lib/forecast-engine')
const { signRequest, generateRequestId } = require('../lib/forecast-signer')
const { db } = require('../lib/db')

const MS_TIMEOUT_MS = Number(process.env.MODEL_SERVICE_TIMEOUT_MS || 60_000)
const MS_BASE_URL = process.env.MODEL_SERVICE_BASE_URL || 'http://127.0.0.1:8000'
const MS_SHARED_SECRET = process.env.MODEL_SERVICE_SHARED_SECRET || ''

const MODELS_DIR = path.join(__dirname, '../models')
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true })
}

async function trainAndDownload(spuId) {
  const history = loadHistory(spuId)
  if (history.values.length < 62) {
    console.log(`[Skip] SPU ${spuId} has insufficient data (${history.values.length} days). Need 62.`)
    return
  }

  const requestId = generateRequestId()
  const reqPath = '/train_and_export'
  const body = JSON.stringify({
    request_id: requestId,
    spu_id: spuId,
    horizon_days: 7,
    families: ['dlinear'],
    history: {
      dates: history.dates,
      values: history.values,
      missing_mask: history.missingMask,
      forward_filled_values: history.forwardFilledValues,
    },
  })

  const { headers } = signRequest({
    method: 'POST',
    path: reqPath,
    body,
    secret: MS_SHARED_SECRET,
    requestId,
  })

  const url = `${MS_BASE_URL.replace(/\/$/, '')}${reqPath}`
  console.log(`[Train] Triggering GPU training for SPU ${spuId}...`)
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })

  if (!resp.ok) {
    throw new Error(`Training failed: ${resp.status} ${await resp.text()}`)
  }

  const data = await resp.json()
  if (data.status !== 'success' || !data.download_url) {
    throw new Error(`Invalid response: ${JSON.stringify(data)}`)
  }

  console.log(`[Download] Model trained. Downloading from ${data.download_url}...`)
  const dlUrl = `${MS_BASE_URL.replace(/\/$/, '')}${data.download_url}`
  const dlResp = await fetch(dlUrl)
  if (!dlResp.ok) {
    throw new Error(`Download failed: ${dlResp.status}`)
  }

  const arrayBuffer = await dlResp.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  
  const filename = path.basename(data.download_url)
  const filePath = path.join(MODELS_DIR, filename)
  fs.writeFileSync(filePath, buffer)
  console.log(`[Done] Saved to ${filePath}`)
}

async function run() {
  if (!MS_SHARED_SECRET) {
    console.error('MODEL_SERVICE_SHARED_SECRET is not set.')
    process.exit(1)
  }

  const spus = db.prepare(`SELECT spu_id FROM spu_tuples WHERE status = 'active'`).all()
  for (const spu of spus) {
    try {
      await trainAndDownload(spu.spu_id)
    } catch (e) {
      console.error(`[Error] SPU ${spu.spu_id}:`, e.message)
    }
  }
}

if (require.main === module) {
  run().catch(console.error)
}
