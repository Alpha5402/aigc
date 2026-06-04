const DEFAULT_LIGHTRAG_BASE_URL = 'http://127.0.0.1:9621'

const normalizeBaseUrl = (value) => String(value || DEFAULT_LIGHTRAG_BASE_URL).replace(/\/+$/, '')

const withTimeout = async (promiseFactory, timeoutMs) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await promiseFactory(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

const safeString = (value) => String(value || '').trim()

const isNoContextResponse = (content) => {
  const text = safeString(content).toLowerCase()
  return [
    'no relevant context found',
    'no related context found',
    'no relevant information found',
    '[no-context]',
    '没有找到相关上下文',
    '未找到相关上下文',
    '没有相关上下文',
    '未检索到相关资料',
  ].some((marker) => text.includes(marker))
}

const isOffTopicResponse = (content) => {
  const text = safeString(content)
  return [
    '用户未指定具体作物',
    '用户未指定作物',
    '未指定具体作物和地区',
    '未指定作物和地区',
    '用户未提供具体作物',
    '没有指定具体作物',
    'user did not specify',
    'not specify a crop',
  ].some((marker) => text.toLowerCase().includes(marker.toLowerCase()))
}

const parseReferenceContent = (reference) => {
  if (!reference) return ''
  if (Array.isArray(reference.content)) return reference.content.join('\n')
  return safeString(reference.content)
}

const parseProducts = (content) => {
  const rawProducts = content.match(/产品[:：]\s*([^\n]+)/)?.[1] || ''
  if (!rawProducts || rawProducts === '未抽取') return []
  return rawProducts
    .split(/[、,，\s]+/)
    .map((item) => safeString(item))
    .filter(Boolean)
}

const extractSourceFromReference = (reference, index) => {
  const content = parseReferenceContent(reference)
  const filePath = safeString(reference.file_path || reference.filePath)
  const title = content.match(/标题[:：]\s*([^\n]+)/)?.[1] || filePath || `LightRAG资料${index + 1}`
  const sourceName = content.match(/来源[:：]\s*([^\n]+)/)?.[1] || 'LightRAG知识库'
  const sourceUrl = content.match(/链接[:：]\s*(https?:\/\/[^\s\n]+)/)?.[1] || ''
  const publishDate = content.match(/日期[:：]\s*([^\n]+)/)?.[1] || ''

  return {
    id: safeString(reference.reference_id || reference.id || filePath || `lightrag-${index + 1}`),
    title: safeString(title),
    sourceName: safeString(sourceName),
    sourceUrl: safeString(sourceUrl),
    publishDate: safeString(publishDate === '未标注' ? '' : publishDate),
    products: parseProducts(content),
  }
}

const referenceMatchesCrop = (references, crop) => {
  const cleanCrop = safeString(crop)
  if (!cleanCrop) return true
  return references.some((reference) => parseReferenceContent(reference).includes(cleanCrop))
}

const isAcceptableLightRagAnswer = ({ content, crop, references }) => {
  const cleanCrop = safeString(crop)
  if (!content || isNoContextResponse(content) || isOffTopicResponse(content)) return false
  if (!Array.isArray(references) || references.length === 0) return false
  if (!cleanCrop) return true
  return content.includes(cleanCrop) && referenceMatchesCrop(references, cleanCrop)
}

const buildLightRagQuery = ({ crop, region, question }) => {
  const cleanCrop = safeString(crop)
  const cleanRegion = safeString(region) || '未指定地区'
  const cleanQuestion = safeString(question) || `最近${cleanCrop || '该作物'}价格走势怎么样，适合出货吗？`

  return [
    `作物：${cleanCrop}`,
    `地区：${cleanRegion}`,
    `问题：${cleanQuestion}`,
    `请检索并总结与“${cleanCrop}”价格走势、批发价格、上涨下降、销售建议相关的农业行情资料。`,
    `回答必须围绕“${cleanCrop}”，不要写成其他品类的通用报告；资料不足时说明“数据不足，仅作参考”。`,
  ].join('\n')
}

const queryLightRagMarketReport = async ({ crop, region, question }) => {
  if (String(process.env.LIGHTRAG_ENABLED || 'false') !== 'true') return null

  const baseUrl = normalizeBaseUrl(process.env.LIGHTRAG_BASE_URL)
  const apiKey = safeString(process.env.LIGHTRAG_API_KEY)
  const timeoutMs = Number(process.env.LIGHTRAG_TIMEOUT_MS || 120000)
  const mode = safeString(process.env.LIGHTRAG_QUERY_MODE) || 'mix'
  const query = buildLightRagQuery({ crop, region, question })

  const response = await withTimeout(
    (signal) =>
      fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          query,
          mode,
          include_references: true,
          include_chunk_content: true,
          response_type: 'Multiple Paragraphs',
          top_k: Number(process.env.LIGHTRAG_TOP_K || 10),
          chunk_top_k: Number(process.env.LIGHTRAG_CHUNK_TOP_K || 8),
          enable_rerank: String(process.env.LIGHTRAG_ENABLE_RERANK || 'false') === 'true',
        }),
        signal,
      }),
    timeoutMs,
  )

  if (!response.ok) {
    throw new Error(`LightRAG HTTP ${response.status}`)
  }

  const payload = await response.json()
  const content = safeString(payload.response || payload.content)
  const references = Array.isArray(payload.references) ? payload.references : []
  if (!isAcceptableLightRagAnswer({ content, crop, references })) return null

  return {
    content,
    sources: references.map(extractSourceFromReference),
    rawReferences: references,
  }
}

const getLightRagStatus = async () => {
  if (String(process.env.LIGHTRAG_ENABLED || 'false') !== 'true') {
    return { enabled: false, healthy: false }
  }

  const baseUrl = normalizeBaseUrl(process.env.LIGHTRAG_BASE_URL)
  const apiKey = safeString(process.env.LIGHTRAG_API_KEY)
  const timeoutMs = Number(process.env.LIGHTRAG_HEALTH_TIMEOUT_MS || 3000)
  try {
    const response = await withTimeout(
      (signal) =>
        fetch(`${baseUrl}/health`, {
          headers: apiKey ? { 'X-API-Key': apiKey } : {},
          signal,
        }),
      timeoutMs,
    )
    let documentStatusCounts = null
    if (response.ok && apiKey) {
      try {
        const statusResponse = await withTimeout(
          (signal) =>
            fetch(`${baseUrl}/documents/status_counts`, {
              headers: { 'X-API-Key': apiKey },
              signal,
            }),
          timeoutMs,
        )
        if (statusResponse.ok) {
          const statusPayload = await statusResponse.json()
          documentStatusCounts = statusPayload.status_counts || null
        }
      } catch (_) {
        documentStatusCounts = null
      }
    }
    return {
      enabled: true,
      healthy: response.ok,
      status: response.status,
      baseUrl,
      documentStatusCounts,
    }
  } catch (error) {
    return {
      enabled: true,
      healthy: false,
      baseUrl,
      error: error.message,
    }
  }
}

module.exports = {
  queryLightRagMarketReport,
  getLightRagStatus,
}
