const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const sharp = require('sharp')
const { loadEnv } = require('./lib/env')

loadEnv()

const { db, initDb, initForecastDb, nowIso, resetDemoData, ensureColumn } = require('./lib/db')
const jwt = require('./lib/jwt')
const {
  mockCrops,
  mockTasks,
  mockWeather,
  adTemplates,
  farmProfile,
  marketOverview,
  buyerOverview,
} = require('./lib/mock-data')
const {
  crawlAllMarketKb,
  searchMarketKb,
  buildMarketReportPrompt,
  buildFallbackMarketReport,
  saveMarketReport,
  getMarketKbStats,
} = require('./lib/market-rag')
const { queryLightRagMarketReport, getLightRagStatus } = require('./lib/lightrag-client')
const { readLatestActive, forecastOne } = require('./lib/forecast-engine')
const adminRoutes = require('./routes/admin.routes')

const app = express()
const PORT = Number(process.env.PORT || 3000)
const JWT_SECRET = process.env.JWT_SECRET || 'agricloud-demo-change-me'
const ACCESS_TOKEN_TTL = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 24 * 60 * 60)
const REFRESH_TOKEN_TTL = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 7 * 24 * 60 * 60)
const AMAP_WEB_SERVICE_KEY = String(process.env.AMAP_WEB_SERVICE_KEY || process.env.AMAP_JS_API_KEY || '').trim()
const AMAP_DEFAULT_ADCODE = String(process.env.AMAP_DEFAULT_ADCODE || '370602').trim()
const WEATHER_CACHE_TTL_MINUTES = Number(process.env.WEATHER_CACHE_TTL_MINUTES || 30)
const OSS_MAX_SIZE = Number(process.env.OSS_MAX_SIZE_MB || 10) * 1024 * 1024
const OSS_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const LOCAL_AVATAR_MAX_SIZE = 2 * 1024 * 1024
const LOCAL_AVATAR_DIR = path.join(__dirname, 'public', 'uploads', 'avatars')
const DASHSCOPE_API_URL =
  process.env.DASHSCOPE_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MARKET_REPORT_AI_ENABLED = String(process.env.MARKET_REPORT_AI_ENABLED || 'true') === 'true'
const BUYER_AI_ENABLED = String(process.env.BUYER_AI_ENABLED || 'false') === 'true'

app.use(express.json({ limit: '12mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')))
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

const ok = (data = null, message = 'ok') => ({ code: 0, message, data })
const fail = (message, code = 400, data = null) => ({ code, message, data })

const passwordHash = (password) =>
  crypto.createHash('sha256').update(String(password || '')).digest('hex')

const DEFAULT_USER_AVATAR = '/static/images/profile/default-farmer-avatar.svg'

const ensureUserProfileColumns = () => {
  ensureColumn('users', 'avatar', 'TEXT')
  ensureColumn('users', 'real_name', 'TEXT')
  ensureColumn('users', 'region', 'TEXT')
  ensureColumn('users', 'farm_role', 'TEXT')
  ensureColumn('users', 'bio', 'TEXT')
  ensureColumn('users', 'updated_at', 'TEXT')
}

const publicUser = (user) => ({
  id: user.id,
  phone: user.phone,
  name: user.nickname,
  nickname: user.nickname,
  avatar: user.avatar || DEFAULT_USER_AVATAR,
  realName: user.real_name || '',
  region: user.region || '',
  farmRole: user.farm_role || '',
  bio: user.bio || '',
  role: user.role,
})

const cleanProfileText = (value, maxLength) => String(value || '').trim().slice(0, maxLength)

const buildRequestPublicUrl = (req, urlPath) => {
  if (/^https?:\/\//i.test(String(urlPath || ''))) return urlPath
  return `${req.protocol}://${req.get('host')}${urlPath}`
}

const saveLocalAvatar = async ({ dataUrl, filename }) => {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) {
    const error = new Error('头像格式不正确，仅支持 jpg、png、webp')
    error.statusCode = 400
    throw error
  }

  const mimeType = match[1]
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length) {
    const error = new Error('头像文件不能为空')
    error.statusCode = 400
    throw error
  }
  if (buffer.length > LOCAL_AVATAR_MAX_SIZE) {
    const error = new Error('头像大小不能超过 2MB')
    error.statusCode = 400
    throw error
  }

  fs.mkdirSync(LOCAL_AVATAR_DIR, { recursive: true })
  const ext = 'webp'
  const safeBase = String(filename || 'avatar').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 32) || 'avatar'
  const objectKey = `${Date.now()}-${crypto.randomUUID()}-${safeBase}.${ext}`
  const target = path.join(LOCAL_AVATAR_DIR, objectKey)
  const output = await sharp(buffer)
    .rotate()
    .resize(320, 320, {
      fit: 'cover',
      position: 'attention',
    })
    .webp({ quality: 82 })
    .toBuffer()

  fs.writeFileSync(target, output)

  return {
    url: `/uploads/avatars/${objectKey}`,
    objectKey: `uploads/avatars/${objectKey}`,
    mimeType: 'image/webp',
    size: output.length,
  }
}

const issueTokens = (user) => {
  const access = jwt.sign({ sub: user.id, phone: user.phone }, JWT_SECRET, ACCESS_TOKEN_TTL)
  const refreshToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000).toISOString()

  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(user.id, refreshToken, expiresAt, nowIso())

  return {
    token: access.token,
    refreshToken,
    expireAt: access.expireAt,
  }
}

const findUserByPhone = (phone) =>
  db.prepare('SELECT * FROM users WHERE phone = ?').get(String(phone || '').trim())

const findUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id)

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = findUserById(payload.sub)
    if (!user) {
      res.status(401).json(fail('用户不存在', 401))
      return
    }
    req.user = user
    next()
  } catch (_error) {
    res.status(401).json(fail('登录已过期，请重新登录', 401))
  }
}

const optionalAuth = (req, _res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    next()
    return
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = findUserById(payload.sub)
    if (user) req.user = user
  } catch (_error) {
    // Public demo endpoints can continue without a user.
  }
  next()
}


const parseJsonSafe = (value, fallback = null) => {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (_error) {
    return fallback
  }
}

const mapNotificationRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  title: row.title,
  content: row.content,
  source: row.source,
  sourceId: row.source_id || '',
  linkPayload: parseJsonSafe(row.link_payload, null),
  read: Number(row.is_read) === 1,
  readAt: row.read_at || '',
  createdAt: row.created_at,
})

const createNotification = ({
  userId = null,
  type = 'system',
  title,
  content,
  source = 'system',
  sourceId = null,
  linkPayload = null,
  dedupe = false,
}) => {
  const cleanTitle = String(title || '').trim()
  const cleanContent = String(content || '').trim()
  if (!cleanTitle || !cleanContent) return null

  const payload = linkPayload ? JSON.stringify(linkPayload) : null
  const now = nowIso()
  const sql = dedupe
    ? `INSERT OR IGNORE INTO notifications (
        user_id, type, title, content, source, source_id, link_payload, is_read, read_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`
    : `INSERT INTO notifications (
        user_id, type, title, content, source, source_id, link_payload, is_read, read_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`

  const result = db.prepare(sql).run(
    userId,
    String(type || 'system'),
    cleanTitle,
    cleanContent,
    String(source || 'system'),
    sourceId ? String(sourceId) : null,
    payload,
    now,
  )
  if (!result.changes) return null
  return result.lastInsertRowid
}

const seedSystemNotificationForUser = (user) => {
  if (!user?.id) return
  createNotification({
    userId: user.id,
    type: 'system',
    title: '欢迎使用智慧农云管理系统',
    content: '通知中心已为你开启，价格预警、买家联系和系统消息会在这里汇总。',
    source: 'system',
    sourceId: 'welcome',
    linkPayload: { page: '/pages/notification/index' },
    dedupe: true,
  })
}

const normalizeName = (name) => String(name || '').trim().replace(/\s+/g, '').replace(/树$/, '')
const displayName = (name) => {
  const normalized = normalizeName(name)
  if (!normalized) return normalized
  return normalized.endsWith('树') ? normalized : normalized
}

