const { initDb } = require('../backend/lib/db')
const { crawlAllMarketKb, getMarketKbStats } = require('../backend/lib/market-rag')

const main = async () => {
  initDb()
  const stats = await crawlAllMarketKb()
  console.log('\n初始化完成')
  console.log(JSON.stringify({ ...stats, kb: getMarketKbStats() }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
