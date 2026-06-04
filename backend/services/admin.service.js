const { db, nowIso, resetDemoData } = require('../lib/db')
const { crawlAllMarketKb } = require('../lib/market-rag')
const { getLightRagStatus } = require('../lib/lightrag-client')
const { readLatestActive, forecastOne } = require('../lib/forecast-engine')

const ADMIN_EDITABLE_ROLES = ['user', 'demo', 'admin']
const DEFAULT_ORIGIN = { latitude: 37.4647, longitude: 121.4479 }

const parseJsonSafe = (value, fallback = null) => {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (_error) {
    return fallback
  }
}

const countBySql = (sql, ...params) => Number(db.prepare(sql).get(...params)?.count || 0)
const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode })

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

const marketItemRowToView = (row) => ({
  id: row.id,
  spuId: row.spu_id || undefined,
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
  userOwned: Number(row.user_owned || 0) === 1,
  source: row.source || 'admin',
  status: row.status || 'active',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const createNotification = ({
  userId = null,
  type = 'system',
  title,
  content,
  source = 'admin',
  sourceId = null,
  linkPayload = null,
}) => {
  const cleanTitle = String(title || '').trim()
  const cleanContent = String(content || '').trim()
  if (!cleanTitle || !cleanContent) return null

  const result = db
    .prepare(
      `INSERT INTO notifications (
        user_id, type, title, content, source, source_id, link_payload, is_read, read_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
    )
    .run(
      userId == null ? null : Number(userId),
      String(type || 'system'),
      cleanTitle,
      cleanContent,
      String(source || 'admin'),
      sourceId == null ? null : String(sourceId),
      linkPayload ? JSON.stringify(linkPayload) : null,
      nowIso(),
    )
  return Number(result.lastInsertRowid)
}

const logAdminAction = ({ userId, actionType, resourceType, resourceId = null, detail = null }) => {
  db.prepare(
    `INSERT INTO admin_audit_logs (user_id, action_type, resource_type, resource_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, actionType, resourceType, resourceId == null ? null : String(resourceId), detail, nowIso())
}

const getModelServiceStatus = async () => {
  const baseUrl = String(process.env.MODEL_SERVICE_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')
  const timeoutMs = Math.min(5000, Math.max(1000, Number(process.env.MODEL_SERVICE_TIMEOUT_MS || 3000)))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}/health`, { method: 'GET', signal: controller.signal })
    return {
      enabled: true,
      healthy: response.ok,
      baseUrl,
      status: response.status,
      detail: response.ok ? '模型预测服务运行正常' : `模型预测服务返回 ${response.status}`,
      sharedSecretConfigured: Boolean(String(process.env.MODEL_SERVICE_SHARED_SECRET || '').trim()),
    }
  } catch (error) {
    return {
      enabled: true,
      healthy: false,
      baseUrl,
      detail: `模型预测服务不可用：${error?.message || 'unknown error'}`,
      sharedSecretConfigured: Boolean(String(process.env.MODEL_SERVICE_SHARED_SECRET || '').trim()),
    }
  } finally {
    clearTimeout(timer)
  }
}

const getDashboard = async () => {
  const overview = {
    userCount: countBySql('SELECT COUNT(*) AS count FROM users'),
    cropCount: countBySql('SELECT COUNT(*) AS count FROM crops'),
    merchantCount: countBySql('SELECT COUNT(*) AS count FROM buyer_merchants'),
    activeMerchantCount: countBySql("SELECT COUNT(*) AS count FROM buyer_merchants WHERE status = 'active'"),
    pendingMerchantCount: countBySql("SELECT COUNT(*) AS count FROM buyer_merchants WHERE status = 'pending'"),
    marketItemCount: countBySql('SELECT COUNT(*) AS count FROM market_items'),
    activeMarketItemCount: countBySql("SELECT COUNT(*) AS count FROM market_items WHERE status = 'active'"),
    unreadNotificationCount: countBySql('SELECT COUNT(*) AS count FROM notifications WHERE is_read = 0'),
    aiDiagnosisCount: countBySql('SELECT COUNT(*) AS count FROM ai_diagnosis_history'),
    adHistoryCount: countBySql('SELECT COUNT(*) AS count FROM ad_history'),
    buyerInterestCount: countBySql('SELECT COUNT(*) AS count FROM buyer_interest_logs'),
    marketDocumentCount: countBySql('SELECT COUNT(*) AS count FROM market_documents'),
    marketChunkCount: countBySql('SELECT COUNT(*) AS count FROM market_chunks'),
    marketReportCount: countBySql('SELECT COUNT(*) AS count FROM market_reports'),
    priceHistoryCount: countBySql('SELECT COUNT(*) AS count FROM price_history'),
    forecastRunCount: countBySql('SELECT COUNT(*) AS count FROM forecast_runs'),
    adminAuditLogCount: countBySql('SELECT COUNT(*) AS count FROM admin_audit_logs'),
  }

  const latestForecast = db
    .prepare(
      `SELECT fr.generated_at, fr.status, st.display_name
       FROM forecast_runs fr
       LEFT JOIN spu_tuples st ON st.spu_id = fr.spu_id
       ORDER BY fr.generated_at DESC
       LIMIT 1`,
    )
    .get()

  const recentNotifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 6').all().map(mapNotificationRow)
  const recentReports = db
    .prepare(
      `SELECT id, crop_name, region, question, provider, retrieved_sources_json, created_at
       FROM market_reports
       ORDER BY created_at DESC
       LIMIT 5`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      crop: row.crop_name,
      region: row.region || '',
      question: row.question,
      provider: row.provider,
      sourceCount: parseJsonSafe(row.retrieved_sources_json, []).length,
      createdAt: row.created_at,
    }))
  const topMarketItems = db
    .prepare("SELECT * FROM market_items WHERE status = 'active' ORDER BY ABS(change_percent) DESC, updated_at DESC LIMIT 6")
    .all()
    .map(marketItemRowToView)

  const lightRagStatus = await getLightRagStatus()
  const modelServiceStatus = await getModelServiceStatus()

  return {
    overview,
    services: {
      api: {
        enabled: true,
        healthy: true,
        detail: 'Node.js API 服务运行中',
        baseUrl: `http://127.0.0.1:${Number(process.env.PORT || 3000)}/api`,
      },
      scheduler: {
        enabled: String(process.env.SCHEDULER_ENABLED || 'true') !== 'false',
        healthy: true,
        detail:
          String(process.env.SCHEDULER_ENABLED || 'true') !== 'false'
            ? '价格采集与预测调度已启用'
            : '价格采集与预测调度已关闭',
      },
      modelService: {
        ...modelServiceStatus,
        latestForecastAt: latestForecast?.generated_at || '',
        latestForecastTarget: latestForecast?.display_name || '',
        latestForecastStatus: latestForecast?.status || '',
      },
      lightRag: {
        ...lightRagStatus,
        detail: lightRagStatus.enabled
          ? lightRagStatus.healthy
            ? 'LightRAG 服务运行正常'
            : lightRagStatus.error || 'LightRAG 服务不可用'
          : 'LightRAG 未启用，系统将回退到本地规则报告',
      },
    },
    recentNotifications,
    recentReports,
    topMarketItems,
  }
}