const parseNumber = (value) => {
  const numeric = Number(String(value || '').replace(/[^\d.]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

const cropRowToField = (row) => {
  const areaValue = parseNumber(row.area) || 1
  const createdAt = new Date(row.created_at).getTime()
  const days = Number.isFinite(createdAt) ? Math.max(1, Math.floor((Date.now() - createdAt) / 86400000) + 20) : 30
  const expectedYield = Number(row.expected_yield || 0)
  const fallbackYield = expectedYield > 0 ? expectedYield : Math.round(areaValue * 1500)
  return {
    id: 10000 + row.id,
    name: displayName(row.name),
    area: `${areaValue}亩`,
    plantDate: row.plant_date || '',
    stage: row.stage || '未设置',
    location: row.location || '',
    expectedYield: fallbackYield,
    yieldUnit: row.yield_unit || '斤',
    expectedMarketTime: row.expected_market_time || '',
    isYieldEstimated: expectedYield <= 0,
    health: 88,
    days,
    nextTask: '',
  }
}

const getUserCrops = (userId) =>
  db.prepare('SELECT * FROM crops WHERE user_id = ? ORDER BY created_at DESC').all(userId)

const getAdHistory = (userId) =>
  db
    .prepare('SELECT * FROM ad_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10')
    .all(userId)
    .map((item) => ({
      title: item.title,
      meta: `${new Date(item.created_at).toLocaleDateString('zh-CN')} · ${item.provider}`,
    }))

const getAiDiagnosisHistory = (userId) =>
  db
    .prepare('SELECT * FROM ai_diagnosis_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10')
    .all(userId)
    .map((item) => ({
      id: item.id,
      content: item.content,
      image: item.image || '',
      reply: item.reply,
      provider: item.provider,
      createdAt: item.created_at,
    }))

const buildWeatherSuggestion = (live) => {
  const weather = String(live.weather || '')
  const temperature = Number(live.temperature || 0)
  const humidity = Number(live.humidity || 0)
  const windPower = String(live.windpower || '')

  if (weather.includes('暴雨') || weather.includes('大暴雨')) {
    return '强降雨风险高，优先检查排水沟和低洼地块，暂停施肥喷药，提前转移易受淹农资。'
  }
  if (weather.includes('大雨') || weather.includes('中雨')) {
    return '有明显降雨，建议减少浇水并提前查看排水沟，暂缓喷药和叶面肥作业。'
  }
  if (weather.includes('小雨') || weather.includes('阵雨')) {
    return '有降雨过程，适合巡田观察墒情，注意雨后病害和根系积水情况。'
  }
  if (weather.includes('雷')) {
    return '天气不稳定，建议暂停田间高空作业，并检查棚膜和支架稳固情况。'
  }
  if (weather.includes('雪') || weather.includes('雨夹雪')) {
    return '低温雨雪天气，注意作物保温、防冻和棚体承重，减少露天作业。'
  }
  if (weather.includes('雾') || weather.includes('霾')) {
    return '能见度较低，建议减少远距离运输和喷施作业，并加强棚内通风防病。'
  }
  if (temperature >= 35 && humidity <= 45) {
    return '高温偏干，建议避开正午作业，增加补水频次，并重点防止叶片灼伤和土壤失墒。'
  }
  if (temperature >= 32 && humidity >= 75) {
    return '高温高湿，病害风险明显上升，建议加强通风、控水并重点观察霜霉和炭疽。'
  }
  if (temperature >= 32) {
    return '气温偏高，建议错峰作业，及时补水并关注果实日灼和叶片卷曲。'
  }
  if (temperature >= 26 && humidity >= 85) {
    return '温暖高湿，适合病菌繁殖，建议早晚巡田并提前准备防病药剂。'
  }
  if (temperature <= 0) {
    return '气温接近或低于冰点，优先做好防冻保温，幼苗和花期作物建议覆盖防护。'
  }
  if (temperature <= 5 && humidity >= 70) {
    return '低温偏湿，注意根系受寒和霉变风险，适当控水并加强保温。'
  }
  if (temperature <= 5) {
    return '气温偏低，注意保温防寒，幼苗作物建议覆盖防护。'
  }
  if (humidity >= 85) {
    return '空气湿度较高，病害风险上升，建议加强通风并关注叶面病斑。'
  }
  if (humidity <= 35 && temperature >= 20) {
    return '空气偏干，建议关注土壤墒情和滴灌频次，防止植株失水萎蔫。'
  }
  if (windPower.includes('5') || windPower.includes('6') || windPower.includes('7')) {
    return '风力较大，建议暂缓喷施作业，并固定支撑较弱的作物。'
  }
  if (temperature >= 18 && temperature <= 28 && humidity >= 45 && humidity <= 75) {
    return '温湿度适宜，适合进行巡田、补肥、中耕除草和常规农事管理。'
  }
  return '天气条件总体平稳，建议结合地块墒情安排巡田、补肥和病虫害观察。'
}

const mapWeatherLiveToView = (live) => ({
  temp: `${live.temperature || '--'}°C`,
  condition: String(live.weather || '--'),
  humidity: `${live.humidity || '--'}%`,
  wind: `${live.winddirection || '--'}风 ${live.windpower || '--'}级`,
  suggestion: String(live.suggestion || buildWeatherSuggestion(live)),
})

const getWeatherCacheRow = (adcode) =>
  db.prepare('SELECT * FROM weather_cache WHERE adcode = ?').get(String(adcode || AMAP_DEFAULT_ADCODE))

const saveWeatherCache = (adcode, live) => {
  const suggestion = buildWeatherSuggestion(live)
  const now = nowIso()
  const existing = getWeatherCacheRow(adcode)

  if (existing) {
    db.prepare(
      `UPDATE weather_cache SET
        province = ?,
        city = ?,
        weather = ?,
        temperature = ?,
        winddirection = ?,
        windpower = ?,
        humidity = ?,
        reporttime = ?,
        suggestion = ?,
        raw_json = ?,
        fetched_at = ?,
        updated_at = ?
      WHERE adcode = ?`,
    ).run(
      String(live.province || ''),
      String(live.city || ''),
      String(live.weather || ''),
      String(live.temperature || ''),
      String(live.winddirection || ''),
      String(live.windpower || ''),
      String(live.humidity || ''),
      String(live.reporttime || ''),
      suggestion,
      JSON.stringify(live),
      now,
      now,
      String(adcode),
    )
    return
  }

  db.prepare(
    `INSERT INTO weather_cache (
      adcode, province, city, weather, temperature, winddirection, windpower,
      humidity, reporttime, suggestion, raw_json, fetched_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    String(adcode),
    String(live.province || ''),
    String(live.city || ''),
    String(live.weather || ''),
    String(live.temperature || ''),
    String(live.winddirection || ''),
    String(live.windpower || ''),
    String(live.humidity || ''),
    String(live.reporttime || ''),
    suggestion,
    JSON.stringify(live),
    now,
    now,
  )
}

const getCachedWeatherView = (adcode) => {
  const row = getWeatherCacheRow(adcode)
  if (!row) return null

  const fetchedAt = new Date(row.fetched_at).getTime()
  if (!Number.isFinite(fetchedAt)) return null
  const ageMinutes = (Date.now() - fetchedAt) / 60000
  if (ageMinutes > WEATHER_CACHE_TTL_MINUTES) return null

  return {
    temp: `${row.temperature || '--'}°C`,
    condition: String(row.weather || '--'),
    humidity: `${row.humidity || '--'}%`,
    wind: `${row.winddirection || '--'}风 ${row.windpower || '--'}级`,
    suggestion: String(row.suggestion || '--'),
    city: String(row.city || ''),
    adcode: String(row.adcode || adcode),
    reporttime: String(row.reporttime || ''),
    provider: 'amap-cache',
  }
}

const fetchAmapWeather = async (adcode = AMAP_DEFAULT_ADCODE) => {
  if (!AMAP_WEB_SERVICE_KEY) return null

  const url = new URL('https://restapi.amap.com/v3/weather/weatherInfo')
  url.searchParams.set('key', AMAP_WEB_SERVICE_KEY)
  url.searchParams.set('city', String(adcode))
  url.searchParams.set('extensions', 'base')
  url.searchParams.set('output', 'JSON')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) return null
    const data = await response.json()
    if (String(data?.status) !== '1' || String(data?.infocode) !== '10000' || !Array.isArray(data?.lives) || !data.lives[0]) {
      return null
    }
    return data.lives[0]
  } catch (_error) {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const fetchAmapReverseGeocode = async (latitude, longitude) => {
  if (!AMAP_WEB_SERVICE_KEY || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const url = new URL('https://restapi.amap.com/v3/geocode/regeo')
  url.searchParams.set('key', AMAP_WEB_SERVICE_KEY)
  url.searchParams.set('location', `${longitude},${latitude}`)
  url.searchParams.set('extensions', 'base')
  url.searchParams.set('output', 'JSON')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) return null
    const data = await response.json()
    if (String(data?.status) !== '1' || String(data?.infocode) !== '10000' || !data?.regeocode) {
      return null
    }
    const component = data.regeocode?.addressComponent || {}
    return {
      adcode: String(component.adcode || ''),
      city: Array.isArray(component.city) ? component.city[0] || '' : String(component.city || ''),
      district: String(component.district || ''),
      address: String(data.regeocode?.formatted_address || ''),
    }
  } catch (_error) {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const resolveWeatherAdcode = async ({ adcode, latitude, longitude }) => {
  const cleanAdcode = String(adcode || '').trim()
  if (cleanAdcode) {
    return {
      adcode: cleanAdcode,
      address: '',
      city: '',
      provider: 'explicit-adcode',
    }
  }

  const lat = Number(latitude)
  const lng = Number(longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const geo = await fetchAmapReverseGeocode(lat, lng)
    if (geo?.adcode) {
      return {
        adcode: geo.adcode,
        address: geo.address,
        city: geo.city || geo.district || '',
        provider: 'reverse-geocode',
      }
    }
  }

  return {
    adcode: AMAP_DEFAULT_ADCODE,
    address: DEFAULT_ORIGIN.address,
    city: '',
    provider: 'default-adcode',
  }
}

const getWeatherSnapshot = async ({ adcode, latitude, longitude } = {}) => {
  const locationContext = await resolveWeatherAdcode({ adcode, latitude, longitude })
  const resolvedAdcode = locationContext.adcode || AMAP_DEFAULT_ADCODE
  const cached = getCachedWeatherView(resolvedAdcode)
  if (cached) {
    return {
      ...cached,
      resolvedBy: locationContext.provider,
      locationAddress: locationContext.address,
    }
  }

  const live = await fetchAmapWeather(resolvedAdcode)
  if (live) {
    saveWeatherCache(resolvedAdcode, live)
    return {
      ...mapWeatherLiveToView({
        ...live,
        suggestion: buildWeatherSuggestion(live),
      }),
      city: String(live.city || locationContext.city || ''),
      adcode: String(live.adcode || resolvedAdcode),
      reporttime: String(live.reporttime || ''),
      provider: 'amap-live',
      resolvedBy: locationContext.provider,
      locationAddress: locationContext.address,
    }
  }

  return {
    ...mockWeather,
    city: '',
    adcode: String(resolvedAdcode),
    reporttime: '',
    provider: 'mock-fallback',
    resolvedBy: locationContext.provider,
    locationAddress: locationContext.address,
  }
}

const buildAiFallback = (payload) => {
  if (payload.image) {
    return '根据图片和描述，叶片可能存在黄化或早期病斑。建议先补充氮肥并控制浇水，连续观察 2-3 天；如病斑扩大，可使用多菌灵 500 倍液喷施，并及时清理病叶。'
  }
  if (String(payload.content || '').includes('黄')) {
    return '作物发黄常见原因包括缺氮、缺铁、水分异常或病害扩散。建议先检查土壤湿度和近期施肥情况，再补充清晰叶片照片，我可以继续细化判断。'
  }
  return '已记录你的问题。请补充作物种类、发生部位、症状持续时间和所在地区；也可以上传照片，我会给出更具体的诊断建议。'
}

const extractMessageText = (message) => {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.text) return item.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

const callDashScopeMessage = async ({ model, messages, enableThinking, timeoutMs }) => {
  const apiKey = process.env.DASHSCOPE_API_KEY
  if (!apiKey) return { content: '', reasoning: '', error: 'missing_api_key' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs || process.env.AI_TIMEOUT_MS || 60000))
  const body = {
    model,
    messages,
    result_format: 'message',
  }

  if (typeof enableThinking === 'boolean') {
    body.enable_thinking = enableThinking
  }

  try {
    const response = await fetch(DASHSCOPE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.warn('[dashscope] request failed:', response.status, errorText.slice(0, 500))
      return {
        content: '',
        reasoning: '',
        error: `dashscope_http_${response.status}`,
        status: response.status,
        detail: errorText,
      }
    }
    const data = await response.json()
    const message = data?.choices?.[0]?.message
    const content = extractMessageText(message)
    if (!content) {
      console.warn('[dashscope] empty response:', JSON.stringify(data).slice(0, 500))
      return { content: '', reasoning: '', error: 'empty_response', detail: data }
    }
    return {
      content,
      reasoning: message?.reasoning_content || '',
      model,
    }
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'timeout' : error?.message || 'request_failed'
    console.warn('[dashscope] request error:', message)
    return { content: '', reasoning: '', error: message }
  } finally {
    clearTimeout(timeout)
  }
}

const callDashScopeDiagnosis = async (payload) => {
  const hasImage = Boolean(payload.image)
  const model = hasImage
    ? process.env.DASHSCOPE_VL_MODEL || process.env.DASHSCOPE_MODEL || 'qwen-vl-plus'
    : process.env.DASHSCOPE_TEXT_MODEL || process.env.DASHSCOPE_MODEL || 'qwen3.6-flash'
  const userContent = hasImage
    ? [
        { type: 'image_url', image_url: { url: payload.image } },
        { type: 'text', text: payload.content || '请诊断这张作物图片。' },
      ]
    : String(payload.content || '请诊断当前作物症状。')

  const requestOptions = {
    enableThinking: hasImage ? undefined : String(process.env.DASHSCOPE_DIAGNOSIS_ENABLE_THINKING || 'false') === 'true',
    timeoutMs: Number(process.env.AI_DIAGNOSIS_TIMEOUT_MS || 60000),
    messages: [
      {
        role: 'system',
        content: '你是专业农业病虫害诊断助手。请用中文给出诊断结论、原因分析、防治建议和后续观察要点。',
      },
      { role: 'user', content: userContent },
    ],
  }

  if (!hasImage) {
    return callDashScopeMessage({ ...requestOptions, model })
  }

  const fallbackModels = String(process.env.DASHSCOPE_VL_FALLBACK_MODELS || 'qwen-vl-plus')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const models = Array.from(new Set([model, ...fallbackModels]))
  let lastResult = null

  for (const currentModel of models) {
    const result = await callDashScopeMessage({ ...requestOptions, model: currentModel })
    if (result?.content) return result
    lastResult = result
  }

  return lastResult
}

const callDashScopeMarketReport = async (prompt) => {
  if (!MARKET_REPORT_AI_ENABLED) return null
  const model = process.env.DASHSCOPE_TEXT_MODEL || process.env.DASHSCOPE_MODEL || 'qwen3.6-flash'
  return callDashScopeMessage({
    model,
    enableThinking: String(process.env.DASHSCOPE_MARKET_ENABLE_THINKING || 'false') === 'true',
    timeoutMs: Number(process.env.MARKET_REPORT_AI_TIMEOUT_MS || process.env.AI_TIMEOUT_MS || 60000),
    messages: [
      {
        role: 'system',
        content:
          '你是农业行情分析助手。只基于用户提供的检索资料生成中文报告，资料不足时必须明确说明，不编造价格、日期和来源。',
      },
      { role: 'user', content: prompt },
    ],
  })
}

const buildGeneratedAd = (template) => ({
  ...template,
  title: `${template.type}版 · 产地直发推广文案`,
  content: `${template.content}\n\n【AI优化】突出产地、生态种植和限时供应信息，适合比赛演示时复制发布。\n\n现在预订可享受果园直供价，支持批发、团购和同城配送。`,
  tags: Array.from(new Set([...(template.tags || []), 'AI优化', '产地直发'])),
  engagement: Math.min(99, Number(template.engagement || 80) + 3),
})

const riskyMarketingClaims = ['有机认证', '绿色食品认证', '0农残', '无农药', '国家认证', '包治病', '纯天然无污染']

const sanitizeSellingPoints = (points = []) => {
  return (Array.isArray(points) ? points : [])
    .map((point) => String(point || '').trim())
    .filter(Boolean)
    .filter((point) => !riskyMarketingClaims.some((word) => point.includes(word)))
}

const formatMarketingQuantity = (expectedYield, yieldUnit = '斤') => {
  const value = Number(expectedYield || 0)
  if (!Number.isFinite(value) || value <= 0) return '一批'
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${yieldUnit || '斤'}`
}

const calculateMarketingCompleteness = ({ productName, location, expectedYield, expectedMarketTime, sellingPoints }) => {
  let score = 0
  if (String(productName || '').trim()) score += 20
  if (String(location || '').trim()) score += 20
  if (Number(expectedYield || 0) > 0) score += 20
  if (String(expectedMarketTime || '').trim()) score += 20
  if (Array.isArray(sellingPoints) && sellingPoints.length) score += 20
  return Math.min(100, score)
}

const buildMarketingMaterialPackage = (payload = {}) => {
  const productName = String(payload.productName || '').trim()
  const goal = String(payload.goal || 'buyer')
  const location = String(payload.location || '').trim()
  const expectedMarketTime = String(payload.expectedMarketTime || '').trim()
  const yieldUnit = String(payload.yieldUnit || '斤')
  const yieldText = formatMarketingQuantity(payload.expectedYield, yieldUnit)
  const targetBuyerName = String(payload.targetBuyerName || '').trim()
  const safePoints = sanitizeSellingPoints(payload.sellingPoints)
  const blockedPoints = (Array.isArray(payload.sellingPoints) ? payload.sellingPoints : [])
    .map((point) => String(point || '').trim())
    .filter((point) => riskyMarketingClaims.some((word) => point.includes(word)))
  const placeText = location || '本地'
  const marketTimeText = expectedMarketTime || '近期'
  const pointText = safePoints.length ? `，${safePoints.join('、')}` : ''
  const priceText = Number(payload.marketPrice || 0) > 0
    ? `，当前参考行情约${payload.marketPrice}元/${payload.marketUnit || yieldUnit}`
    : ''
  const buyerPrefix = targetBuyerName
    ? `${targetBuyerName}老板您好，看到贵方近期有相关收购需求`
    : '老板您好，我看到您这边有相关收购需求'

  const goalCopy = {
    buyer: '支持批发预订，可提前沟通起收量和交货安排',
    wechat: '欢迎朋友们提前咨询，也可以帮忙转发给有需要的人',
    video: '想了解上市时间和预订方式，可以在评论区或私信联系',
    group: '适合社群团购和提前接龙，数量有限可先登记需求',
  }[goal] || '欢迎提前咨询预订'

  const productTitle = `${placeText}${productName}${marketTimeText}上市，产地直发，${goal === 'buyer' ? '支持批发预订' : '可提前预订'}`
  const wechatCopy = `这批${placeText}${productName}预计${marketTimeText}上市，预计供应${yieldText}${pointText}${priceText}。\n${goal === 'wechat' ? '适合自家吃、送亲友或小批量团购。' : '有批发、团购或预订需求的朋友可以提前联系。'}后续可提供实拍图、采摘和装箱情况，实际品质以现场和实拍为准。`
  const shortVideoScript = goal === 'video'
    ? `大家好，我是${placeText}的种植户。今天带大家看看这批${productName}的田间情况。\n这批货预计${marketTimeText}上市，预计供应${yieldText}${pointText}。\n如果你想提前了解价格、预订方式或批发合作，可以留言或私信，我会按实际情况回复。`
    : `大家好，我是${placeText}的种植户。这批${productName}预计${marketTimeText}上市，预计供应${yieldText}。后续会更新实拍、采摘和装箱情况，有需要可以提前联系。`
  const inquiryScript = `${buyerPrefix}。\n我这边有一批${placeText}${productName}，预计产量约${yieldText}，预计${marketTimeText}上市${pointText}。\n想咨询一下当前收购价格、起收量、是否支持上门收货，以及结算方式。如果价格合适，可以进一步沟通样品、交货时间和运输安排。`
  const groupCopy = `【${placeText}${productName}预订】预计${marketTimeText}上市，预计供应${yieldText}${pointText}。\n${goalCopy}。\n接龙格式：姓名 + 数量 + 联系方式。实际价格和配送方式以上市前确认为准。`

  const tags = Array.from(new Set([
    placeText,
    productName,
    '产地直发',
    goal === 'buyer' ? '批发预订' : '',
    goal === 'group' ? '社群团购' : '',
    ...safePoints,
  ].filter(Boolean))).slice(0, 8)

  return {
    productTitle,
    wechatCopy: goal === 'group' ? `${wechatCopy}\n\n${groupCopy}` : wechatCopy,
    shortVideoScript,
    inquiryScript,
    imageSuggestions: [
      '田间或果园远景，展示产地环境',
      `${productName}近景，突出新鲜度和成熟情况`,
      '采摘、分拣或装箱过程',
      '称重、包装或发货画面',
    ],
    tags,
    completenessScore: calculateMarketingCompleteness({
      productName,
      location,
      expectedYield: payload.expectedYield,
      expectedMarketTime,
      sellingPoints: safePoints,
    }),
    complianceTips: [
      '文案已避免使用“有机认证”“0农残”等未证明描述，实际发布前请以真实检测和认证材料为准。',
      blockedPoints.length
        ? `以下卖点需要证明材料，未写入正文：${blockedPoints.join('、')}。`
        : '如需使用认证、检测报告、品牌授权等表述，请先确认已有对应材料。',
      '价格、产量和上市时间均为参考信息，发布前请按实际情况更新。',
    ],
  }
}

const tryParseMarketingMaterialJson = (content) => {
  try {
    const raw = String(content || '').replace(/```(?:json)?/g, '').replace(/```/g, '').trim()
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch (_error) {
    return null
  }
}

const normalizeStringList = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(/\n|,|，/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

const normalizeMarketingMaterialPackage = (value, fallbackPackage) => {
  const source = value && typeof value === 'object' ? value : {}
  return {
    productTitle: String(source.productTitle || fallbackPackage.productTitle || '').trim(),
    wechatCopy: String(source.wechatCopy || fallbackPackage.wechatCopy || '').trim(),
    shortVideoScript: String(source.shortVideoScript || fallbackPackage.shortVideoScript || '').trim(),
    inquiryScript: String(source.inquiryScript || fallbackPackage.inquiryScript || '').trim(),
    imageSuggestions: normalizeStringList(source.imageSuggestions).length
      ? normalizeStringList(source.imageSuggestions).slice(0, 6)
      : fallbackPackage.imageSuggestions,
    tags: normalizeStringList(source.tags).length
      ? normalizeStringList(source.tags).slice(0, 8)
      : fallbackPackage.tags,
    completenessScore: Math.max(0, Math.min(100, Number(source.completenessScore || fallbackPackage.completenessScore || 0))),
    complianceTips: normalizeStringList(source.complianceTips).length
      ? normalizeStringList(source.complianceTips).slice(0, 6)
      : fallbackPackage.complianceTips,
  }
}

const callDashScopeMarketingMaterials = async (payload, fallbackPackage) => {
  const model = process.env.DASHSCOPE_TEXT_MODEL || process.env.DASHSCOPE_MODEL || 'qwen3.6-flash'
  const result = await callDashScopeMessage({
    model,
    enableThinking: String(process.env.DASHSCOPE_MARKETING_ENABLE_THINKING || 'false') === 'true',
    timeoutMs: Number(process.env.MARKETING_AI_TIMEOUT_MS || process.env.AI_TIMEOUT_MS || 60000),
    messages: [
      {
        role: 'system',
        content:
          '你是智慧农业营销助手。必须基于用户提供的作物档案、行情和卖点生成真实可信的中文营销素材，不编造认证、检测、疗效、产量或价格。只返回 JSON，不要代码块。',
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: '生成农产品营销素材包',
          outputSchema: {
            productTitle: '商品标题',
            wechatCopy: '朋友圈或社群文案',
            shortVideoScript: '短视频口播脚本',
            inquiryScript: '给收购商的询价话术',
            imageSuggestions: ['配图建议'],
            tags: ['标签'],
            completenessScore: 0,
            complianceTips: ['合规提醒'],
          },
          cropProfile: payload,
          safetyDraft: fallbackPackage,
        }),
      },
    ],
  })
  if (!result?.content) return result
  const parsed = tryParseMarketingMaterialJson(result.content)
  if (!parsed) return { ...result, content: '', error: 'invalid_json' }
  return {
    ...result,
    package: normalizeMarketingMaterialPackage(parsed, fallbackPackage),
  }
}

const DEFAULT_ORIGIN = {
  latitude: Number(process.env.DEFAULT_MAP_LAT || 37.4647),
  longitude: Number(process.env.DEFAULT_MAP_LNG || 121.4479),
  address: process.env.DEFAULT_MAP_ADDRESS || '山东省烟台市芝罘区',
}

const DEFAULT_BUYER_SEEDS = [
  {
    name: '种苹果的农民伯伯',
    merchantType: 'supplier',
    contactName: '店主',
    contactPhone: '平台沟通',
    address: '山东省烟台市栖霞市',
    district: '栖霞市',
    latitude: 37.3644,
    longitude: 120.8495,
    rating: 4.6,
    ordersCount: 0,
    badge: '惠农网',
    businessHours: '平台店铺，电话沟通',
    sourcePlatform: '惠农网',
    sourceUrl: 'https://www.cnhnb.com/gongying/8636751/',
    sourceNote: '公开页面展示为山东烟台苹果，发货地山东省烟台市栖霞市，1.30元/斤，5000斤起批；定位按地区中心近似。',
    offers: [
      { cropName: '苹果', price: 1.3, demand: 5000, unit: '斤', minQuantity: 5000 },
    ],
  },
  {
    name: '阿涛的农货铺',
    merchantType: 'supplier',
    contactName: '店主',
    contactPhone: '平台沟通',
    address: '山东省烟台市海阳市',
    district: '海阳市',
    latitude: 36.7764,
    longitude: 121.1598,
    rating: 4.8,
    ordersCount: 0,
    badge: '惠农网',
    businessHours: '平台店铺，电话沟通',
    sourcePlatform: '惠农网',
    sourceUrl: 'https://www.cnhnb.com/gongying/8123990/',
    sourceNote: '公开页面展示为烟台苹果，发货地山东省烟台市海阳市，6.00元/斤，20斤起批；页面显示咨询/发货/售后速度遥遥领先。',
    offers: [
      { cropName: '苹果', price: 6.0, demand: 200, unit: '斤', minQuantity: 20 },
    ],
  },
  {
    name: '烟台市谦宝电子商务有限公司',
    merchantType: 'comprehensive',
    contactName: '企业店铺',
    contactPhone: '平台沟通',
    address: '山东省烟台市蓬莱区',
    district: '蓬莱区',
    latitude: 37.8112,
    longitude: 120.7588,
    rating: 5,
    ordersCount: 20,
    badge: '企业认证',
    businessHours: '平台店铺，电话沟通',
    sourcePlatform: '惠农网',
    sourceUrl: 'https://www.cnhnb.com/gongying/3586245/',
    sourceNote:
      '公开页面展示为红富士苹果约5斤，36元/箱，1箱起批，发货地山东省烟台市蓬莱区；按4.8斤/箱折算约7.5元/斤录入，来源页显示食品经营许可证和20笔成交。',
    offers: [
      { cropName: '苹果', price: 7.5, demand: 480, unit: '斤', minQuantity: 5 },
    ],
  },
  {
    name: '刘凡周的店',
    merchantType: 'supplier',
    contactName: '店主',
    contactPhone: '平台沟通',
    address: '山东省济宁市任城区',
    district: '任城区',
    latitude: 35.4146,
    longitude: 116.5871,
    rating: 4.5,
    ordersCount: 0,
    badge: '惠农网',
    businessHours: '平台店铺，电话沟通',
    sourcePlatform: '惠农网',
    sourceUrl: 'https://www.cnhnb.com/gongying/6235636/',
    sourceNote: '公开页面展示为黄大豆，7200元/吨，10吨起批，发货地山东省济宁市任城区；按3.6元/斤折算录入。',
    offers: [
      { cropName: '大豆', price: 3.6, demand: 20000, unit: '斤', minQuantity: 20000 },
    ],
  },
]

const tryParseAdJson = (content, template) => {
  try {
    const match = content.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : content)
    return {
      ...template,
      title: String(parsed.title || `${template.type}版 · 产地直发推广文案`),
      content: String(parsed.content || template.content),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((item) => String(item)) : template.tags,
      engagement: Math.min(99, Math.max(60, Number(parsed.engagement || template.engagement || 85))),
    }
  } catch (_error) {
    return null
  }
}

const encodeAmapText = (value) => encodeURIComponent(String(value || ''))

const round1 = (value) => Number(Number(value || 0).toFixed(1))

const haversineDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180
  const earthRadiusKm = 6371
  const deltaLat = toRad(lat2 - lat1)
  const deltaLng = toRad(lng2 - lng1)
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

const estimateCropQuantity = (crop) => {
  const expectedYield = Number(crop.expected_yield || 0)
  if (expectedYield > 0) return Math.round(expectedYield)
  const area = parseNumber(crop.area) || 1
  const normalized = normalizeName(crop.name)
  if (normalized.includes('苹果')) return Math.round(area * 180)
  if (normalized.includes('大豆')) return Math.round(area * 130)
  if (normalized.includes('玉米')) return Math.round(area * 220)
  return Math.round(area * 150)
}

const buildUserProducts = (userId, { demoFallback = false } = {}) => {
  const crops = getUserCrops(userId)
  if (!crops.length) {
    return demoFallback ? buyerOverview.myProducts.map((item) => ({ ...item })) : []
  }

  return crops.map((crop) => ({
    name: displayName(crop.name),
    quantity: Number(crop.expected_yield || 0) > 0 ? Number(crop.expected_yield) : estimateCropQuantity(crop),
    unit: crop.yield_unit || '斤',
    area: crop.area || '',
    location: crop.location || '',
    expectedMarketTime: crop.expected_market_time || '',
  }))
}

const marketItemRowToView = (row) => ({
  id: row.id,
  spuId: row.spu_id || '',
  name: row.name,
  currentPrice: Number(row.current_price || 0),
  unit: row.unit || '斤',
  change: Number(row.change_percent || 0),
  trend: row.trend || 'stable',
  prediction: row.prediction || '',
  advice: row.advice || '',
  marketStatus: row.market_status || '',
  avgPrice: Number(row.avg_price || 0),
  highPrice: Number(row.high_price || 0),
  lowPrice: Number(row.low_price || 0),
  weekVolume: Number(row.week_volume || 0),
  monthVolume: Number(row.month_volume || 0),
  userOwned: Number(row.user_owned) === 1,
  source: row.source || 'admin',
  status: row.status || 'active',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
})

const toChinaDate = (date = new Date()) => new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)

const applyLatestPriceStats = (item) => {
  if (!item.spuId) return item

  const rows = db.prepare(`
    SELECT observed_date AS date, price
    FROM price_history
    WHERE spu_id = ? AND price IS NOT NULL
    ORDER BY observed_date DESC LIMIT 30
  `).all(item.spuId)

  if (!rows.length) return item

  const latest = Number(rows[0].price || 0)
  const values = rows.map((row) => Number(row.price || 0)).filter((value) => Number.isFinite(value) && value > 0)
  if (!values.length || !latest) return item

  const today = toChinaDate()
  const forecast = readLatestActive(item.spuId, 7)
  const forecastValues = forecast?.originDate === today
    ? (forecast.point || []).map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : []
  const useForecastAsCurrent = rows[0].date < today && forecastValues.length > 0
  const current = useForecastAsCurrent ? forecastValues[0] : latest
  const statValues = useForecastAsCurrent ? forecastValues : values
  const previous = useForecastAsCurrent ? latest : (rows.length > 1 ? Number(rows[1].price || 0) : current)
  const avgPrice = statValues.reduce((sum, value) => sum + value, 0) / statValues.length
  const highPrice = Math.max(...statValues)
  const lowPrice = Math.min(...statValues)
  const change = previous > 0 ? ((current - previous) / previous) * 100 : Number(item.change || 0)
  const trend = Math.abs(change) < 0.05 ? 'stable' : change > 0 ? 'up' : 'down'

  return {
    ...item,
    currentPrice: Number(current.toFixed(2)),
    change: Number(change.toFixed(1)),
    trend,
    avgPrice: Number(avgPrice.toFixed(2)),
    highPrice: Number(highPrice.toFixed(2)),
    lowPrice: Number(lowPrice.toFixed(2)),
    marketStatus: useForecastAsCurrent ? '算法预估' : item.marketStatus,
  }
}

const ensureForecastSeedData = () => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM spu_tuples').get().count
  if (Number(count || 0) > 0) return

  const now = nowIso()
  // Seed origin
  db.prepare("INSERT OR IGNORE INTO origins (id, adcode, province, city, county, display_name, created_at, updated_at) VALUES (1, '370600', '山东省', '烟台市', NULL, '山东烟台', ?, ?)").run(now, now)
  
  // Seed unit
  db.prepare("INSERT OR IGNORE INTO units (id, code, display_name, created_at, updated_at) VALUES (1, 'cny_jin', '元/斤', ?, ?)").run(now, now)
  
  // Seed grade
  db.prepare("INSERT OR IGNORE INTO grades (id, code, display_name, category, created_at, updated_at) VALUES (1, 'standard', '通货', 'general', ?, ?)").run(now, now)

  const insertVariety = db.prepare("INSERT OR IGNORE INTO varieties (id, code, display_name, category, created_at, updated_at) VALUES (?, ?, ?, 'general', ?, ?)")
  const insertSpu = db.prepare("INSERT OR IGNORE INTO spu_tuples (spu_id, origin_id, variety_id, grade_id, unit_id, display_name, created_at, updated_at) VALUES (?, 1, ?, 1, 1, ?, ?, ?)")
  const insertHistory = db.prepare("INSERT OR IGNORE INTO price_history (spu_id, observed_date, price, source_name, source_url, source_priority, collected_at, request_id) VALUES (?, ?, ?, 'mock', 'mock', 1, ?, 'mock-init')")
  const updateMarketItem = db.prepare("UPDATE market_items SET spu_id = ? WHERE name = ?")

  const crops = [
    { id: 1, name: '苹果', code: 'apple', basePrice: 4.5, trend: 'down' },
    { id: 2, name: '大豆', code: 'soybean', basePrice: 5.8, trend: 'up' },
    { id: 3, name: '玉米', code: 'corn', basePrice: 2.3, trend: 'stable' }
  ]

  crops.forEach((crop) => {
    insertVariety.run(crop.id, crop.code, crop.name, now, now)
    const spuId = `spu_370600_${crop.code}_standard_cny_jin`
    insertSpu.run(spuId, crop.id, `烟台${crop.name}`, now, now)
    updateMarketItem.run(spuId, crop.name)

    // Generate 45 days of history for fallback and basic models
    let price = crop.basePrice
    for (let i = 45; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      if (crop.trend === 'down') price += (Math.random() - 0.7) * 0.1
      else if (crop.trend === 'up') price += (Math.random() - 0.3) * 0.1
      else price += (Math.random() - 0.5) * 0.1
      
      if (price <= 0.1) price = 0.1
      insertHistory.run(spuId, date, Number(price.toFixed(2)), now)
    }
  })
}

const ensureMarketSeedData = () => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM market_items').get().count
  if (Number(count || 0) > 0) return

  const insert = db.prepare(
    `INSERT INTO market_items (
      name, current_price, unit, change_percent, trend, prediction, advice, market_status,
      avg_price, high_price, low_price, week_volume, month_volume, user_owned, source, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const now = nowIso()
  marketOverview.crops.forEach((item) => {
    insert.run(
      item.name,
      item.currentPrice,
      item.unit || '斤',
      item.change,
      item.trend,
      item.prediction,
      item.advice,
      item.marketStatus,
      item.avgPrice,
      item.highPrice,
      item.lowPrice,
      item.weekVolume,
      item.monthVolume,
      item.userOwned ? 1 : 0,
      item.source || 'seed',
      'active',
      now,
      now,
    )
  })
}

const buildPriceAlertFromMarketItem = (item) => {
  if (Math.abs(Number(item.change || 0)) < 3) return null
  const isUp = Number(item.change || 0) > 0
  return {
    crop: item.name,
    title: isUp ? '达到较好出货窗口' : '价格波动提醒',
    message: `${item.name}今日${isUp ? '上涨' : '下跌'}${Math.abs(Number(item.change || 0)).toFixed(1)}%，当前均价为${item.currentPrice}元/${item.unit || '斤'}。`,
    action: item.advice || (isUp ? '建议关注成交机会' : '建议观察市场走势'),
    urgency: Math.abs(Number(item.change || 0)) >= 6 ? 'high' : 'medium',
  }
}

const getMarketOverviewFromDb = () => {
  const crops = db
    .prepare("SELECT * FROM market_items WHERE status = 'active' ORDER BY id ASC")
    .all()
    .map(marketItemRowToView)
    .map(applyLatestPriceStats)

  const priceAlerts = crops
    .map(buildPriceAlertFromMarketItem)
    .filter(Boolean)
    .slice(0, 4)

  return {
    ...marketOverview,
    crops,
    priceAlerts: priceAlerts.length ? priceAlerts : marketOverview.priceAlerts,
  }
}

const notifyPriceAlertsForUser = (userId, alerts) => {
  if (!userId) return
  alerts.forEach((alert) => {
    createNotification({
      userId,
      type: 'price',
      title: alert.title,
      content: `${alert.message}${alert.action ? ` ${alert.action}` : ''}`,
      source: 'price-alert',
      sourceId: `${normalizeName(alert.crop)}:${alert.title}`,
      linkPayload: { page: '/pages/market/index', crop: alert.crop },
      dedupe: true,
    })
  })
}

const ensureBuyerSeedData = () => {
  const findMerchant = db.prepare('SELECT id FROM buyer_merchants WHERE name = ?')
  const insertMerchant = db.prepare(
    `INSERT INTO buyer_merchants (
      name, merchant_type, contact_name, contact_phone, address, district, latitude, longitude,
      rating, orders_count, badge, business_hours, source_platform, source_url, source_note, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const updateMerchant = db.prepare(
    `UPDATE buyer_merchants SET
      merchant_type = ?,
      contact_name = ?,
      contact_phone = ?,
      address = ?,
      district = ?,
      latitude = ?,
      longitude = ?,
      rating = ?,
      orders_count = ?,
      badge = ?,
      business_hours = ?,
      source_platform = ?,
      source_url = ?,
      source_note = ?,
      status = 'active',
      updated_at = ?
    WHERE id = ?`,
  )
  const insertOffer = db.prepare(
    `INSERT INTO buyer_offers (
      merchant_id, crop_name, price, demand, unit, min_quantity, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const clearOffers = db.prepare('DELETE FROM buyer_offers WHERE merchant_id = ?')

  DEFAULT_BUYER_SEEDS.forEach((seed) => {
    const now = nowIso()
    const existing = findMerchant.get(seed.name)
    let merchantId = Number(existing?.id || 0)

    if (merchantId) {
      updateMerchant.run(
        seed.merchantType || 'comprehensive',
        seed.contactName,
        seed.contactPhone,
        seed.address,
        seed.district,
        seed.latitude,
        seed.longitude,
        seed.rating,
        seed.ordersCount,
        seed.badge,
        seed.businessHours,
        seed.sourcePlatform || '',
        seed.sourceUrl || '',
        seed.sourceNote || '',
        now,
        merchantId,
      )
      clearOffers.run(merchantId)
    } else {
      const result = insertMerchant.run(
        seed.name,
        seed.merchantType || 'comprehensive',
        seed.contactName,
        seed.contactPhone,
        seed.address,
        seed.district,
        seed.latitude,
        seed.longitude,
        seed.rating,
        seed.ordersCount,
        seed.badge,
        seed.businessHours,
        seed.sourcePlatform || '',
        seed.sourceUrl || '',
        seed.sourceNote || '',
        'active',
        now,
        now,
      )
      merchantId = Number(result.lastInsertRowid)
    }

    seed.offers.forEach((offer) => {
      insertOffer.run(
        merchantId,
        offer.cropName,
        offer.price,
        offer.demand,
        offer.unit,
        offer.minQuantity,
        now,
        now,
      )
    })
  })
}

const getMerchantCatalog = () => {
  const rows = db
    .prepare(
      `SELECT
        m.id,
        m.name,
        m.merchant_type,
        m.contact_name,
        m.contact_phone,
        m.address,
        m.district,
        m.latitude,
        m.longitude,
        m.rating,
        m.orders_count,
        m.badge,
        m.business_hours,
        m.source_platform,
        m.source_url,
        m.source_note,
        o.crop_name,
        o.price,
        o.demand,
        o.unit,
        o.min_quantity
      FROM buyer_merchants m
      LEFT JOIN buyer_offers o ON o.merchant_id = m.id
      WHERE m.status = 'active'
      ORDER BY m.id ASC, o.id ASC`,
    )
    .all()

  const catalog = new Map()
  rows.forEach((row) => {
    if (!catalog.has(row.id)) {
      catalog.set(row.id, {
        id: row.id,
        name: row.name,
        merchantType: row.merchant_type || 'comprehensive',
        contactName: row.contact_name || '',
        contactPhone: row.contact_phone,
        address: row.address,
        district: row.district || '',
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        rating: Number(row.rating || 4.5),
        orders: Number(row.orders_count || 0),
        badge: row.badge || '推荐',
        businessHours: row.business_hours || '',
        sourcePlatform: row.source_platform || '',
        sourceUrl: row.source_url || '',
        sourceNote: row.source_note || '',
        products: [],
      })
    }

    if (row.crop_name) {
      catalog.get(row.id).products.push({
        name: displayName(row.crop_name),
        price: Number(row.price || 0),
        demand: Number(row.demand || 0),
        unit: row.unit || '斤',
        minQuantity: Number(row.min_quantity || 0),
      })
    }
  })

  return Array.from(catalog.values())
}

const buildNavigationPayload = (merchant, origin = DEFAULT_ORIGIN) => {
  const latitude = Number(merchant.latitude)
  const longitude = Number(merchant.longitude)
  const name = String(merchant.name || '')
  const address = String(merchant.address || '')
  const originLat = Number(origin.latitude || DEFAULT_ORIGIN.latitude)
  const originLng = Number(origin.longitude || DEFAULT_ORIGIN.longitude)

  return {
    latitude,
    longitude,
    name,
    address,
    origin: {
      latitude: originLat,
      longitude: originLng,
      address: origin.address || DEFAULT_ORIGIN.address,
    },
    amapWebUrl: `https://uri.amap.com/navigation?from=${originLng},${originLat},起点&to=${longitude},${latitude},${encodeAmapText(
      name,
    )}&mode=car&src=AgriCloudManager&coordinate=gaode&callnative=1`,
    amapAppUrl: `androidamap://route?sourceApplication=AgriCloudManager&slat=${originLat}&slon=${originLng}&sname=${encodeAmapText(
      '起点',
    )}&dlat=${latitude}&dlon=${longitude}&dname=${encodeAmapText(name)}&dev=0&t=0`,
  }
}

const logBuyerInterest = ({ userId, merchantId, actionType, source = 'buyer-page', extraPayload = null }) => {
  db.prepare(
    `INSERT INTO buyer_interest_logs (
      user_id, merchant_id, action_type, source, extra_payload, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    merchantId,
    String(actionType || 'view'),
    String(source || 'buyer-page'),
    extraPayload ? JSON.stringify(extraPayload) : null,
    nowIso(),
  )
}

