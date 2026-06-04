// backend/test/forecast/helpers/mock-pds-server.js
// 启动一个 in-process HTTP server 模拟 Public_Data_Source。
// 用于 e2e 与集成测试，不连接真实公网。

'use strict'

const http = require('node:http')

const FIXTURES = {
  // /moa/苹果 → 含 5.20 元/公斤
  '/moa/apple': `<html><head><title>2026年4月20日 农业农村部周报</title></head><body>
    <p>本周全国苹果（红富士）批发价格 5.20 元/公斤，环比上涨 1.2%。</p></body></html>`,
  '/moa/soybean': `<html><head><title>2026年4月20日</title></head><body>
    <p>本周全国大豆批发价格 4.80 元/公斤，保持平稳。</p></body></html>`,
  '/moa/corn': `<html><head><title>2026年4月20日</title></head><body>
    <p>本周全国玉米批发价格 2.45 元/公斤。</p></body></html>`,
  '/pfsc/apple': `<html><body><table>
    <tr><th>品种</th><th>价格</th></tr>
    <tr><td>红富士苹果</td><td>5.30 元/公斤</td></tr></table></body></html>`,
  '/pfsc/soybean': `<html><body><table>
    <tr><th>品种</th><th>价格</th></tr>
    <tr><td>黄大豆</td><td>4.85 元/公斤</td></tr></table></body></html>`,
  '/pfsc/corn': `<html><body><table>
    <tr><th>品种</th><th>价格</th></tr>
    <tr><td>黄玉米</td><td>2.50 元/公斤</td></tr></table></body></html>`,
  '/mofcom/apple': `<html><head><title>2026年4月3日 商务部商务预报</title></head><body>
    <p>本周食用农产品价格指数环比走低。其中，水果类继续小幅上行。
    红富士苹果在山东产地的批发价回升至 5.50 元/公斤，较上周上涨 1.8%。</p></body></html>`,
  '/agri-cn/apple': `<html><head><title>2026年4月15日</title></head><body>
    <p>三月份国内大宗农产品市场总体平稳。
    苹果方面，主产区库存压力下，山东产地批发价小幅承压，月均 4.80 元/公斤。</p></body></html>`,
  '/robots.txt': 'User-agent: *\nAllow: /\n',
}

const startMockPds = ({ port = 0 } = {}) => {
  const server = http.createServer((req, res) => {
    const path = req.url || '/'
    if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(FIXTURES['/robots.txt'])
      return
    }
    const body = FIXTURES[path]
    if (body) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(body)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address()
      const close = () =>
        new Promise((r) => server.close(() => r()))
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        close,
      })
    })
  })
}

module.exports = { startMockPds, FIXTURES }