const getUsers = () =>
  db
    .prepare(
      `SELECT u.id, u.phone, u.nickname, u.role, u.created_at,
        COALESCE(c.crop_count, 0) AS crop_count,
        COALESCE(ai.diagnosis_count, 0) AS diagnosis_count,
        COALESCE(ad.ad_count, 0) AS ad_count,
        COALESCE(notif.unread_count, 0) AS unread_count,
        COALESCE(interest.interest_count, 0) AS interest_count
       FROM users u
       LEFT JOIN (SELECT user_id, COUNT(*) AS crop_count FROM crops GROUP BY user_id) c ON c.user_id = u.id
       LEFT JOIN (SELECT user_id, COUNT(*) AS diagnosis_count FROM ai_diagnosis_history GROUP BY user_id) ai ON ai.user_id = u.id
       LEFT JOIN (SELECT user_id, COUNT(*) AS ad_count FROM ad_history GROUP BY user_id) ad ON ad.user_id = u.id
       LEFT JOIN (SELECT user_id, COUNT(*) AS unread_count FROM notifications WHERE is_read = 0 GROUP BY user_id) notif ON notif.user_id = u.id
       LEFT JOIN (SELECT user_id, COUNT(*) AS interest_count FROM buyer_interest_logs GROUP BY user_id) interest ON interest.user_id = u.id
       ORDER BY u.id DESC`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      phone: row.phone,
      nickname: row.nickname,
      role: row.role,
      createdAt: row.created_at,
      cropCount: Number(row.crop_count || 0),
      diagnosisCount: Number(row.diagnosis_count || 0),
      adCount: Number(row.ad_count || 0),
      unreadCount: Number(row.unread_count || 0),
      interestCount: Number(row.interest_count || 0),
    }))