const isBuyerMatchTarget = (merchant) => {
  const type = String(merchant?.merchantType || '').toLowerCase()
  return type === 'purchaser' || type === 'comprehensive' || !type
}

const buildRuleBasedBuyerMatches = ({ myProducts, merchants, origin = DEFAULT_ORIGIN }) => {
  const preferredMerchants = merchants.filter(isBuyerMatchTarget)
  const candidateMerchants = preferredMerchants.length ? preferredMerchants : merchants
  const matches = candidateMerchants
    .map((merchant) => {
      const matchedProducts = merchant.products
        .map((offer) => {
          const myProduct = myProducts.find((item) => normalizeName(item.name) === normalizeName(offer.name))
          if (!myProduct) return null
          const matchedQuantity = Math.min(Number(myProduct.quantity || 0), Number(offer.demand || 0))
          if (matchedQuantity <= 0) return null
          return {
            name: offer.name,
            price: Number(offer.price || 0),
            demand: Number(offer.demand || 0),
            matchedQuantity,
            unit: offer.unit || '斤',
            revenue: matchedQuantity * Number(offer.price || 0),
          }
        })
        .filter(Boolean)

      if (!matchedProducts.length) return null

      const estimatedIncome = matchedProducts.reduce((sum, item) => sum + item.revenue, 0)
      const distanceKm = round1(
        haversineDistanceKm(
          Number(origin.latitude),
          Number(origin.longitude),
          Number(merchant.latitude),
          Number(merchant.longitude),
        ),
      )
      const matchedQuantityTotal = matchedProducts.reduce((sum, item) => sum + Number(item.matchedQuantity || 0), 0)
      const transportRaw = distanceKm * 0.35 + matchedQuantityTotal * 0.03 + matchedProducts.length * 6
      const transport = Math.round(Math.min(estimatedIncome * 0.22, Math.max(6, transportRaw)))
      const lossRate = Math.min(0.08, 0.015 + Math.min(distanceKm, 80) * 0.0006)
      const loss = Math.round(estimatedIncome * lossRate)
      const netProfit = Math.max(0, Math.round(estimatedIncome - transport - loss))
      const coverage = matchedProducts.length / Math.max(1, myProducts.length)
      const demandCoverage = matchedProducts.reduce((sum, item) => {
        const myProduct = myProducts.find((product) => normalizeName(product.name) === normalizeName(item.name))
        if (!myProduct?.quantity) return sum
        return sum + item.matchedQuantity / Number(myProduct.quantity || 1)
      }, 0) / Math.max(1, matchedProducts.length)
      const score = Math.max(
        60,
        Math.min(
          98,
          Math.round(
            netProfit / 80 + coverage * 20 + Number(merchant.rating || 4.5) * 6 - Math.min(distanceKm, 25) * 1.2,
          ),
        ),
      )
      const mainProduct = matchedProducts[0]
      const canAbsorbText = matchedProducts
        .slice(0, 2)
        .map((item) => `${item.name}${item.matchedQuantity}${item.unit}`)
        .join('、')
      const priceText = mainProduct ? `，报价${mainProduct.price}元/${mainProduct.unit}` : ''
      const efficiencyText = distanceKm <= 5
        ? '距离较近，运输和损耗成本相对可控'
        : `扣除估算运输约${transport}元、损耗约${loss}元后`
      const reason = `该商户可消化${canAbsorbText}${priceText}，距离约${distanceKm}km。${efficiencyText}，预计净收益${netProfit}元，适合优先联系。`
      const recommendationTags = [
        netProfit >= estimatedIncome * 0.88 ? '净收益高' : '收益稳定',
        demandCoverage >= 0.8 ? '需求量充足' : '可部分成交',
        distanceKm <= 5 ? '距离较近' : '可导航联系',
      ]

      return {
        ...merchant,
        matchedProducts,
        estimatedIncome,
        transport,
        loss,
        netProfit,
        distanceKm,
        distance: `${distanceKm}km`,
        matchScore: score,
        matchReason: reason,
        rankLabel: distanceKm <= 5 ? '距离较近' : '收益较高',
        recommendationTags,
        provider: 'rule-fallback',
        navigation: buildNavigationPayload(merchant, origin),
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.netProfit - a.netProfit)

  return matches.map((item, index) => ({
    ...item,
    rankLabel: index === 0 ? '最优推荐' : item.rankLabel || '可联系',
  }))
}

const tryParseBuyerRecommendationJson = (content) => {
  try {
    const match = content.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : content)
    return {
      summary: String(parsed.summary || ''),
      picks: Array.isArray(parsed.picks)
        ? parsed.picks.map((item) => ({
            merchantId: Number(item.merchantId),
            matchScore: Math.max(60, Math.min(99, Number(item.matchScore || 80))),
            matchReason: String(item.matchReason || ''),
          }))
        : [],
    }
  } catch (_error) {
    return null
  }
}

const callDashScopeBuyerRecommendation = async ({ myProducts, candidates }) => {
  const model = process.env.DASHSCOPE_TEXT_MODEL || process.env.DASHSCOPE_MODEL || 'qwen3.6-flash'
  const result = await callDashScopeMessage({
    model,
    enableThinking: String(process.env.DASHSCOPE_ENABLE_THINKING || 'true') === 'true',
    timeoutMs: Number(process.env.BUYER_RECOMMEND_AI_TIMEOUT_MS || process.env.AI_TIMEOUT_MS || 2500),
    messages: [
      {
        role: 'system',
        content:
          '你是农产品收购商匹配助手。请根据农户待售作物、距离、需求量、报价和预估净收益，为农户挑选最值得联系的收购商。只返回 JSON，不要加代码块。格式：{"summary":"...","picks":[{"merchantId":1,"matchScore":92,"matchReason":"..."}]}',
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            myProducts,
            candidates: candidates.map((item) => ({
              merchantId: item.id,
              name: item.name,
              distanceKm: item.distanceKm,
              rating: item.rating,
              orders: item.orders,
              netProfit: item.netProfit,
              transport: item.transport,
              loss: item.loss,
              matchedProducts: item.matchedProducts.map((product) => ({
                name: product.name,
                price: product.price,
                demand: product.demand,
                matchedQuantity: product.matchedQuantity,
                unit: product.unit,
              })),
            })),
          },
          null,
          2,
        ),
      },
    ],
  })

  if (!result?.content) return null
  return tryParseBuyerRecommendationJson(result.content)
}

