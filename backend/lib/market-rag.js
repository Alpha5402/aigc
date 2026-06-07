const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { TextDecoder } = require('node:util')
const { db, nowIso } = require('./db')

const DATA_DIR = path.join(__dirname, '..', 'data')
const JSONL_PATH = path.join(DATA_DIR, 'market_docs.jsonl')

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9',
}

const SEED_SOURCES = [
  {
    name: '中国农业农村信息网-最新发布',
    type: 'official_daily',
    listUrl: 'https://www.agri.cn/zx/zxfb/',
    baseUrl: 'https://www.agri.cn',
    keywords: ['农产品批发价格200指数', '菜篮子', '批发价格', '水果', '蔬菜', '猪肉', '牛肉', '羊肉', '鸡蛋', '水产品'],
    maxLinks: 20,
  },
  {
    name: '农业农村部市场与信息化司-监测预警',
    type: 'official_daily',
    listUrl: 'https://scs.moa.gov.cn/jcyj/',
    baseUrl: 'https://scs.moa.gov.cn',
    keywords: ['农产品批发价格200指数', '菜篮子', '批发市场', '价格'],
    maxLinks: 20,
  },
  {
    name: '商务部商务预报-食用农产品市场价格指数',
    type: 'official_weekly',
    listUrl: 'https://cif.mofcom.gov.cn/cif/listIndex.fhtml?nodeid=35249',
    baseUrl: 'https://cif.mofcom.gov.cn',
    keywords: ['食用农产品', '蔬菜', '粮油', '水果', '水产品', '肉类', '禽产品', '批发价格'],
    maxLinks: 20,
  },
  {
    name: '全国农产品批发市场价格信息系统',
    type: 'official_market',
    listUrl: 'https://pfsc.agri.cn/',
    baseUrl: 'https://pfsc.agri.cn',
    keywords: ['农产品', '批发价格', '价格行情', '价格指数', '监测报告'],
    maxLinks: 10,
  },
]

const TARGETED_ARTICLE_SOURCES = [
  {
    name: '中国农业农村信息网-国内外农产品市场动态',
    type: 'official_weekly_targeted',
    keywords: ['苹果', '水果', '大豆', '豆油', '大宗农产品', '农产品批发价格200指数', '菜篮子'],
    urls: [
      'https://www.agri.cn/sj/jcyj/202604/t20260414_8828088.htm',
      'https://www.agri.cn/sj/jcyj/202604/t20260409_8826692.htm',
      'https://www.agri.cn/sj/jcyj/202603/t20260331_8824216.htm',
      'https://www.agri.cn/sj/jcyj/202603/t20260325_8822375.htm',
      'https://www.agri.cn/sj/jcyj/202603/t20260317_8819754.htm',
      'https://www.agri.cn/sj/jcyj/202602/t20260227_8814888.htm',
      'https://www.agri.cn/sj/jcyj/202602/t20260210_8811573.htm',
      'https://www.agri.cn/sj/jcyj/202602/t20260204_8809557.htm',
      'https://www.agri.cn/sj/jcyj/202601/t20260127_8806853.htm',
      'https://www.agri.cn/sj/jcyj/202601/t20260120_8804186.htm',
      'https://www.agri.cn/sj/jcyj/202601/t20260113_8802475.htm',
      'https://www.agri.cn/sj/jcyj/202601/t20260106_8800746.htm',
    ],
  },
  {
    name: '商务部商务预报-地方食用农产品监测',
    type: 'official_local_weekly_targeted',
    keywords: ['苹果', '水果', '粮食', '粮油', '食用油', '食用农产品', '批发价格', '零售价格'],
    urls: [
      'https://cif.mofcom.gov.cn/newsite/html/hebei/html/974129/2026/3/27/1774585845585.html',
      'https://cif.mofcom.gov.cn/newsite/html/hebei/html/974129/2026/3/19/1773887099965.html',
      'https://cif.mofcom.gov.cn/newsite/html/hebei/html/974129/2026/3/16/1773627911369.html',
      'https://cif.mofcom.gov.cn/newsite/html/hebei/html/24448709/2026/2/28/1772266181151.html',
      'https://cif.mofcom.gov.cn/newsite/html/hebei/html/974129/2026/2/3/1770088314148.html',
      'https://cif.mofcom.gov.cn/newsite/html/hebei/html/974129/2026/1/20/1768871266268.html',
    ],
  },
]