const updateUserRole = ({ currentUserId, userId, role }) => {
  if (!userId || !role) throw httpError('用户 ID 和角色不能为空')
  if (!ADMIN_EDITABLE_ROLES.includes(role)) throw httpError(`仅支持以下角色：${ADMIN_EDITABLE_ROLES.join(' / ')}`)
  if (Number(currentUserId || 0) === Number(userId) && !['admin', 'demo'].includes(role)) {
    throw httpError('不能将当前登录管理员降级为普通用户')
  }

  const result = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId)
  if (!result.changes) throw httpError('用户不存在', 404)
  logAdminAction({ userId: currentUserId, actionType: 'update_role', resourceType: 'user', resourceId: userId, detail: `修改用户角色为 ${role}` })
  return { success: true, userId, role }
}

const getSpus = () =>
  db
    .prepare(
      `SELECT s.spu_id, s.display_name, s.status, o.display_name AS origin_name, v.display_name AS variety_name,
        g.display_name AS grade_name, u.display_name AS unit_name
       FROM spu_tuples s
       JOIN origins o ON o.id = s.origin_id
       JOIN varieties v ON v.id = s.variety_id
       JOIN grades g ON g.id = s.grade_id
       JOIN units u ON u.id = s.unit_id
       ORDER BY s.updated_at DESC, s.display_name ASC`,
    )
    .all()
    .map((row) => ({
      spuId: row.spu_id,
      displayName: row.display_name,
      status: row.status,
      originName: row.origin_name,
      varietyName: row.variety_name,
      gradeName: row.grade_name,
      unitName: row.unit_name,
    }))