const saveBuyerMatchHistory = (userId, matches, provider, summary) => {
  const insert = db.prepare(
    `INSERT INTO buyer_match_history (
      user_id, merchant_id, crop_snapshot, ai_summary, match_score,
      distance_km, estimated_income, transport_cost, loss_cost, net_profit, provider, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  matches.slice(0, 3).forEach((item) => {
    insert.run(
      userId,
      item.id,
      JSON.stringify(item.matchedProducts.map((product) => ({
        name: product.name,
        matchedQuantity: product.matchedQuantity,
        unit: product.unit,
        price: product.price,
      }))),
      summary || item.matchReason,
      item.matchScore,
      item.distanceKm,
      item.estimatedIncome,
      item.transport,
      item.loss,
      item.netProfit,
      provider,
      nowIso(),
    )
  })
}

const recommendBuyersForUser = async ({ userId, origin = DEFAULT_ORIGIN, persist = false, demoFallback = false }) => {
  const myProducts = buildUserProducts(userId, { demoFallback })
  const merchants = getMerchantCatalog()
  const ruleMatches = buildRuleBasedBuyerMatches({ myProducts, merchants, origin }).slice(0, 6)

  if (!ruleMatches.length) {
    return {
      myProducts,
      buyers: [],
      recommendation: {
        provider: 'rule-fallback',
        summary: '当前没有找到可匹配的收购商，请先补充作物信息或维护商户报价。',
      },
    }
  }

  let buyers = ruleMatches
  let provider = 'rule-fallback'
  let summary = ruleMatches[0]
    ? `综合测算后，建议优先联系「${ruleMatches[0].name}」。该商户预计净收益最高，且可消化当前主要待售产品。`
    : '已根据待售产品、收购价、需求量、距离、运输成本和预估损耗，为你计算出更值得优先联系的收购商。'
  let aiResult = null

  if (BUYER_AI_ENABLED) {
    try {
      aiResult = await callDashScopeBuyerRecommendation({ myProducts, candidates: ruleMatches })
    } catch (error) {
      console.warn('[buyer-recommend] DashScope recommendation failed, fallback to rules:', error.message || error)
    }
  }

  if (aiResult?.picks?.length) {
    const pickMap = new Map(aiResult.picks.map((item) => [item.merchantId, item]))
    buyers = ruleMatches
      .map((item) => {
        const aiPick = pickMap.get(item.id)
        if (!aiPick) return item
        return {
          ...item,
          matchScore: aiPick.matchScore,
          matchReason: aiPick.matchReason || item.matchReason,
          provider: 'dashscope',
        }
      })
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore
        return b.netProfit - a.netProfit
      })
    provider = 'dashscope'
    summary = aiResult.summary || summary
  }

  buyers = buyers
    .slice()
    .sort((a, b) => b.netProfit - a.netProfit)
    .map((item, index) => ({
      ...item,
      rankLabel: index === 0 ? '最优推荐' : item.rankLabel || '可联系',
    }))

  if (persist) {
    saveBuyerMatchHistory(userId, buyers, provider, summary)
  }

  return {
    myProducts,
    buyers: buyers.map((item) => ({
      id: item.id,
      name: item.name,
      merchantType: item.merchantType,
      distance: item.distance,
      distanceKm: item.distanceKm,
      rating: item.rating,
      orders: item.orders,
      contact: item.contactPhone,
      contactName: item.contactName,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      businessHours: item.businessHours,
      sourcePlatform: item.sourcePlatform,
      sourceUrl: item.sourceUrl,
      sourceNote: item.sourceNote,
      products: item.products.map((product) => ({
        name: product.name,
        price: product.price,
        demand: product.demand,
        unit: product.unit,
        minQuantity: product.minQuantity,
      })),
      badge: item.badge,
      profit: Math.round(item.estimatedIncome),
      estimatedIncome: Math.round(item.estimatedIncome),
      netProfit: item.netProfit,
      transport: item.transport,
      loss: item.loss,
      matchScore: item.matchScore,
      matchReason: item.matchReason,
      matchedProducts: item.matchedProducts,
      rankLabel: item.rankLabel,
      recommendationTags: item.recommendationTags,
      provider: item.provider,
      navigation: item.navigation,
    })),
    recommendation: {
      provider,
      summary,
      generatedAt: nowIso(),
      bestBuyerName: buyers[0]?.name || '',
    },
  }
}

const callDashScopeAdGenerator = async (template) => {
  const model = process.env.DASHSCOPE_TEXT_MODEL || process.env.DASHSCOPE_MODEL || 'qwen3.6-flash'
  const result = await callDashScopeMessage({
    model,
    enableThinking: String(process.env.DASHSCOPE_ENABLE_THINKING || 'true') === 'true',
    messages: [
      {
        role: 'system',
        content:
          '你是农产品营销文案助手。请只返回 JSON，不要加代码块。字段包括 title、content、tags、engagement。content 用中文，适合比赛演示，可直接复制发布。',
      },
      {
        role: 'user',
        content: `请基于以下模板生成更强的推广文案：\n平台类型：${template.type}\n平台标识：${template.platform}\n原标题：${template.title}\n原始文案：${template.content}\n已有标签：${(template.tags || []).join('、')}\n要求：保留农产品真实感，突出产地直发、生态种植、限时供应，并给出 60-99 之间的预估转化率整数。`,
      },
    ],
  })

  if (!result?.content) return null
  return tryParseAdJson(result.content, template)
}

const getOssPublicHost = () => {
  const explicit = String(process.env.OSS_PUBLIC_HOST || '').trim().replace(/\/$/, '')
  if (explicit) {
    return /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`
  }

  const bucket = String(process.env.OSS_BUCKET || '').trim()
  const endpoint = String(process.env.OSS_ENDPOINT || '').trim()
  if (!bucket || !endpoint) return ''
  return `https://${bucket}.${endpoint}`
}