const PRODUCT_CANDIDATES = [
  '苹果',
  '大豆',
  '玉米',
  '小麦',
  '水稻',
  '稻谷',
  '猪肉',
  '牛肉',
  '羊肉',
  '鸡蛋',
  '白条鸡',
  '蔬菜',
  '水果',
  '番茄',
  '黄瓜',
  '青椒',
  '菜花',
  '鲫鱼',
  '鲤鱼',
  '白鲢鱼',
  '大带鱼',
  '葡萄',
  '梨',
  '花生油',
  '大米',
  '面粉',
  '豆油',
  '菜籽油',
]

const GENERIC_QUERY_TERMS = new Set(['价格', '走势', '上涨', '下跌', '批发价格', '价格指数'])

const htmlEntities = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const sleepPolitely = async () => {
  await sleep(1200 + Math.floor(Math.random() * 1300))
}

const decodeHtmlEntities = (value) =>
  String(value || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x'
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return htmlEntities[entity] || match
  })

const stripTags = (html) =>
  decodeHtmlEntities(
    String(html || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )

const normalizeText = (value) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/分享到：.*/g, '')
    .replace(/微信“扫一扫”.*/g, '')
    .replace(/版权与免责声明.*/g, '')
    .trim()

const makeDocId = (url) => crypto.createHash('md5').update(String(url || '')).digest('hex')

const detectEncoding = (headers, buffer) => {
  const contentType = headers.get('content-type') || ''
  const charset = contentType.match(/charset=([^;\s]+)/i)?.[1]
  if (charset) return charset.toLowerCase()

  const head = buffer.toString('latin1', 0, Math.min(buffer.length, 4096))
  const metaCharset = head.match(/<meta[^>]+charset=["']?([^"'\s/>]+)/i)?.[1]
  if (metaCharset) return metaCharset.toLowerCase()
  return 'utf-8'
}

const decodeBuffer = (headers, buffer) => {
  const encoding = detectEncoding(headers, buffer)
  const candidates = [encoding, 'utf-8', 'gb18030', 'gbk']
  for (const candidate of candidates) {
    try {
      return new TextDecoder(candidate).decode(buffer)
    } catch (_error) {
      // Try the next decoder supported by the current Node runtime.
    }
  }
  return buffer.toString('utf8')
}

const fetchHtml = async (url) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await sleepPolitely()
    return decodeBuffer(response.headers, buffer)
  } finally {
    clearTimeout(timeout)
  }
}

const extractLinks = async (source) => {
  const html = await fetchHtml(source.listUrl)
  const links = []
  const seen = new Set()
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match = anchorPattern.exec(html)

  while (match) {
    const attrs = match[1] || ''
    const title = normalizeText(stripTags(match[2]))
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]

    if (title && href && !title.includes('首页') && source.keywords.some((keyword) => title.includes(keyword))) {
      const fullUrl = new URL(decodeHtmlEntities(href), source.listUrl).href
      const pathname = new URL(fullUrl).pathname
      if (!/\.(s?html?|fhtml)$/i.test(pathname)) {
        match = anchorPattern.exec(html)
        continue
      }
      if (!seen.has(fullUrl)) {
        seen.add(fullUrl)
        links.push({
          title,
          url: fullUrl,
          sourceName: source.name,
          sourceType: source.type,
        })
      }
    }

    if (links.length >= source.maxLinks) break
    match = anchorPattern.exec(html)
  }

  return links
}

const extractArticle = async (url) => {
  const html = await fetchHtml(url)
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const title = normalizeText(stripTags(h1 || titleTag || ''))
  const content = normalizeText(stripTags(html))
  const publishDate = content.match(/(20\d{2}[-年]\d{1,2}[-月]\d{1,2}[日]?)/)?.[1] || ''

  return { title, content, publishDate }
}

const extractMarketEntities = (text) => {
  const products = PRODUCT_CANDIDATES.filter((item) => text.includes(item))
  const prices = text.match(/\d+(?:\.\d+)?\s*元\/公斤/g) || []
  const rates = text.match(/[-+]?\d+(?:\.\d+)?%/g) || []
  const index200 = text.match(/农产品批发价格200指数[为是：:\s]*([0-9]+(?:\.[0-9]+)?)/)?.[1] || ''
  const basketIndex = text.match(/菜篮子.{0,20}?价格指数[为是：:\s]*([0-9]+(?:\.[0-9]+)?)/)?.[1] || ''

  return {
    products: [...new Set(products)].sort(),
    prices: prices.slice(0, 30),
    rates: rates.slice(0, 30),
    index200,
    basketIndex,
  }
}

