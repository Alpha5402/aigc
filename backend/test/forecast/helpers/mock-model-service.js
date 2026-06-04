// backend/test/forecast/helpers/mock-model-service.js
// 模拟 Model_Service：校验 HMAC 后返回固定预测结果。
// 支持环境变量 MOCK_MS_MODE ∈ 'ok' | 'timeout' | '5xx' | 'invalid_monotonic'

'use strict'

const http = require('node:http')
const { verifyRequest } = require('../../../lib/forecast-signer')

const buildOkResponse = ({ requestId, spuId, horizonDays }) => {
  const make = (base) => Array.from({ length: horizonDays }, (_, i) => Number((base + i * 0.01).toFixed(4)))
  const point = make(5.0)
  return {
    request_id: requestId,
    spu_id: spuId,
    horizon_days: horizonDays,
    models: [
      {
        family: 'arima',
        version: 'mock-v1',
        status: 'success',
        point_estimates: point,
        ci80_lower: point.map((p) => p - 0.20),
        ci80_upper: point.map((p) => p + 0.20),
        ci95_lower: point.map((p) => p - 0.40),
        ci95_upper: point.map((p) => p + 0.40),
        inference_ms: 12,
      },
      {
        family: 'holt_winters',
        version: 'mock-v1',
        status: 'success',
        point_estimates: point.map((p) => p + 0.05),
        ci80_lower: point.map((p) => p + 0.05 - 0.18),
        ci80_upper: point.map((p) => p + 0.05 + 0.18),
        ci95_lower: point.map((p) => p + 0.05 - 0.36),
        ci95_upper: point.map((p) => p + 0.05 + 0.36),
        inference_ms: 8,
      },
    ],
    total_inference_ms: 25,
  }
}

const buildInvalidMonotonic = ({ requestId, spuId, horizonDays }) => {
  const point = Array.from({ length: horizonDays }, () => 5.0)
  // ci80Lower > point ⇒ 单调性失败
  return {
    request_id: requestId,
    spu_id: spuId,
    horizon_days: horizonDays,
    models: [
      {
        family: 'arima',
        version: 'mock-v1',
        status: 'success',
        point_estimates: point,
        ci80_lower: point.map((p) => p + 1),
        ci80_upper: point.map((p) => p + 2),
        ci95_lower: point.map((p) => p - 1),
        ci95_upper: point.map((p) => p + 3),
        inference_ms: 7,
      },
    ],
    total_inference_ms: 7,
  }
}

const startMockModelService = async ({ port = 0, secret = '', mode = 'ok' } = {}) => {
  if (!secret) throw new Error('mock-model-service requires shared secret')
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', loaded_families: ['arima', 'holt_winters'] }))
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', async () => {
      const headers = req.headers
      const verify = verifyRequest({
        method: req.method,
        path: req.url,
        body,
        headers,
        secret,
      })
      if (!verify.ok) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: verify.reason }))
        return
      }
      let parsed
      try {
        parsed = JSON.parse(body)
      } catch (_e) {
        res.writeHead(400)
        res.end('bad json')
        return
      }

      if (mode === 'timeout') {
        // 不响应，让 Forecast_Engine 触发 30s 超时（但测试里设短一点）
        return
      }
      if (mode === '5xx') {
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'upstream_failure' }))
        return
      }
      const payload =
        mode === 'invalid_monotonic'
          ? buildInvalidMonotonic({
              requestId: parsed.request_id,
              spuId: parsed.spu_id,
              horizonDays: Number(parsed.horizon_days),
            })
          : buildOkResponse({
              requestId: parsed.request_id,
              spuId: parsed.spu_id,
              horizonDays: Number(parsed.horizon_days),
            })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    })
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address()
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

module.exports = { startMockModelService }