const buildOssPostSignature = ({ mimeType, size }) => {
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET
  const bucket = process.env.OSS_BUCKET
  const endpoint = process.env.OSS_ENDPOINT
  const uploadPrefix = (process.env.OSS_UPLOAD_PREFIX || 'agricloud/demo/').replace(/^\/+/, '')

  if (!accessKeyId || !accessKeySecret || !bucket || !endpoint) {
    return null
  }

  if (!OSS_ALLOWED_TYPES.includes(String(mimeType || ''))) {
    const error = new Error('仅支持 jpg、png、webp 图片')
    error.statusCode = 400
    throw error
  }

  if (Number(size || 0) > OSS_MAX_SIZE) {
    const error = new Error(`图片大小不能超过 ${process.env.OSS_MAX_SIZE_MB || 10}MB`)
    error.statusCode = 400
    throw error
  }

  const now = new Date()
  const objectKey = `${uploadPrefix}${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${
    mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  }`
  const expiration = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const policy = {
    expiration,
    conditions: [
      ['content-length-range', 1, OSS_MAX_SIZE],
      ['starts-with', '$key', uploadPrefix],
      ['eq', '$Content-Type', mimeType],
      ['eq', '$x-oss-object-acl', 'public-read'],
      { bucket },
    ],
  }

  const encodedPolicy = Buffer.from(JSON.stringify(policy)).toString('base64')
  const signature = crypto.createHmac('sha1', accessKeySecret).update(encodedPolicy).digest('base64')
  const host = getOssPublicHost()

  return {
    host,
    uploadUrl: host,
    objectKey,
    url: `${host}/${objectKey}`,
    expiresAt: expiration,
    maxSize: OSS_MAX_SIZE,
    allowedTypes: OSS_ALLOWED_TYPES,
    fields: {
      key: objectKey,
      policy: encodedPolicy,
      OSSAccessKeyId: accessKeyId,
      Signature: signature,
      success_action_status: '200',
      'Content-Type': mimeType,
      'x-oss-object-acl': 'public-read',
    },
  }
}

app.get('/api/health', (_req, res) => {
  res.json(ok({ status: 'healthy', service: 'agricloud-api', time: nowIso() }))
})

app.post('/api/auth/login', (req, res) => {
  const { phone, password, code, loginType } = req.body || {}
  const cleanPhone = String(phone || '').trim()
  if (!cleanPhone) {
    res.status(400).json(fail('手机号不能为空'))
    return
  }

  const user = findUserByPhone(cleanPhone)
  const passwordOk = user && user.password_hash === passwordHash(password || '123456')
  const smsOk = loginType === 'sms' && String(code || '') === '123456'

  if (!user || (!passwordOk && !smsOk)) {
    res.status(401).json(fail('账号或密码错误，演示账号为 13800138000 / 123456', 401))
    return
  }

  const tokens = issueTokens(user)
  seedSystemNotificationForUser(user)
  res.json(ok({ ...tokens, user: publicUser(user) }))
})