const buildCropFocusedContent = (doc) => {
  const products = extractMarketEntities(doc.content).products.filter((item) => ['苹果', '大豆'].includes(item))
  if (!products.length) return []

  const sentences = doc.content
    .split(/(?<=[。！？；])/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
  const focusedDocs = []

  products.forEach((product) => {
    const related = sentences.filter((sentence) => sentence.includes(product) || (product === '苹果' && sentence.includes('水果')))
    if (!related.length) return

    const context = related.slice(0, 12).join(' ')
    focusedDocs.push({
      ...doc,
      title: `${product}专项行情摘录 - ${doc.title}`,
      sourceType: `${doc.sourceType}_crop_focus`,
      sourceUrl: `${doc.sourceUrl}#crop-${encodeURIComponent(product)}`,
      content: normalizeText(
        `作物：${product}。地区：全国及公开监测市场。来源文章：${doc.title}。发布日期：${doc.publishDate || '未标注'}。${context}`,
      ),
    })
  })

  return focusedDocs
}

const splitChunks = (text, maxLen = 800, overlap = 120) => {
  const normalized = normalizeText(text)
  if (normalized.length <= maxLen) return normalized ? [normalized] : []

  const chunks = []
  let start = 0
  while (start < normalized.length) {
    let chunk = normalized.slice(start, start + maxLen)
    const cut = Math.max(chunk.lastIndexOf('。'), chunk.lastIndexOf('；'), chunk.lastIndexOf('，'))
    if (cut > maxLen * 0.6) {
      chunk = chunk.slice(0, cut + 1)
    }
    if (chunk.trim().length > 80) chunks.push(chunk.trim())
    start += maxLen - overlap
  }
  return chunks
}

const appendJsonl = (item) => {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.appendFileSync(JSONL_PATH, `${JSON.stringify(item)}\n`, 'utf8')
}

const saveDocument = (doc) => {
  const docId = makeDocId(doc.sourceUrl)
  const entities = extractMarketEntities(doc.content)
  const chunks = splitChunks(doc.content)
  const now = nowIso()

  db.exec('BEGIN')
  try {
    db.prepare(
      `INSERT OR REPLACE INTO market_documents (
        id, title, source_name, source_type, source_url, publish_date, content,
        products_json, prices_json, rates_json, index_200, basket_index, crawled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      docId,
      doc.title,
      doc.sourceName,
      doc.sourceType,
      doc.sourceUrl,
      doc.publishDate || '',
      doc.content,
      JSON.stringify(entities.products),
      JSON.stringify(entities.prices),
      JSON.stringify(entities.rates),
      entities.index200,
      entities.basketIndex,
      now,
    )

    const oldChunks = db.prepare('SELECT id FROM market_chunks WHERE doc_id = ?').all(docId)
    oldChunks.forEach((row) => {
      db.prepare('DELETE FROM market_chunks_fts WHERE chunk_id = ?').run(row.id)
    })
    db.prepare('DELETE FROM market_chunks WHERE doc_id = ?').run(docId)

    chunks.forEach((chunk, index) => {
      const chunkId = `${docId}_${index}`
      db.prepare(
        `INSERT OR REPLACE INTO market_chunks (
          id, doc_id, chunk_index, title, source_name, source_type, source_url,
          publish_date, content, products_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        chunkId,
        docId,
        index,
        doc.title,
        doc.sourceName,
        doc.sourceType,
        doc.sourceUrl,
        doc.publishDate || '',
        chunk,
        JSON.stringify(entities.products),
        now,
      )

      db.prepare(
        `INSERT INTO market_chunks_fts (
          chunk_id, title, content, products, source_name
        ) VALUES (?, ?, ?, ?, ?)`,
      ).run(chunkId, doc.title, chunk, entities.products.join(' '), doc.sourceName)
    })

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  appendJsonl({
    id: docId,
    title: doc.title,
    source_name: doc.sourceName,
    source_type: doc.sourceType,
    source_url: doc.sourceUrl,
    publish_date: doc.publishDate || '',
    products: entities.products,
    prices: entities.prices,
    rates: entities.rates,
    index_200: entities.index200,
    basket_index: entities.basketIndex,
    content: doc.content,
    crawled_at: now,
  })

  return {
    docId,
    chunks: chunks.length,
    products: entities.products,
  }
}

const saveDocumentWithFocus = (doc) => {
  const saved = [saveDocument(doc)]
  buildCropFocusedContent(doc).forEach((focusedDoc) => {
    saved.push(saveDocument(focusedDoc))
  })
  return saved
}

const crawlAllMarketKb = async ({ logger = console.log } = {}) => {
  const stats = {
    totalDocs: 0,
    totalChunks: 0,
    sources: [],
    startedAt: nowIso(),
    finishedAt: '',
  }

  for (const source of SEED_SOURCES) {
    const sourceStat = {
      name: source.name,
      links: 0,
      saved: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    }
    stats.sources.push(sourceStat)
    logger(`\n[来源] ${source.name}`)

    let links = []
    try {
      links = await extractLinks(source)
      sourceStat.links = links.length
      logger(`  发现候选链接：${links.length}`)
    } catch (error) {
      sourceStat.errors.push(error.message)
      logger(`  获取栏目失败：${error.message}`)
      continue
    }

    for (const item of links) {
      try {
        const article = await extractArticle(item.url)
        if (article.content.length < 200) {
          sourceStat.skipped += 1
          logger(`  跳过过短文章：${item.title}`)
          continue
        }
        if (!source.keywords.some((keyword) => article.content.includes(keyword))) {
          sourceStat.skipped += 1
          logger(`  跳过弱相关文章：${item.title}`)
          continue
        }

        const savedResults = saveDocumentWithFocus({
          title: article.title || item.title,
          sourceName: item.sourceName,
          sourceType: item.sourceType,
          sourceUrl: item.url,
          publishDate: article.publishDate,
          content: article.content,
        })
        const chunks = savedResults.reduce((sum, result) => sum + result.chunks, 0)

        sourceStat.saved += 1
        stats.totalDocs += savedResults.length
        stats.totalChunks += chunks
        logger(`  入库：${(article.title || item.title).slice(0, 40)}... 文档=${savedResults.length} 切片=${chunks}`)
      } catch (error) {
        sourceStat.failed += 1
        sourceStat.errors.push(`${item.url} | ${error.message}`)
        logger(`  采集失败：${item.url} | ${error.message}`)
      }
    }
  }

  for (const source of TARGETED_ARTICLE_SOURCES) {
    const sourceStat = {
      name: source.name,
      links: source.urls.length,
      saved: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    }
    stats.sources.push(sourceStat)
    logger(`\n[定向来源] ${source.name}`)

    for (const url of source.urls) {
      try {
        const article = await extractArticle(url)
        if (article.content.length < 200) {
          sourceStat.skipped += 1
          logger(`  跳过过短文章：${url}`)
          continue
        }
        if (!source.keywords.some((keyword) => article.content.includes(keyword))) {
          sourceStat.skipped += 1
          logger(`  跳过弱相关文章：${article.title || url}`)
          continue
        }

        const savedResults = saveDocumentWithFocus({
          title: article.title || url,
          sourceName: source.name,
          sourceType: source.type,
          sourceUrl: url,
          publishDate: article.publishDate,
          content: article.content,
        })
        const chunks = savedResults.reduce((sum, result) => sum + result.chunks, 0)

        sourceStat.saved += 1
        stats.totalDocs += savedResults.length
        stats.totalChunks += chunks
        logger(`  入库：${(article.title || url).slice(0, 40)}... 文档=${savedResults.length} 切片=${chunks}`)
      } catch (error) {
        sourceStat.failed += 1
        sourceStat.errors.push(`${url} | ${error.message}`)
        logger(`  采集失败：${url} | ${error.message}`)
      }
    }
  }

  stats.finishedAt = nowIso()
  return stats
}

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value)
  } catch (_error) {
    return fallback
  }
}

