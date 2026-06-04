const { initDb } = require('../backend/lib/db')
const { searchMarketKb } = require('../backend/lib/market-rag')

initDb()

const query = process.argv.slice(2).join(' ') || '苹果 水果 价格 上涨'
const results = searchMarketKb(query, 6)

if (!results.length) {
  console.log('未检索到相关行情资料。请先运行：node scripts/init-market-kb.js')
  process.exit(0)
}

results.forEach((item, index) => {
  console.log(`\n【资料${index + 1}】`)
  console.log(`标题：${item.title}`)
  console.log(`来源：${item.sourceName}`)
  console.log(`日期：${item.publishDate || '未标注'}`)
  console.log(`链接：${item.sourceUrl}`)
  console.log(`内容：${item.content.slice(0, 320)}...`)
})