app.post('/api/auth/register', (req, res) => {
  const { phone, password, nickname } = req.body || {}
  const cleanPhone = String(phone || '').trim()
  if (!cleanPhone || !password) {
    res.status(400).json(fail('手机号和密码不能为空'))
    return
  }

  const existing = findUserByPhone(cleanPhone)
  if (existing) {
    const tokens = issueTokens(existing)
    seedSystemNotificationForUser(existing)
    res.json(ok({ ...tokens, user: publicUser(existing) }, '账号已存在，已直接登录'))
    return
  }

  const result = db
    .prepare('INSERT INTO users (phone, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(cleanPhone, passwordHash(password), nickname || `用户${cleanPhone.slice(-4)}`, 'user', nowIso())
  const user = findUserById(result.lastInsertRowid)
  const tokens = issueTokens(user)
  seedSystemNotificationForUser(user)
  res.json(ok({ ...tokens, user: publicUser(user) }))
})

app.post('/api/auth/sms/send', (_req, res) => {
  res.json(ok({ success: true, code: '123456' }, '演示验证码已生成'))
})

const assistantCropNames = ['橘子', '柑橘', '苹果', '大豆', '玉米', '小麦', '水稻', '番茄', '西红柿', '黄瓜', '葡萄', '梨', '桃']
const chineseNumberMap = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

const normalizeAssistantMessage = (message) => String(message || '').trim()

const parseAssistantNumber = (value) => {
  const text = String(value || '').trim()
  const direct = Number(text)
  if (Number.isFinite(direct)) return direct
  if (text === '十') return 10
  if (text.includes('十')) {
    const [tenPart, onePart] = text.split('十')
    const tens = tenPart ? chineseNumberMap[tenPart] || 0 : 1
    const ones = onePart ? chineseNumberMap[onePart] || 0 : 0
    return tens * 10 + ones
  }
  return chineseNumberMap[text] || 0
}

const pad2 = (value) => String(value).padStart(2, '0')

const parseAssistantDate = (message) => {
  const text = normalizeAssistantMessage(message)
  const now = new Date()
  if (text.includes('今天')) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  }
  if (text.includes('明天')) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    return `${tomorrow.getFullYear()}-${pad2(tomorrow.getMonth() + 1)}-${pad2(tomorrow.getDate())}`
  }

  const isoMatch = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (isoMatch) return `${isoMatch[1]}-${pad2(isoMatch[2])}-${pad2(isoMatch[3])}`

  const cnMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/)
  if (cnMatch) return `${now.getFullYear()}-${pad2(cnMatch[1])}-${pad2(cnMatch[2])}`

  return ''
}

const extractAssistantCropName = (message) => {
  const text = normalizeAssistantMessage(message)
  const known = assistantCropNames.find((name) => text.includes(name))
  if (known) return known
  const match = text.match(/(?:添加|种了|种植|记录|生成|收|卖|查)([\u4e00-\u9fa5]{1,6})(?:\d|一|二|两|三|四|五|六|七|八|九|十|行情|广告|文案|老板|收购|价格|叶子|发黄)/)
  return match?.[1] || ''
}

const extractAssistantSlots = (message, intent) => {
  const text = normalizeAssistantMessage(message)
  const cropName = extractAssistantCropName(text)
  const areaMatch = text.match(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*(亩|分|平方米|平米)/)
  const area = areaMatch ? parseAssistantNumber(areaMatch[1]) : 0
  const areaUnit = areaMatch?.[2] || '亩'
  const plantDate = parseAssistantDate(text)
  const missingSlots = []

  if (intent === 'field_add_crop') {
    if (!cropName) missingSlots.push('作物名称')
    if (!area) missingSlots.push('种植面积')
    if (!plantDate) missingSlots.push('种植时间')
  }

  return {
    cropName,
    area,
    areaUnit,
    plantDate,
    missingSlots,
  }
}

const classifyAssistantIntent = (message) => {
  const text = normalizeAssistantMessage(message)
  if (/打开.*行情|去.*行情|行情页面/.test(text)) return 'navigate_market'
  if (/打开.*销路|去.*销路|销路匹配|找老板/.test(text)) return 'navigate_buyer'
  if (/打开.*营销|营销助手|发广告/.test(text)) return 'navigate_marketing'
  if (/(添加|记录|种了|种植).*(亩|地块|我的地)|(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*亩/.test(text)) return 'field_add_crop'
  if (/行情|价格|多少钱|适合卖|涨|跌/.test(text)) return 'market_query'
  if (/收购|老板|销路|卖给谁|采购商|找买家/.test(text)) return 'buyer_match'
  if (/广告|文案|宣传|朋友圈|小红书|口播/.test(text)) return 'marketing_copy'
  if (/发黄|病|虫|叶子|烂根|枯萎|怎么办/.test(text)) return 'diagnosis_advice'
  return 'general'
}

const buildAssistantResponse = (message) => {
  const intent = classifyAssistantIntent(message)
  const slots = extractAssistantSlots(message, intent)
  const cropText = slots.cropName || '该作物'

  if (intent === 'field_add_crop') {
    if (slots.missingSlots.length) {
      return {
        reply: `我识别到你想添加种植记录，还需要补充：${slots.missingSlots.join('、')}。例如“帮我添加橘子 3 亩，3 月 15 号种”。`,
        intent,
        action: {
          type: 'chat',
          intent,
          missingSlots: slots.missingSlots,
        },
      }
    }
    return {
      reply: `已识别到你想添加${slots.cropName}种植记录，我将打开添加作物页面并自动填入。保存前仍需要你手动确认。`,
      intent,
      action: {
        type: 'form_fill',
        intent,
        targetPage: '/pages/add-crop/index',
        formKey: 'field_crop_form',
        confirmText: '打开并预填',
        params: {
          cropName: slots.cropName,
          area: slots.area,
          areaUnit: slots.areaUnit,
          plantDate: slots.plantDate,
        },
      },
    }
  }

  if (intent === 'market_query' || intent === 'navigate_market') {
    return {
      reply: `${cropText}行情需要结合今日参考价、涨跌幅和周边市场一起看。我可以帮你打开行情页继续查看。`,
      intent,
      action: { type: 'navigate', intent, targetPage: '/pages/market/index', confirmText: '打开行情页' },
    }
  }

  if (intent === 'buyer_match' || intent === 'navigate_buyer') {
    return {
      reply: `可以根据${cropText}的待售数量、报价、距离、运输和损耗测算卖给谁更划算。我为你打开销路匹配页。`,
      intent,
      action: { type: 'navigate', intent, targetPage: '/pages/buyer/index', confirmText: '打开销路匹配' },
    }
  }

  if (intent === 'marketing_copy' || intent === 'navigate_marketing') {
    return {
      reply: `可以基于${cropText}档案生成商品标题、朋友圈文案、短视频口播和询价话术，并避免夸大宣传。`,
      intent,
      action: { type: 'navigate', intent, targetPage: '/pages/ads/index', confirmText: '打开营销助手' },
    }
  }

  if (intent === 'diagnosis_advice') {
    return {
      reply: `${cropText}出现叶片发黄或病虫害时，建议先拍照记录叶片、根部和土壤情况，再到农情诊断页提交症状获取建议。`,
      intent,
      action: { type: 'navigate', intent, targetPage: '/pages/ai-consult/index', confirmText: '打开农情诊断' },
    }
  }

  return {
    reply: '我可以帮你添加作物、查询行情、匹配销路、生成营销素材。你可以说“帮我添加橘子 3 亩，3 月 15 号种”。',
    intent,
  }
}

const assistantCropNamesV2 = ['橘子', '柑橘', '苹果', '大豆', '玉米', '小麦', '水稻', '番茄', '西红柿', '黄瓜', '葡萄', '梨', '桃']
const assistantNumberMapV2 = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

const parseAssistantNumberV2 = (value) => {
  const text = String(value || '').trim()
  const direct = Number(text)
  if (Number.isFinite(direct)) return direct
  if (text === '十') return 10
  if (text.includes('十')) {
    const [tenPart, onePart] = text.split('十')
    const tens = tenPart ? assistantNumberMapV2[tenPart] || 0 : 1
    const ones = onePart ? assistantNumberMapV2[onePart] || 0 : 0
    return tens * 10 + ones
  }
  return assistantNumberMapV2[text] || 0
}

const parseAssistantDateV2 = (message) => {
  const text = String(message || '')
  const now = new Date()
  if (text.includes('今天')) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  }
  if (text.includes('明天')) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    return `${tomorrow.getFullYear()}-${pad2(tomorrow.getMonth() + 1)}-${pad2(tomorrow.getDate())}`
  }
  const isoMatch = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (isoMatch) return `${isoMatch[1]}-${pad2(isoMatch[2])}-${pad2(isoMatch[3])}`
  const cnMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/)
  if (cnMatch) return `${now.getFullYear()}-${pad2(cnMatch[1])}-${pad2(cnMatch[2])}`
  return ''
}

const classifyAssistantIntentV2 = (message) => {
  const text = String(message || '').trim()
  if (/打开.*行情|去.*行情|行情页面/.test(text)) return 'navigate_market'
  if (/打开.*销路|去.*销路|销路匹配|找老板/.test(text)) return 'navigate_buyer'
  if (/打开.*营销|营销助手|发广告/.test(text)) return 'navigate_marketing'
  if (/(添加|记录|种了|种植|我种了|帮我添加|帮我记录)/.test(text)) return 'field_add_crop'
  if (/行情|价格|多少钱|适合卖|涨|跌/.test(text)) return 'market_query'
  if (/收购|老板|销路|卖给谁|采购商|找买家/.test(text)) return 'buyer_match'
  if (/广告|文案|宣传|朋友圈|小红书|口播/.test(text)) return 'marketing_copy'
  if (/发黄|病|虫|叶子|烂根|枯萎|怎么办/.test(text)) return 'diagnosis_advice'
  return 'general'
}

const extractAssistantSlotsV2 = (message, intent) => {
  const text = String(message || '').trim()
  const cropName = assistantCropNamesV2.find((name) => text.includes(name)) || ''
  const areaMatch = text.match(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*(亩|分|平方米|平米)/)
  const area = areaMatch ? parseAssistantNumberV2(areaMatch[1]) : 0
  const areaUnit = areaMatch?.[2] || '亩'
  const plantDate = parseAssistantDateV2(text)
  const missingSlots = []

  if (intent === 'field_add_crop') {
    if (!cropName) missingSlots.push('cropName')
    if (!area) missingSlots.push('area')
    if (!plantDate) missingSlots.push('plantDate')
  }

  return { cropName, area, areaUnit, plantDate, missingSlots }
}

const missingSlotNoticeV2 = (missingSlots) => {
  if (!missingSlots?.length) return '请确认信息无误后保存'
  const labels = {
    cropName: '作物名称',
    area: '种植面积',
    plantDate: '种植时间',
  }
  return `请补充${missingSlots.map((slot) => labels[slot] || slot).join('、')}后保存`
}

const buildAssistantResponseV2 = (message) => {
  const intent = classifyAssistantIntentV2(message)
  const slots = extractAssistantSlotsV2(message, intent)
  const cropText = slots.cropName || '该作物'

  if (intent === 'field_add_crop') {
    return {
      reply: `已识别到你想添加${slots.cropName || '作物'}种植记录，正在为你打开添加作物页面并填入已识别信息。`,
      intent,
      action: {
        type: 'form_fill',
        intent,
        targetPage: '/pages/add-crop/index',
        formKey: 'field_crop_form',
        shouldAutoNavigate: true,
        prefillMode: slots.missingSlots.length ? 'partial' : 'complete',
        missingSlots: slots.missingSlots,
        notice: missingSlotNoticeV2(slots.missingSlots),
        params: {
          ...(slots.cropName ? { cropName: slots.cropName } : {}),
          ...(slots.area ? { area: slots.area, areaUnit: slots.areaUnit } : {}),
          ...(slots.plantDate ? { plantDate: slots.plantDate } : {}),
        },
      },
    }
  }

  if (intent === 'market_query' || intent === 'navigate_market') {
    return {
      reply: `${cropText}行情需要结合今日参考价、涨跌幅和周边市场一起看，正在打开行情页。`,
      intent,
      action: { type: 'navigate', intent, targetPage: '/pages/market/index', shouldAutoNavigate: true },
    }
  }

  if (intent === 'buyer_match' || intent === 'navigate_buyer') {
    return {
      reply: `正在打开销路匹配页，帮你按报价、距离、运输和损耗测算卖给谁更划算。`,
      intent,
      action: { type: 'navigate', intent, targetPage: '/pages/buyer/index', shouldAutoNavigate: true },
    }
  }

  if (intent === 'marketing_copy' || intent === 'navigate_marketing') {
    return {
      reply: `正在打开营销助手，基于作物档案生成卖货文案与询价话术。`,
      intent,
      action: { type: 'navigate', intent, targetPage: '/pages/ads/index', shouldAutoNavigate: true },
    }
  }

  if (intent === 'diagnosis_advice') {
    return {
      reply: `正在打开农情诊断页，你可以补充症状或图片后获取建议。`,
      intent,
      action: { type: 'navigate', intent, targetPage: '/pages/ai-consult/index', shouldAutoNavigate: true },
    }
  }

  return {
    reply: '我可以帮你添加作物、查询行情、匹配销路、生成营销素材。你可以说“帮我添加橘子 3 亩”。',
    intent,
  }
}

app.post('/api/assistant/chat', optionalAuth, (req, res) => {
  const message = normalizeAssistantMessage(req.body?.message)
  if (!message) {
    res.status(400).json(fail('请输入指令内容'))
    return
  }

  try {
    res.json(ok(buildAssistantResponseV2(message)))
  } catch (error) {
    console.error('[assistant] chat failed:', error)
    res.status(500).json(fail('助手暂时没有响应，请稍后再试'))
  }
})

app.post('/api/assistant/chat', optionalAuth, (req, res) => {
  const message = normalizeAssistantMessage(req.body?.message)
  if (!message) {
    res.status(400).json(fail('请输入指令内容'))
    return
  }

  try {
    res.json(ok(buildAssistantResponse(message)))
  } catch (error) {
    console.error('[assistant] chat failed:', error)
    res.status(500).json(fail('助手暂时没有响应，请稍后再试'))
  }
})