const rowToSearchResult = (row) => ({
  id: row.id,
  title: row.title,
  sourceName: row.source_name,
  sourceType: row.source_type || '',
  sourceUrl: row.source_url,
  publishDate: row.publish_date || '',
  content: row.content,
  products: safeJsonParse(row.products_json || '[]', []),
  score: typeof row.score === 'number' ? row.score : 99,
})

const buildSearchTerms = (query) => {
  const clean = normalizeText(query).replace(/[^\p{L}\p{N}%./公斤元]+/gu, ' ')
  const terms = clean.split(/\s+/).filter((item) => item.length >= 2)
  PRODUCT_CANDIDATES.forEach((product) => {
    if (query.includes(product)) terms.push(product)
  })
  ;['菜篮子', '农产品批发价格200指数', '批发价格', '价格指数', '上涨', '下跌', '走势'].forEach((term) => {
    if (query.includes(term)) terms.push(term)
  })
  return [...new Set(terms)].slice(0, 8)
}

const escapeFtsTerm = (term) => `"${String(term).replace(/"/g, '""')}"`

const getQueryProducts = (query) => PRODUCT_CANDIDATES.filter((product) => query.includes(product))

const toDateTime = (value) => {
  const normalized = String(value || '').replace(/[年月]/g, '-').replace(/日/g, '')
  const timestamp = new Date(normalized).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

const rankSearchResult = (item, queryProducts, queryTerms) => {
  let score = 0
  const content = `${item.title} ${item.content} ${(item.products || []).join(' ')}`

  queryProducts.forEach((product) => {
    if ((item.products || []).includes(product)) score += 120
    if (item.title.includes(product)) score += 80
    if (item.content.includes(product)) score += 60
    if (product === '苹果' && item.content.includes('水果')) score += 18
    if (product === '大豆' && (item.content.includes('豆油') || item.content.includes('大宗农产品'))) score += 18
  })

  queryTerms.forEach((term) => {
    if (GENERIC_QUERY_TERMS.has(term)) return
    if (content.includes(term)) score += 8
  })

  if (item.sourceType?.includes('crop_focus') || item.sourceUrl.includes('#crop-')) score += 50
  if (item.sourceName.includes('农业农村') || item.sourceName.includes('商务部')) score += 10
  score += Math.min(20, toDateTime(item.publishDate) / 100000000000)

  return score
}

const searchMarketKb = (query, limit = 6) => {
  const terms = buildSearchTerms(query)
  const safeLimit = Math.max(1, Math.min(Number(limit) || 6, 20))
  const queryProducts = getQueryProducts(query)
  const candidateMap = new Map()
  const searchLimit = Math.max(40, safeLimit * 8)

  if (terms.length) {
    try {
      const ftsQuery = terms.map(escapeFtsTerm).join(' OR ')
      const rows = db
        .prepare(
          `SELECT
            c.id,
            c.title,
            c.source_name,
            c.source_url,
            c.publish_date,
            c.content,
            c.products_json,
            c.source_type,
            bm25(market_chunks_fts) AS score
          FROM market_chunks_fts
          JOIN market_chunks c ON market_chunks_fts.chunk_id = c.id
          WHERE market_chunks_fts MATCH ?
          ORDER BY score
          LIMIT ?`,
        )
        .all(ftsQuery, searchLimit)

      rows.forEach((row) => {
        candidateMap.set(row.id, rowToSearchResult(row))
      })
    } catch (_error) {
      // Fall back to LIKE search below when the local SQLite FTS tokenizer rejects a query.
    }
  }

  if (terms.length) {
    const likeClauses = terms.map(() => '(title LIKE ? OR content LIKE ? OR products_json LIKE ?)')
    const params = terms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`])
    const rows = db
      .prepare(
        `SELECT
          id,
          title,
          source_name,
          source_url,
          publish_date,
          content,
          products_json,
          source_type,
          99 AS score
        FROM market_chunks
        WHERE ${likeClauses.join(' OR ')}
        ORDER BY publish_date DESC, created_at DESC
        LIMIT ?`,
      )
      .all(...params, searchLimit)

    rows.forEach((row) => {
      candidateMap.set(row.id, rowToSearchResult(row))
    })
  }

  return [...candidateMap.values()]
    .map((item) => ({
      ...item,
      rank: rankSearchResult(item, queryProducts, terms),
    }))
    .filter((item) => !queryProducts.length || item.rank > 0)
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank
      return toDateTime(b.publishDate) - toDateTime(a.publishDate)
    })
    .slice(0, safeLimit)
}

const buildMarketRagContext = (query, limit = 6) =>
  searchMarketKb(query, limit)
    .map(
      (item, index) =>
        `【资料${index + 1}】\n标题：${item.title}\n来源：${item.sourceName}\n日期：${item.publishDate || '未标注'}\n链接：${
          item.sourceUrl
        }\n内容：${item.content.slice(0, 700)}`,
    )
    .join('\n\n')

const buildMarketReportPrompt = ({ crop, region, question, retrievedContext }) => `你是农业行情分析助手。请基于以下检索资料，生成作物行情预期报告。

要求：
1. 不要编造资料中没有出现的价格和结论。
2. 报告需要包含：行情概况、价格变化、影响因素、未来预期、销售建议、风险提示。
3. 如果资料不足，要明确说明“数据不足，仅作参考”。
4. 输出中文，语气专业，适合农户阅读。
5. 价格单位保持原文单位，例如元/公斤。

用户关注作物：${crop || '未指定'}
用户所在地区：${region || '未指定'}
用户问题：${question || '请分析近期价格走势'}

检索资料：
${retrievedContext || '暂无可用检索资料'}

请生成报告：`

const extractEvidenceSnippets = (results, crop) => {
  const snippets = []
  const evidencePattern = /(价格|批发|零售|上涨|下降|环比|同比|周均价|元\/公斤|美元|指数|持平)/

  results.forEach((item) => {
    const sentences = item.content
      .split(/(?<=[。！？；])/)
      .map((sentence) => normalizeText(sentence))
      .filter((sentence) => sentence && !sentence.startsWith('来源文章：') && !sentence.startsWith('发布日期：'))

    const matched = sentences.find(
      (sentence) =>
        (sentence.includes(crop) || (crop === '苹果' && sentence.includes('水果')) || (crop === '大豆' && sentence.includes('豆'))) &&
        evidencePattern.test(sentence),
    )

    if (matched && !snippets.some((snippet) => snippet.text === matched)) {
      snippets.push({
        text: matched,
        source: item.sourceName,
        date: item.publishDate || '未标注日期',
      })
    }
  })

  return snippets.slice(0, 4)
}

const buildFallbackMarketReport = ({ crop, region, question, results }) => {
  const sourceLines = results
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${item.title}（${item.sourceName}${item.publishDate ? `，${item.publishDate}` : ''}）`)
    .join('\n')
  const hasData = results.length > 0
  const evidenceSnippets = extractEvidenceSnippets(results, crop || '')
  const evidenceText = evidenceSnippets
    .map((item, index) => `${index + 1}. ${item.text}（${item.source}，${item.date}）`)
    .join('\n')

  return `【行情概况】
${hasData ? `已检索到 ${results.length} 条可参考的公开行情资料，以下结论基于资料摘录和本地行情知识库整理。` : `当前可用公开行情资料不足以支撑对“${crop}”的精确价格判断。`}${
    region ? `地区关注点为${region}。` : ''
  }

【价格变化】
${evidenceText || (hasData ? '已检索到可参考资料，但未抽取到足够清晰的作物价格句；报告不新增编造价格。' : '暂未检索到足够的直接成交价、价格指数或涨跌幅数据。')}

建议把当地实时询价作为主依据，重点观察近3天询价变化、同类农产品价格和批发市场走货速度。

【影响因素】
影响${crop || '该作物'}销售的主要因素包括产地供应量、客商采购积极性、天气与运输成本、节假日消费需求，以及周边同类产品价格变化。${question ? `你的问题是：${question}` : ''}

【未来预期】
在资料不足的情况下，短期更适合按“稳健偏谨慎”处理：若询价连续走弱，应优先锁定确定订单；若询价稳定且走货顺畅，可保留部分货源继续观察。

【销售建议】
建议采用分批出货策略：先小批量试探成交价，再对比周边市场和采购商报价。若当前报价达到心理价位，可先出售30%-50%，剩余部分根据后续询价变化调整。

【风险提示】
本报告用于辅助判断，不替代真实成交价。最终出货决策应以当地市场实时询价、采购合同和运输损耗核算为准。

【参考来源】
${sourceLines || '暂无来源'}`.trim()
}

const saveMarketReport = ({ userId, crop, region, question, reportText, sources, provider }) => {
  const result = db
    .prepare(
      `INSERT INTO market_reports (
        user_id, crop_name, region, question, report_text, retrieved_sources_json, provider, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId || null,
      String(crop || ''),
      String(region || ''),
      String(question || ''),
      reportText,
      JSON.stringify(sources || []),
      provider,
      nowIso(),
    )

  return result.lastInsertRowid
}

const getMarketKbStats = () => ({
  documents: db.prepare('SELECT COUNT(*) AS count FROM market_documents').get().count,
  chunks: db.prepare('SELECT COUNT(*) AS count FROM market_chunks').get().count,
  reports: db.prepare('SELECT COUNT(*) AS count FROM market_reports').get().count,
  lastCrawledAt: db.prepare('SELECT MAX(crawled_at) AS value FROM market_documents').get().value || '',
})

module.exports = {
  SEED_SOURCES,
  TARGETED_ARTICLE_SOURCES,
  JSONL_PATH,
  crawlAllMarketKb,
  searchMarketKb,
  buildMarketRagContext,
  buildMarketReportPrompt,
  buildFallbackMarketReport,
  saveMarketReport,
  getMarketKbStats,
}