const getMerchants = ({ status = 'all' } = {}) => {
  let sql = `SELECT m.*, o.id AS offer_id, o.crop_name, o.price, o.demand, o.unit, o.min_quantity
             FROM buyer_merchants m
             LEFT JOIN buyer_offers o ON o.merchant_id = m.id`
  const params = []
  if (status && status !== 'all') {
    sql += ' WHERE m.status = ?'
    params.push(status)
  }
  sql += ` ORDER BY CASE m.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 WHEN 'active' THEN 2 ELSE 3 END, m.id DESC, o.id ASC`

  const catalog = new Map()
  db.prepare(sql).all(...params).forEach((row) => {
    if (!catalog.has(row.id)) {
      catalog.set(row.id, {
        id: row.id,
        name: row.name,
        merchantType: row.merchant_type,
        contactName: row.contact_name || '',
        contactPhone: row.contact_phone,
        address: row.address,
        district: row.district || '',
        latitude: Number(row.latitude || 0),
        longitude: Number(row.longitude || 0),
        rating: Number(row.rating || 4.5),
        ordersCount: Number(row.orders_count || 0),
        badge: row.badge || '推荐',
        businessHours: row.business_hours || '',
        sourcePlatform: row.source_platform || '',
        sourceUrl: row.source_url || '',
        sourceNote: row.source_note || '',
        status: row.status || 'active',
        reviewNote: row.review_note || '',
        reviewedAt: row.reviewed_at || '',
        reviewedBy: row.reviewed_by == null ? null : Number(row.reviewed_by),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        offers: [],
      })
    }
    if (row.offer_id) {
      catalog.get(row.id).offers.push({
        id: row.offer_id,
        cropName: row.crop_name,
        price: Number(row.price || 0),
        demand: Number(row.demand || 0),
        unit: row.unit || '斤',
        minQuantity: Number(row.min_quantity || 0),
      })
    }
  })
  return Array.from(catalog.values())
}