app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {}
  const row = db
    .prepare('SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > ?')
    .get(String(refreshToken || ''), nowIso())

  if (!row) {
    res.status(401).json(fail('刷新令牌无效', 401))
    return
  }

  const user = findUserById(row.user_id)
  if (!user) {
    res.status(401).json(fail('用户不存在', 401))
    return
  }

  const access = jwt.sign({ sub: user.id, phone: user.phone }, JWT_SECRET, ACCESS_TOKEN_TTL)
  res.json(ok({ token: access.token, expireAt: access.expireAt }))
})

app.get('/api/auth/profile', requireAuth, (req, res) => {
  ensureUserProfileColumns()
  res.json(ok(publicUser(req.user)))
})

app.put('/api/auth/profile', requireAuth, (req, res) => {
  ensureUserProfileColumns()
  const { nickname, realName, region, farmRole, bio, avatar } = req.body || {}
  const cleanNickname = cleanProfileText(nickname || req.user.nickname, 24)
  const cleanRealName = cleanProfileText(realName, 24)
  const cleanRegion = cleanProfileText(region, 40)
  const cleanFarmRole = cleanProfileText(farmRole, 32)
  const cleanBio = cleanProfileText(bio, 120)
  const cleanAvatar = cleanProfileText(avatar || DEFAULT_USER_AVATAR, 180)

  if (!cleanNickname) {
    res.status(400).json(fail('昵称不能为空'))
    return
  }

  const now = nowIso()
  db.prepare(
    `UPDATE users
     SET nickname = ?, avatar = ?, real_name = ?, region = ?, farm_role = ?, bio = ?, updated_at = ?
     WHERE id = ?`,
  ).run(cleanNickname, cleanAvatar, cleanRealName, cleanRegion, cleanFarmRole, cleanBio, now, req.user.id)

  const user = findUserById(req.user.id)
  res.json(ok(publicUser(user), '个人档案已更新'))
})

app.post('/api/auth/avatar', requireAuth, async (req, res) => {
  try {
    ensureUserProfileColumns()
    const { dataUrl, filename } = req.body || {}
    const avatar = await saveLocalAvatar({ dataUrl, filename })
    const avatarUrl = buildRequestPublicUrl(req, avatar.url)
    const now = nowIso()

    db.prepare('UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?').run(avatarUrl, now, req.user.id)
    db.prepare(
      'INSERT INTO uploads (user_id, url, object_key, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(req.user.id, avatarUrl, avatar.objectKey, avatar.mimeType, avatar.size, now)

    const user = findUserById(req.user.id)
    res.json(ok({ ...avatar, url: avatarUrl, user: publicUser(user) }, '头像已更新'))
  } catch (error) {
    res.status(error.statusCode || 500).json(fail(error.message || '头像上传失败', error.statusCode || 500))
  }
})

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const { token } = req.body || {}
  if (token) {
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(String(token))
  }
  res.json(ok({ success: true }))
})

app.get('/api/field/overview', optionalAuth, async (req, res) => {
  const cropRows = req.user ? getUserCrops(req.user.id) : []
  const cropItems = cropRows.map(cropRowToField)
  const crops = req.user ? cropItems : mockCrops

  const extraTasks = cropItems.slice(0, 3).map((item, index) => ({
    id: 100 + index,
    title: `${item.name}田间巡查`,
    crop: item.name,
    time: index % 2 === 0 ? '上午' : '下午',
    priority: index % 2 === 0 ? 'high' : 'medium',
    desc: `关注${item.name}当前长势并记录水肥情况`,
  }))

  const weather = await getWeatherSnapshot({
    adcode: req.query.adcode,
    latitude: req.query.latitude,
    longitude: req.query.longitude,
  })
  res.json(ok({ crops, tasks: req.user ? extraTasks : mockTasks, weather }))
})

app.post('/api/crop/create', requireAuth, (req, res) => {
  const { name, area, plantDate, stage, location, expectedYield, yieldUnit, expectedMarketTime } = req.body || {}
  if (!name || !area || !expectedYield || !expectedMarketTime) {
    res.status(400).json(fail('作物名称、面积、预期产出和预计上市时间不能为空'))
    return
  }

  const cleanName = displayName(name)
  const cleanAreaValue = parseNumber(area)
  if (!Number.isFinite(cleanAreaValue) || cleanAreaValue <= 0) {
    res.status(400).json(fail('种植面积需大于0'))
    return
  }
  const cleanExpectedYield = Number(expectedYield || 0)
  if (!Number.isFinite(cleanExpectedYield) || cleanExpectedYield <= 0) {
    res.status(400).json(fail('预期产出需大于0'))
    return
  }

  const cleanArea = String(area)
  const cleanPlantDate = String(plantDate || '')
  const cleanStage = String(stage || '未设置')
  const cleanLocation = String(location || '')
  const cleanYieldUnit = String(yieldUnit || '斤')
  const cleanExpectedMarketTime = String(expectedMarketTime || '')
  const existing = db
    .prepare('SELECT * FROM crops WHERE user_id = ? AND name = ?')
    .get(req.user.id, cleanName)

  if (existing) {
    db.prepare(
      `UPDATE crops SET
        area = ?,
        plant_date = ?,
        stage = ?,
        location = ?,
        expected_yield = ?,
        yield_unit = ?,
        expected_market_time = ?,
        updated_at = ?
      WHERE id = ?`,
    ).run(
      cleanArea,
      cleanPlantDate,
      cleanStage,
      cleanLocation,
      cleanExpectedYield,
      cleanYieldUnit,
      cleanExpectedMarketTime,
      nowIso(),
      existing.id,
    )
    res.json(ok({
      id: existing.id,
      name: cleanName,
      area: cleanArea,
      plantDate: cleanPlantDate,
      stage: cleanStage,
      location: cleanLocation,
      expectedYield: cleanExpectedYield,
      yieldUnit: cleanYieldUnit,
      expectedMarketTime: cleanExpectedMarketTime,
    }))
    return
  }

  const result = db
    .prepare(
      `INSERT INTO crops (
        user_id, name, area, plant_date, stage, location,
        expected_yield, yield_unit, expected_market_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      req.user.id,
      cleanName,
      cleanArea,
      cleanPlantDate,
      cleanStage,
      cleanLocation,
      cleanExpectedYield,
      cleanYieldUnit,
      cleanExpectedMarketTime,
      nowIso(),
      nowIso(),
    )

  res.json(ok({
    id: result.lastInsertRowid,
    name: cleanName,
    area: cleanArea,
    plantDate: cleanPlantDate,
    stage: cleanStage,
    location: cleanLocation,
    expectedYield: cleanExpectedYield,
    yieldUnit: cleanYieldUnit,
    expectedMarketTime: cleanExpectedMarketTime,
  }))
})

app.delete('/api/crop', requireAuth, (req, res) => {
  const name = String(req.body?.name || req.query.name || '').trim()
  const id = Number(req.body?.id || req.query.id || 0)
  if (!name && !id) {
    res.status(400).json(fail('作物名称或 ID 不能为空'))
    return
  }

  const result = id
    ? db.prepare('DELETE FROM crops WHERE user_id = ? AND id = ?').run(req.user.id, id)
    : db.prepare('DELETE FROM crops WHERE user_id = ? AND name = ?').run(req.user.id, displayName(name))

  res.json(ok({ success: result.changes > 0 }))
})

app.get('/api/market/overview', optionalAuth, (req, res) => {
  try {
    console.log('[market] overview hit')
    const overview = getMarketOverviewFromDb()
    console.log('[market] overview crops count =', Array.isArray(overview.crops) ? overview.crops.length : 0)
    if (req.user?.id) {
      notifyPriceAlertsForUser(req.user.id, overview.priceAlerts || [])
    }
    res.json(ok(overview))
  } catch (error) {
    console.error('[market] overview failed:', error)
    res.status(500).json(fail('行情总览获取失败'))
  }
})

app.get('/api/market/forecast/:spu_id', optionalAuth, async (req, res) => {
  const spuId = String(req.params.spu_id || '').trim()
  if (!spuId) return res.status(400).json(fail('spu_id 不能为空'))

  const horizonDays = Number(req.query.horizon) === 30 ? 30 : 7

  try {
    // 取 SPU 元信息
    const spuRow = db.prepare(`
      SELECT s.spu_id, s.display_name AS spu_display,
             v.display_name AS variety_name, v.code AS variety_code,
             o.display_name AS origin_name, o.adcode,
             g.display_name AS grade_name,
             u.display_name AS unit_name
      FROM spu_tuples s
      JOIN varieties v ON v.id = s.variety_id
      JOIN origins o ON o.id = s.origin_id
      JOIN grades g ON g.id = s.grade_id
      JOIN units u ON u.id = s.unit_id
      WHERE s.spu_id = ? AND s.status = 'active'
    `).get(spuId)

    if (!spuRow) return res.status(404).json(fail('SPU 不存在或已停用', 404))

    // 取最新预测；若无则触发一次
    const today = toChinaDate()
    const latestHistoryDate = db
      .prepare('SELECT MAX(observed_date) AS value FROM price_history WHERE spu_id = ? AND price IS NOT NULL')
      .get(spuId)?.value
    let forecast = readLatestActive(spuId, horizonDays)
    const shouldRefresh =
      String(req.query.refresh || '') === '1' ||
      !forecast ||
      forecast.originDate !== today ||
      (latestHistoryDate && latestHistoryDate > forecast.originDate)

    if (shouldRefresh) {
      const result = await forecastOne({ spuId, horizonDays, originDate: today })
      if (!result) return res.json(ok(null, '数据不足，暂无预测'))
      forecast = readLatestActive(spuId, horizonDays)
    }

    // 取最近 90 天历史价格
    const historyRows = db.prepare(`
      SELECT observed_date AS date, price, source_name AS sourceName
      FROM price_history
      WHERE spu_id = ? AND price IS NOT NULL
      ORDER BY observed_date DESC LIMIT 90
    `).all(spuId).reverse()

    // 降级状态文案
    const degradedMap = {
      cold_start: '数据不足 62 天，使用基础统计预测',
      degraded: '高精度模型暂不可用，已切换为基础统计预测',
      'qualitative-only': '暂无数值预测，仅供参考',
    }

    res.json(ok({
      spu: {
        spuId: spuRow.spu_id,
        displayName: spuRow.spu_display,
        variety: { code: spuRow.variety_code, displayName: spuRow.variety_name },
        origin: { adcode: spuRow.adcode, displayName: spuRow.origin_name },
        grade: { displayName: spuRow.grade_name },
        unit: { displayName: spuRow.unit_name },
      },
      horizon: horizonDays,
      originDate: forecast?.originDate || today,
      latestHistoryDate: latestHistoryDate || '',
      status: forecast?.status || 'qualitative-only',
      degraded: degradedMap[forecast?.status] || null,
      modelFamilies: forecast?.modelFamilies || [],
      generatedAt: forecast?.generatedAt || null,
      history: historyRows,
      forecast: forecast
        ? forecast.point.map((p, i) => ({
            point: p,
            ci80Lower: forecast.ci80Lower[i],
            ci80Upper: forecast.ci80Upper[i],
            ci95Lower: forecast.ci95Lower[i],
            ci95Upper: forecast.ci95Upper[i],
          }))
        : [],
    }))
  } catch (error) {
    res.status(500).json(fail(error.message || '获取预测数据失败', 500))
  }
})

app.get('/api/market/kb/status', optionalAuth, async (_req, res) => {
  res.json(ok({ ...getMarketKbStats(), lightrag: await getLightRagStatus() }))
})

app.post('/api/market/kb/sync', requireAuth, async (_req, res) => {
  try {
    const stats = await crawlAllMarketKb({
      logger: (message) => console.log(`[market-kb] ${message}`),
    })
    res.json(ok({ ...stats, kb: getMarketKbStats() }, '行情知识库同步完成'))
  } catch (error) {
    res.status(500).json(fail(error.message || '行情知识库同步失败', 500))
  }
})

app.post('/api/market/report/rag', optionalAuth, async (req, res) => {
  const { crop, region, question } = req.body || {}
  const cleanCrop = String(crop || '').trim()
  const cleanRegion = String(region || '').trim()
  const cleanQuestion = String(question || '').trim() || `最近${cleanCrop || '该作物'}价格走势怎么样，适合出货吗？`

  if (!cleanCrop) {
    res.status(400).json(fail('作物名称不能为空'))
    return
  }

  try {
    const query = [cleanCrop, cleanRegion, cleanQuestion, '价格 走势 批发价格 菜篮子 农产品批发价格200指数']
      .filter(Boolean)
      .join(' ')
    const results = searchMarketKb(query, 6)
    const retrievedContext = results
      .map(
        (item, index) =>
          `【资料${index + 1}】\n标题：${item.title}\n来源：${item.sourceName}\n日期：${
            item.publishDate || '未标注'
          }\n链接：${item.sourceUrl}\n内容：${item.content.slice(0, 700)}`,
      )
      .join('\n\n')
    const prompt = buildMarketReportPrompt({
      crop: cleanCrop,
      region: cleanRegion,
      question: cleanQuestion,
      retrievedContext,
    })
    let lightRagReport = null
    try {
      lightRagReport = await queryLightRagMarketReport({
        crop: cleanCrop,
        region: cleanRegion,
        question: cleanQuestion,
      })
    } catch (error) {
      console.warn(`[lightrag] market report fallback: ${error.message}`)
    }

    const fallbackSources = results.map((item) => ({
      id: item.id,
      title: item.title,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      publishDate: item.publishDate,
      products: item.products,
    }))
    const realReport = lightRagReport?.content ? null : await callDashScopeMarketReport(prompt)
    const provider = lightRagReport?.content
      ? 'lightrag'
      : realReport?.content
        ? 'dashscope'
        : fallbackSources.length
          ? 'kb-rag'
          : 'no-data'
    const sources = lightRagReport?.sources?.length ? lightRagReport.sources : fallbackSources
    const reportText =
      lightRagReport?.content ||
      realReport?.content ||
      buildFallbackMarketReport({
        crop: cleanCrop,
        region: cleanRegion,
        question: cleanQuestion,
        results,
      })
    const reportId = saveMarketReport({
      userId: req.user?.id || null,
      crop: cleanCrop,
      region: cleanRegion,
      question: cleanQuestion,
      reportText,
      sources,
      provider,
    })

    res.json(
      ok({
        id: reportId,
        crop: cleanCrop,
        region: cleanRegion,
        question: cleanQuestion,
        reportText,
        sources,
        provider,
        generatedAt: nowIso(),
        kb: getMarketKbStats(),
      }),
    )
  } catch (error) {
    res.status(500).json(fail(error.message || '生成行情报告失败', 500))
  }
})

app.get('/api/buyer/overview', optionalAuth, async (req, res) => {
  const result = await recommendBuyersForUser({
    userId: req.user?.id || 1, // Fallback to user 1 for demo
    origin: DEFAULT_ORIGIN,
    persist: false,
    demoFallback: !req.user,
  })
  res.json(ok(result))
})

app.post('/api/buyer/recommend', requireAuth, async (req, res) => {
  const payload = req.body || {}
  const currentLocation = payload.currentLocation || {}
  const origin = {
    latitude: Number(currentLocation.latitude || DEFAULT_ORIGIN.latitude),
    longitude: Number(currentLocation.longitude || DEFAULT_ORIGIN.longitude),
    address: String(currentLocation.address || DEFAULT_ORIGIN.address),
  }

  const result = await recommendBuyersForUser({
    userId: req.user.id,
    origin,
    persist: true,
  })
  res.json(ok(result))
})

app.post('/api/buyer/interest', requireAuth, (req, res) => {
  const { merchantId, actionType, source, extraPayload } = req.body || {}
  const merchant = getMerchantCatalog().find((item) => item.id === Number(merchantId))
  if (!merchant) {
    res.status(404).json(fail('收购商不存在', 404))
    return
  }

  const allowedActions = new Set(['interest', 'navigate', 'contact', 'view'])
  const cleanAction = String(actionType || '').trim() || 'view'
  if (!allowedActions.has(cleanAction)) {
    res.status(400).json(fail('不支持的行为类型'))
    return
  }

  logBuyerInterest({
    userId: req.user.id,
    merchantId: merchant.id,
    actionType: cleanAction,
    source: String(source || 'buyer-page'),
    extraPayload: extraPayload || null,
  })

  if (['interest', 'contact'].includes(cleanAction)) {
    const actionLabel = cleanAction === 'contact' ? '联系了收购商' : '标记了感兴趣'
    createNotification({
      userId: req.user.id,
      type: 'buyer',
      title: cleanAction === 'contact' ? '买家联系记录' : '感兴趣收购商',
      content: `你已${actionLabel}：${merchant.name}。可在感兴趣列表继续跟进。`,
      source: 'buyer-action',
      sourceId: cleanAction === 'interest' ? `${cleanAction}:${merchant.id}` : `${cleanAction}:${merchant.id}:${Date.now()}`,
      linkPayload: { page: '/pages/buyer-interests/index', merchantId: merchant.id },
      dedupe: cleanAction === 'interest',
    })
  }

  res.json(ok({ success: true }))
})

app.get('/api/buyer/interests', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT
        l.id,
        l.action_type,
        l.source,
        l.extra_payload,
        l.created_at,
        m.id AS merchant_id,
        m.name,
        m.merchant_type,
        m.address,
        m.contact_phone
      FROM buyer_interest_logs l
      JOIN buyer_merchants m ON m.id = l.merchant_id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
      LIMIT 50`,
    )
    .all(req.user.id)
    .map((row) => ({
      id: row.id,
      actionType: row.action_type,
      source: row.source,
      extraPayload: row.extra_payload ? JSON.parse(row.extra_payload) : null,
      createdAt: row.created_at,
      merchant: {
        id: row.merchant_id,
        name: row.name,
        merchantType: row.merchant_type,
        address: row.address,
        contact: row.contact_phone,
      },
    }))

  res.json(ok({ list: rows }))
})

