const adminService = require('../services/admin.service')

const ok = (data = null, message = 'ok') => ({ code: 0, message, data })
const fail = (message, code = 400, data = null) => ({ code, message, data })

const handle = (fn) => async (req, res) => {
  try {
    const { data, message } = await fn(req)
    res.json(ok(data, message || 'ok'))
  } catch (error) {
    const status = Number(error.statusCode || error.status || 500)
    res.status(status).json(fail(error.message || '服务器错误', status))
  }
}

module.exports = {
  getDashboard: handle(async () => ({ data: await adminService.getDashboard() })),
  getUsers: handle(async () => ({ data: { list: adminService.getUsers() } })),
  updateUserRole: handle(async (req) => ({
    data: adminService.updateUserRole({
      currentUserId: req.user.id,
      userId: Number(req.body?.userId || 0),
      role: String(req.body?.role || '').trim(),
    }),
  })),
  getSpus: handle(async () => ({ data: { list: adminService.getSpus() } })),
  getMerchants: handle(async (req) => ({
    data: { list: adminService.getMerchants({ status: String(req.query.status || 'all') }) },
  })),
  createMerchant: handle(async (req) => ({
    data: adminService.createMerchant({ payload: req.body || {}, userId: req.user.id }),
  })),
  updateMerchant: handle(async (req) => ({
    data: adminService.updateMerchant({ payload: req.body || {}, userId: req.user.id }),
  })),
  deleteMerchant: handle(async (req) => ({
    data: adminService.deleteMerchant({ id: Number(req.body?.id || req.query.id || 0), userId: req.user.id }),
  })),
  auditMerchant: handle(async (req) => ({
    data: adminService.auditMerchant({ payload: req.body || {}, userId: req.user.id }),
  })),
  getMarketItems: handle(async () => ({ data: { list: adminService.getMarketItems() } })),
  createMarketItem: handle(async (req) => ({
    data: adminService.createMarketItem({ payload: req.body || {}, userId: req.user.id }),
  })),
  updateMarketItem: handle(async (req) => ({
    data: adminService.updateMarketItem({ payload: req.body || {}, userId: req.user.id }),
  })),
  deleteMarketItem: handle(async (req) => ({
    data: adminService.deleteMarketItem({ id: Number(req.body?.id || req.query.id || 0), userId: req.user.id }),
  })),
  getNotifications: handle(async (req) => ({
    data: {
      list: adminService.getNotifications({
        type: String(req.query.type || 'all'),
        read: String(req.query.read || 'all'),
      }),
    },
  })),
  createNotification: handle(async (req) => ({
    data: adminService.createAdminNotification({ payload: req.body || {}, userId: req.user.id }),
  })),
  markNotificationsReadAll: handle(async (req) => ({
    data: adminService.markNotificationsReadAll({ type: String(req.body?.type || 'all') }),
  })),
  getForecastRuns: handle(async (req) => ({
    data: { list: adminService.getForecastRuns({ limit: Math.min(100, Math.max(1, Number(req.query.limit || 20))) }) },
  })),
  runForecast: handle(async (req) => ({
    data: await adminService.runForecast({ payload: req.body || {}, userId: req.user.id }),
  })),
  getCollectionLogs: handle(async (req) => ({
    data: {
      list: adminService.getCollectionLogs({ limit: Math.min(100, Math.max(1, Number(req.query.limit || 20))) }),
    },
  })),
  getAuditLogs: handle(async (req) => ({
    data: { list: adminService.getAuditLogs({ limit: Math.min(100, Math.max(1, Number(req.query.limit || 20))) }) },
  })),
  crawlRag: handle(async (req) => ({
    data: await adminService.crawlRag({ userId: req.user.id }),
    message: '知识库同步完成',
  })),
  resetDemo: handle(async (req) => ({
    data: adminService.resetDemo({ userId: req.user.id }),
    message: '演示数据已重置',
  })),
}