const saveMerchantOffers = (merchantId, offers, now) => {
  db.prepare('DELETE FROM buyer_offers WHERE merchant_id = ?').run(merchantId)
  const insertOffer = db.prepare(
    `INSERT INTO buyer_offers (merchant_id, crop_name, price, demand, unit, min_quantity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  ;(Array.isArray(offers) ? offers : []).forEach((offer) => {
    const cropName = String(offer.cropName || '').trim()
    if (!cropName) return
    insertOffer.run(merchantId, cropName, Number(offer.price || 0), Number(offer.demand || 0), String(offer.unit || '斤'), Number(offer.minQuantity || 0), now, now)
  })
}

const createMerchant = ({ payload, userId }) => {
  const name = String(payload.name || '').trim()
  if (!name) throw httpError('收购商名称不能为空')
  const now = nowIso()
  const result = db
    .prepare(
      `INSERT INTO buyer_merchants (
        name, merchant_type, contact_name, contact_phone, address, district, latitude, longitude,
        rating, orders_count, badge, business_hours, source_platform, source_url, source_note, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      String(payload.merchantType || 'comprehensive'),
      String(payload.contactName || ''),
      String(payload.contactPhone || '平台沟通'),
      String(payload.address || ''),
      String(payload.district || ''),
      Number(payload.latitude || DEFAULT_ORIGIN.latitude),
      Number(payload.longitude || DEFAULT_ORIGIN.longitude),
      Number(payload.rating || 4.5),
      Number(payload.ordersCount || 0),
      String(payload.badge || '推荐'),
      String(payload.businessHours || ''),
      String(payload.sourcePlatform || '后台维护'),
      String(payload.sourceUrl || ''),
      String(payload.sourceNote || ''),
      String(payload.status || 'pending'),
      now,
      now,
    )
  const merchantId = Number(result.lastInsertRowid)
  saveMerchantOffers(merchantId, payload.offers, now)
  logAdminAction({ userId, actionType: 'create', resourceType: 'merchant', resourceId: merchantId, detail: `新增商户: ${name}` })
  return { id: merchantId }
}

const updateMerchant = ({ payload, userId }) => {
  const id = Number(payload.id || 0)
  const name = String(payload.name || '').trim()
  if (!id || !name) throw httpError('收购商 ID 和名称不能为空')
  const now = nowIso()
  const result = db
    .prepare(
      `UPDATE buyer_merchants SET
        name = ?, merchant_type = ?, contact_name = ?, contact_phone = ?, address = ?, district = ?,
        latitude = ?, longitude = ?, rating = ?, orders_count = ?, badge = ?, business_hours = ?,
        source_platform = ?, source_url = ?, source_note = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      name,
      String(payload.merchantType || 'comprehensive'),
      String(payload.contactName || ''),
      String(payload.contactPhone || '平台沟通'),
      String(payload.address || ''),
      String(payload.district || ''),
      Number(payload.latitude || DEFAULT_ORIGIN.latitude),
      Number(payload.longitude || DEFAULT_ORIGIN.longitude),
      Number(payload.rating || 4.5),
      Number(payload.ordersCount || 0),
      String(payload.badge || '推荐'),
      String(payload.businessHours || ''),
      String(payload.sourcePlatform || ''),
      String(payload.sourceUrl || ''),
      String(payload.sourceNote || ''),
      String(payload.status || 'active'),
      now,
      id,
    )
  saveMerchantOffers(id, payload.offers, now)
  logAdminAction({ userId, actionType: 'update', resourceType: 'merchant', resourceId: id, detail: `更新商户信息: ${name}` })
  return { success: result.changes > 0 }
}

const deleteMerchant = ({ id, userId }) => {
  if (!id) throw httpError('收购商 ID 不能为空')
  db.prepare("UPDATE buyer_merchants SET status = 'inactive', updated_at = ? WHERE id = ?").run(nowIso(), id)
  logAdminAction({ userId, actionType: 'delete', resourceType: 'merchant', resourceId: id, detail: '停用商户' })
  return { success: true }
}

const auditMerchant = ({ payload, userId }) => {
  const id = Number(payload.id || 0)
  const status = String(payload.status || '').trim()
  const reviewNote = String(payload.reviewNote || '').trim()
  if (!id || !status) throw httpError('商户 ID 和审核状态不能为空')
  if (!['pending', 'active', 'rejected', 'inactive'].includes(status)) {
    throw httpError('审核状态仅支持 pending / active / rejected / inactive')
  }
  const result = db
    .prepare('UPDATE buyer_merchants SET status = ?, review_note = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?')
    .run(status, reviewNote, nowIso(), userId, nowIso(), id)
  if (!result.changes) throw httpError('商户不存在', 404)
  logAdminAction({ userId, actionType: 'audit', resourceType: 'merchant', resourceId: id, detail: `审核商户: 状态改为 ${status}, 备注: ${reviewNote}` })
  return { success: true, id, status }
}

const getMarketItems = () => db.prepare('SELECT * FROM market_items ORDER BY id DESC').all().map(marketItemRowToView)

const createMarketItem = ({ payload, userId }) => {
  const name = String(payload.name || '').trim()
  if (!name) throw httpError('作物名称不能为空')
  const now = nowIso()
  const result = db
    .prepare(
      `INSERT INTO market_items (
        name, current_price, unit, change_percent, trend, prediction, advice, market_status,
        avg_price, high_price, low_price, week_volume, month_volume, user_owned, source, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      Number(payload.currentPrice || 0),
      String(payload.unit || '斤'),
      Number(payload.change || 0),
      String(payload.trend || 'stable'),
      String(payload.prediction || '价格走势待观察'),
      String(payload.advice || '建议结合本地询价分批出货'),
      String(payload.marketStatus || '供需平衡'),
      Number(payload.avgPrice || payload.currentPrice || 0),
      Number(payload.highPrice || payload.currentPrice || 0),
      Number(payload.lowPrice || payload.currentPrice || 0),
      Number(payload.weekVolume || 0),
      Number(payload.monthVolume || 0),
      payload.userOwned ? 1 : 0,
      String(payload.source || 'admin'),
      String(payload.status || 'active'),
      now,
      now,
    )
  logAdminAction({ userId, actionType: 'create', resourceType: 'market_item', resourceId: result.lastInsertRowid, detail: `新增行情: ${name}` })
  return { id: Number(result.lastInsertRowid) }
}

const updateMarketItem = ({ payload, userId }) => {
  const id = Number(payload.id || 0)
  const name = String(payload.name || '').trim()
  if (!id || !name) throw httpError('行情 ID 和作物名称不能为空')
  const result = db
    .prepare(
      `UPDATE market_items SET
        name = ?, current_price = ?, unit = ?, change_percent = ?, trend = ?, prediction = ?, advice = ?,
        market_status = ?, avg_price = ?, high_price = ?, low_price = ?, week_volume = ?, month_volume = ?,
        user_owned = ?, source = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      name,
      Number(payload.currentPrice || 0),
      String(payload.unit || '斤'),
      Number(payload.change || 0),
      String(payload.trend || 'stable'),
      String(payload.prediction || ''),
      String(payload.advice || ''),
      String(payload.marketStatus || ''),
      Number(payload.avgPrice || 0),
      Number(payload.highPrice || 0),
      Number(payload.lowPrice || 0),
      Number(payload.weekVolume || 0),
      Number(payload.monthVolume || 0),
      payload.userOwned ? 1 : 0,
      String(payload.source || 'admin'),
      String(payload.status || 'active'),
      nowIso(),
      id,
    )
  logAdminAction({ userId, actionType: 'update', resourceType: 'market_item', resourceId: id, detail: `更新行情: ${name}` })
  return { success: result.changes > 0 }
}

const deleteMarketItem = ({ id, userId }) => {
  if (!id) throw httpError('行情 ID 不能为空')
  db.prepare("UPDATE market_items SET status = 'inactive', updated_at = ? WHERE id = ?").run(nowIso(), id)
  logAdminAction({ userId, actionType: 'delete', resourceType: 'market_item', resourceId: id, detail: '停用行情' })
  return { success: true }
}

const getNotifications = ({ type = 'all', read = 'all' } = {}) => {
  const filters = ['1 = 1']
  const params = []
  if (type !== 'all') {
    filters.push('type = ?')
    params.push(type)
  }
  if (read === 'unread') filters.push('is_read = 0')
  return db.prepare(`SELECT * FROM notifications WHERE ${filters.join(' AND ')} ORDER BY created_at DESC LIMIT 100`).all(...params).map(mapNotificationRow)
}

const createAdminNotification = ({ payload, userId }) => {
  const id = createNotification({
    userId: payload.userId ? Number(payload.userId) : null,
    type: String(payload.type || 'system'),
    title: payload.title,
    content: payload.content,
    source: String(payload.source || 'admin'),
    sourceId: payload.sourceId ? String(payload.sourceId) : null,
    linkPayload: payload.linkPayload || { page: '/pages/notification/index' },
  })
  if (!id) throw httpError('通知标题和内容不能为空')
  logAdminAction({ userId, actionType: 'create', resourceType: 'notification', resourceId: id, detail: `发布通知: ${payload.title}` })
  return { id }
}

const markNotificationsReadAll = ({ type = 'all' } = {}) => {
  const params = [nowIso()]
  let sql = 'UPDATE notifications SET is_read = 1, read_at = ? WHERE is_read = 0'
  if (type !== 'all') {
    sql += ' AND type = ?'
    params.push(type)
  }
  const result = db.prepare(sql).run(...params)
  return { success: true, changed: result.changes }
}

const getForecastRuns = ({ limit = 20 } = {}) =>
  db
    .prepare(
      `SELECT fr.id, fr.request_id, fr.spu_id, fr.origin_date, fr.horizon_days, fr.status,
        fr.model_families_json, fr.point_estimates_json, fr.borrowed_history_flag, fr.generated_at,
        fr.inference_ms, st.display_name
       FROM forecast_runs fr
       LEFT JOIN spu_tuples st ON st.spu_id = fr.spu_id
       ORDER BY fr.generated_at DESC
       LIMIT ?`,
    )
    .all(Number(limit || 20))
    .map((row) => {
      const point = parseJsonSafe(row.point_estimates_json, [])
      return {
        id: row.id,
        requestId: row.request_id,
        spuId: row.spu_id,
        displayName: row.display_name || row.spu_id,
        originDate: row.origin_date,
        horizonDays: Number(row.horizon_days || 0),
        status: row.status,
        modelFamilies: parseJsonSafe(row.model_families_json, []),
        borrowedHistoryFlag: Number(row.borrowed_history_flag) === 1,
        generatedAt: row.generated_at,
        inferenceMs: Number(row.inference_ms || 0),
        pointPreview: Array.isArray(point) ? point.slice(0, 3) : [],
      }
    })

const runForecast = async ({ payload, userId }) => {
  const spuId = String(payload.spuId || '').trim()
  const horizonDays = Number(payload.horizonDays || 7)
  if (!spuId) throw httpError('SPU ID 不能为空')
  if (![7, 30].includes(horizonDays)) throw httpError('预测周期仅支持 7 天或 30 天')
  const exists = db.prepare('SELECT spu_id FROM spu_tuples WHERE spu_id = ? AND status = ?').get(spuId, 'active')
  if (!exists) throw httpError('SPU 不存在或未启用', 404)
  const result = await forecastOne({ spuId, horizonDays })
  const latest = readLatestActive(spuId, horizonDays)
  logAdminAction({ userId, actionType: 'run_forecast', resourceType: 'forecast', resourceId: spuId, detail: `手动执行预测: ${horizonDays}天周期` })
  return { result, latest }
}

const getCollectionLogs = ({ limit = 20 } = {}) =>
  db
    .prepare(
      `SELECT cl.id, cl.request_id, cl.spu_id, cl.source_name, cl.source_url, cl.status, cl.http_status,
        cl.duration_ms, cl.reason, cl.triggered_by, cl.triggered_user_id, cl.created_at, st.display_name
       FROM collection_logs cl
       LEFT JOIN spu_tuples st ON st.spu_id = cl.spu_id
       ORDER BY cl.created_at DESC
       LIMIT ?`,
    )
    .all(Number(limit || 20))
    .map((row) => ({
      id: row.id,
      requestId: row.request_id,
      spuId: row.spu_id || '',
      displayName: row.display_name || row.spu_id || '全量任务',
      sourceName: row.source_name,
      sourceUrl: row.source_url || '',
      status: row.status,
      httpStatus: row.http_status == null ? null : Number(row.http_status),
      durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
      reason: row.reason || '',
      triggeredBy: row.triggered_by,
      triggeredUserId: row.triggered_user_id == null ? null : Number(row.triggered_user_id),
      createdAt: row.created_at,
    }))

const getAuditLogs = ({ limit = 50 } = {}) =>
  db
    .prepare(
      `SELECT l.*, u.nickname, u.phone
       FROM admin_audit_logs l
       JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC
       LIMIT ?`,
    )
    .all(Number(limit || 50))
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      userNickname: row.nickname,
      userPhone: row.phone,
      actionType: row.action_type,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      detail: row.detail,
      createdAt: row.created_at,
    }))

const crawlRag = async ({ userId }) => {
  const stats = await crawlAllMarketKb()
  logAdminAction({ userId, actionType: 'sync_rag', resourceType: 'knowledge_base', detail: `手动同步知识库: 文档 ${stats.totalDocs}, 切片 ${stats.totalChunks}` })
  return stats
}

const resetDemo = ({ userId }) => {
  resetDemoData()
  logAdminAction({ userId, actionType: 'reset_demo', resourceType: 'system', detail: '重置全系统演示数据' })
  return { success: true }
}

module.exports = {
  getDashboard,
  getUsers,
  updateUserRole,
  getSpus,
  getMerchants,
  createMerchant,
  updateMerchant,
  deleteMerchant,
  auditMerchant,
  getMarketItems,
  createMarketItem,
  updateMarketItem,
  deleteMarketItem,
  getNotifications,
  createAdminNotification,
  markNotificationsReadAll,
  getForecastRuns,
  runForecast,
  getCollectionLogs,
  getAuditLogs,
  crawlRag,
  resetDemo,
}