app.get('/api/map/navigation', requireAuth, (req, res) => {
  const merchantId = Number(req.query.merchantId || 0)
  const merchant = getMerchantCatalog().find((item) => item.id === merchantId)
  if (!merchant) {
    res.status(404).json(fail('收购商不存在', 404))
    return
  }

  const origin = {
    latitude: Number(req.query.originLat || DEFAULT_ORIGIN.latitude),
    longitude: Number(req.query.originLng || DEFAULT_ORIGIN.longitude),
    address: String(req.query.originAddress || DEFAULT_ORIGIN.address),
  }

  const navigation = buildNavigationPayload(merchant, origin)
  res.json(ok(navigation))
})

app.get('/api/weather/current', optionalAuth, async (req, res) => {
  const weather = await getWeatherSnapshot({
    adcode: req.query.adcode,
    latitude: req.query.latitude,
    longitude: req.query.longitude,
  })
  res.json(ok(weather))
})

app.get('/api/ads/overview', optionalAuth, (req, res) => {
  const userId = req.user?.id || 1;
  const history = getAdHistory(userId)
  res.json(
    ok({
      templates: adTemplates,
      farmProfile,
      historyList: history,
    }),
  )
})

app.get('/api/ai/history', optionalAuth, (req, res) => {
  const userId = req.user?.id || 1;
  res.json(
    ok({
      historyList: getAiDiagnosisHistory(userId),
    }),
  )
})

const handleGenerateAdMaterials = async (req, res) => {
  const payload = req.body || {}
  const legacyTemplate = payload.templateId
    ? adTemplates.find((item) => item.id === Number(payload.templateId)) || adTemplates[0]
    : null
  const productName = String(payload.productName || legacyTemplate?.title || '').trim()

  if (!productName) {
    res.status(400).json(fail('请先选择待推广产品'))
    return
  }

  const normalizedPayload = {
    ...payload,
    productName,
    goal: payload.goal || (legacyTemplate?.platform === 'douyin' ? 'video' : 'wechat'),
    sellingPoints: payload.sellingPoints || legacyTemplate?.tags || [],
  }
  const fallbackPackage = buildMarketingMaterialPackage(normalizedPayload)
  const aiResult = await callDashScopeMarketingMaterials(normalizedPayload, fallbackPackage)
  const fallbackEnabled = String(process.env.MARKETING_FALLBACK_ENABLED || 'false') === 'true'

  if (!aiResult?.package && !fallbackEnabled) {
    const isTimeout = aiResult?.error === 'timeout'
    res.status(isTimeout ? 504 : 502).json(fail(
      isTimeout ? '营销素材生成超时，请稍后重试' : '营销素材调用失败，请检查大模型配置',
      isTimeout ? 504 : 502,
      {
        provider: 'dashscope',
        reason: aiResult?.error || 'unknown',
      },
    ))
    return
  }

  const materialPackage = aiResult?.package || fallbackPackage
  const provider = aiResult?.package ? `dashscope:${aiResult.model || 'unknown'}` : 'rule-template'

  db.prepare(
    'INSERT INTO ad_history (user_id, template_id, title, content, tags, platform, engagement, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    req.user.id,
    legacyTemplate?.id || null,
    materialPackage.productTitle,
    JSON.stringify(materialPackage),
    JSON.stringify(materialPackage.tags),
    String(payload.goal || 'material-package'),
    materialPackage.completenessScore,
    provider,
    nowIso(),
  )

  res.json(ok(materialPackage))
}

app.post('/api/ads/generate', requireAuth, handleGenerateAdMaterials)
app.post('/api/ads/marketing-materials', requireAuth, handleGenerateAdMaterials)

app.post('/api/ai/diagnose', requireAuth, async (req, res) => {
  const payload = req.body || {}
  if (!payload.content && !payload.image) {
    res.status(400).json(fail('请输入症状描述或上传图片'))
    return
  }

  const realResult = await callDashScopeDiagnosis(payload)
  const fallbackEnabled = String(process.env.AI_DIAGNOSIS_FALLBACK_ENABLED || 'false') === 'true'

  if (!realResult?.content && !fallbackEnabled) {
    const isTimeout = realResult?.error === 'timeout'
    const message = isTimeout
      ? 'AI 诊断生成超时，请稍后重试或补充更聚焦的症状描述'
      : 'AI 诊断调用失败，请检查大模型配置或图片访问地址'
    res.status(isTimeout ? 504 : 502).json(fail(message, isTimeout ? 504 : 502, {
      provider: 'dashscope',
      reason: realResult?.error || 'unknown',
    }))
    return
  }

  const reply = realResult?.content || buildAiFallback(payload)
  const provider = realResult?.content ? `dashscope:${realResult.model || 'unknown'}` : 'mock-fallback'

  db.prepare(
    'INSERT INTO ai_diagnosis_history (user_id, content, image, reply, provider, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(req.user.id, String(payload.content || ''), String(payload.image || ''), reply, provider, nowIso())

  res.json(ok({ reply, provider, reasoning: realResult?.reasoning || '' }))
})

app.post('/api/oss/sign', requireAuth, (req, res) => {
  try {
    const { mimeType = 'image/jpeg', size = 0 } = req.body || {}
    const signature = buildOssPostSignature({ mimeType, size })

    if (!signature) {
      res.status(501).json(fail('OSS 尚未配置，请在 backend/.env 中补充阿里云 OSS 参数', 501))
      return
    }

    res.json(ok(signature))
  } catch (error) {
    res.status(error.statusCode || 500).json(fail(error.message || '生成 OSS 签名失败', error.statusCode || 500))
  }
})

app.post('/api/oss/record', requireAuth, (req, res) => {
  const { url, objectKey, mimeType, size } = req.body || {}
  if (!url) {
    res.status(400).json(fail('图片 URL 不能为空'))
    return
  }

  db.prepare(
    'INSERT INTO uploads (user_id, url, object_key, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(req.user.id, String(url), String(objectKey || ''), String(mimeType || ''), Number(size || 0), nowIso())

  res.json(ok({ url, objectKey }))
})

app.get('/api/notifications', optionalAuth, (req, res) => {
  const userId = req.user?.id || 1;
  const page = Math.max(1, Number(req.query.page || 1))
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)))
  const type = String(req.query.type || 'all')
  const read = String(req.query.read || 'all')
  const filters = ['(user_id = ? OR user_id IS NULL)']
  const params = [userId]

  if (type !== 'all') {
    filters.push('type = ?')
    params.push(type)
  }
  if (read === 'unread') {
    filters.push('is_read = 0')
  }

  const where = filters.join(' AND ')
  const total = db.prepare(`SELECT COUNT(*) AS count FROM notifications WHERE ${where}`).get(...params).count
  const unread = db
    .prepare('SELECT COUNT(*) AS count FROM notifications WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0')
    .get(userId).count
  const rows = db
    .prepare(`SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)

  res.json(ok({ list: rows.map(mapNotificationRow), total, unread, page, pageSize }))
})

app.post('/api/notifications/read', requireAuth, (req, res) => {
  const id = Number(req.body?.id || 0)
  if (!id) {
    res.status(400).json(fail('通知 ID 不能为空'))
    return
  }

  const result = db
    .prepare(
      `UPDATE notifications
      SET is_read = 1, read_at = ?
      WHERE id = ? AND (user_id = ? OR user_id IS NULL)`,
    )
    .run(nowIso(), id, req.user.id)

  res.json(ok({ success: result.changes > 0 }))
})

app.post('/api/notifications/read-all', requireAuth, (req, res) => {
  const type = String(req.body?.type || 'all')
  const params = [nowIso(), req.user.id]
  let sql = `UPDATE notifications SET is_read = 1, read_at = ? WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0`
  if (type !== 'all') {
    sql += ' AND type = ?'
    params.push(type)
  }

  const result = db.prepare(sql).run(...params)
  res.json(ok({ success: true, changed: result.changes }))
})

app.use('/api/admin', adminRoutes)

app.post('/api/demo/reset', requireAuth, (_req, res) => {
  resetDemoData()
  res.json(ok({ success: true }, '演示数据已重置'))
})

app.use((req, res) => {
  res.status(404).json(fail(`接口不存在: ${req.method} ${req.path}`, 404))
})

initDb()
initForecastDb()
ensureMarketSeedData()
ensureForecastSeedData()
ensureBuyerSeedData()

const demoPhone = process.env.DEMO_PHONE || '13800138000'
if (!findUserByPhone(demoPhone)) {
  db.prepare('INSERT INTO users (phone, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
    demoPhone,
    passwordHash(process.env.DEMO_PASSWORD || '123456'),
    process.env.DEMO_NICKNAME || '演示农户',
    'demo',
    nowIso(),
  )
}
seedSystemNotificationForUser(findUserByPhone(demoPhone))

app.listen(PORT, () => {
  console.log(`AgriCloud API listening on http://127.0.0.1:${PORT}`)
})

// === market-price-forecast: 启动后注册 cron 调度（Phase 1 任务 4.2.3）===
// 仅在 SCHEDULER_ENABLED !== 'false' 时启用；测试与维护期可一键关闭。
// urlBuilder 这里默认不配置：运营层未补 URL 模板时所有采集会 skipped，
// 这是预期行为（避免在没有运营审阅的情况下自动抓取公网）。
try {
  const scheduler = require('./lib/scheduler')
  const start = scheduler.start({})
  if (!start.started) {
    console.log('[scheduler] not started:', start.reason || 'unknown')
  }
} catch (err) {
  console.error('[scheduler] failed to register cron tasks:', err?.message)
}
