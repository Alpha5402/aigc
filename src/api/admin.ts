import { http } from '../utils/request'
import type { MarketCropItem, NotificationItem, NotificationQuery } from './agri'

const API_BASE_URL = 'https://agricloud-api.onrender.com/api'

const apiPath = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export interface AdminDashboardOverview {
  userCount: number
  cropCount: number
  merchantCount: number
  activeMerchantCount: number
  pendingMerchantCount: number
  marketItemCount: number
  activeMarketItemCount: number
  unreadNotificationCount: number
  aiDiagnosisCount: number
  adHistoryCount: number
  buyerInterestCount: number
  marketDocumentCount: number
  marketChunkCount: number
  marketReportCount: number
  priceHistoryCount: number
  forecastRunCount: number
  adminAuditLogCount: number
}

export interface AdminServiceStatus {
  enabled: boolean
  healthy: boolean
  detail: string
  baseUrl?: string
  status?: number
  error?: string
  sharedSecretConfigured?: boolean
  latestForecastAt?: string
  latestForecastTarget?: string
  latestForecastStatus?: string
  documentStatusCounts?: Record<string, number> | null
}

export interface AdminDashboardReportItem {
  id: number
  crop: string
  region: string
  question: string
  provider: string
  sourceCount: number
  createdAt: string
}

export interface AdminDashboardData {
  overview: AdminDashboardOverview
  services: {
    api: AdminServiceStatus
    scheduler: AdminServiceStatus
    modelService: AdminServiceStatus
    lightRag: AdminServiceStatus
  }
  recentNotifications: NotificationItem[]
  recentReports: AdminDashboardReportItem[]
  topMarketItems: AdminMarketItem[]
}

export interface AdminUserItem {
  id: number
  phone: string
  nickname: string
  role: string
  createdAt: string
  cropCount: number
  diagnosisCount: number
  adCount: number
  unreadCount: number
  interestCount: number
}

export interface UpdateAdminUserRolePayload {
  userId: number
  role: 'user' | 'demo' | 'admin' | string
}

export interface AdminSpuItem {
  spuId: string
  displayName: string
  status: string
  originName: string
  varietyName: string
  gradeName: string
  unitName: string
}

export interface AdminForecastRunItem {
  id: number
  requestId: string
  spuId: string
  displayName: string
  originDate: string
  horizonDays: number
  status: string
  modelFamilies: string[]
  borrowedHistoryFlag: boolean
  generatedAt: string
  inferenceMs: number
  pointPreview: number[]
}

export interface AdminCollectionLogItem {
  id: number
  requestId: string
  spuId: string
  displayName: string
  sourceName: string
  sourceUrl: string
  status: string
  httpStatus: number | null
  durationMs: number | null
  reason: string
  triggeredBy: string
  triggeredUserId: number | null
  createdAt: string
}

export interface AdminAuditLogItem {
  id: number
  userId: number
  userNickname: string
  userPhone: string
  actionType: string
  resourceType: string
  resourceId: string | null
  detail: string | null
  createdAt: string
}

export interface AdminMerchantOffer {
  id?: number
  cropName: string
  price: number
  demand: number
  unit: string
  minQuantity: number
}

export interface AdminMerchantItem {
  id?: number
  name: string
  merchantType: 'supplier' | 'purchaser' | 'comprehensive' | string
  contactName: string
  contactPhone: string
  address: string
  district: string
  latitude: number
  longitude: number
  rating: number
  ordersCount: number
  badge: string
  businessHours: string
  sourcePlatform: string
  sourceUrl: string
  sourceNote: string
  status: 'pending' | 'active' | 'inactive' | 'rejected' | string
  reviewNote?: string
  reviewedAt?: string
  reviewedBy?: number | null
  offers: AdminMerchantOffer[]
}

export interface AdminMarketItem extends MarketCropItem {
  status?: 'active' | 'inactive' | string
  createdAt?: string
  updatedAt?: string
}

export const getAdminDashboard = () => http.get<AdminDashboardData>(apiPath('/admin/dashboard'))
export const getAdminUsers = () => http.get<{ list: AdminUserItem[] }>(apiPath('/admin/users'))
export const updateAdminUserRole = (payload: UpdateAdminUserRolePayload) =>
  http.put<{ success: boolean; userId: number; role: string }, UpdateAdminUserRolePayload>(apiPath('/admin/users/role'), payload)
export const getAdminSpus = () => http.get<{ list: AdminSpuItem[] }>(apiPath('/admin/spus'))
export const getAdminMerchants = (params?: { status?: string }) =>
  http.get<{ list: AdminMerchantItem[] }>(apiPath('/admin/merchants'), params)
export const saveAdminMerchant = (merchant: AdminMerchantItem) =>
  merchant.id
    ? http.put<{ success: boolean }, AdminMerchantItem>(apiPath('/admin/merchants'), merchant)
    : http.post<{ id: number }, AdminMerchantItem>(apiPath('/admin/merchants'), merchant)
export const deleteAdminMerchant = (id: number) =>
  http.delete<{ success: boolean }, { id: number }>(apiPath('/admin/merchants'), { id })
export const auditAdminMerchant = (payload: {
  id: number
  status: 'pending' | 'active' | 'rejected' | 'inactive' | string
  reviewNote?: string
}) => http.post<{ success: boolean; id: number; status: string }, typeof payload>(apiPath('/admin/merchants/audit'), payload)
export const getAdminMarketItems = () => http.get<{ list: AdminMarketItem[] }>(apiPath('/admin/market-items'))
export const saveAdminMarketItem = (item: AdminMarketItem) =>
  item.id
    ? http.put<{ success: boolean }, AdminMarketItem>(apiPath('/admin/market-items'), item)
    : http.post<{ id: number }, AdminMarketItem>(apiPath('/admin/market-items'), item)
export const deleteAdminMarketItem = (id: number) =>
  http.delete<{ success: boolean }, { id: number }>(apiPath('/admin/market-items'), { id })
export const getAdminNotifications = (query?: NotificationQuery) =>
  http.get<{ list: NotificationItem[] }>(apiPath('/admin/notifications'), query)
export const createAdminNotification = (payload: {
  userId?: number | null
  type: string
  title: string
  content: string
  source?: string
  sourceId?: string
}) => http.post<{ id: number }, typeof payload>(apiPath('/admin/notifications'), payload)
export const markAllAdminNotificationsRead = (type = 'all') =>
  http.post<{ success: boolean; changed: number }, { type?: string }>(apiPath('/admin/notifications/read-all'), { type })
export const getAdminForecastRuns = (limit = 20) =>
  http.get<{ list: AdminForecastRunItem[] }>(apiPath('/admin/forecast/runs'), { limit })
export const runAdminForecast = (payload: { spuId: string; horizonDays: number }) =>
  http.post<{
    result: { forecastRunId?: number; generatedAt?: string; status?: string }
    latest: AdminForecastRunItem | null
  }, typeof payload>(apiPath('/admin/forecast/run'), payload)
export const getAdminCollectionLogs = (limit = 20) =>
  http.get<{ list: AdminCollectionLogItem[] }>(apiPath('/admin/collection/logs'), { limit })
export const getAdminAuditLogs = (limit = 20) => http.get<{ list: AdminAuditLogItem[] }>(apiPath('/admin/audit-logs'), { limit })
export const syncAdminRag = () =>
  http.post<{
    totalDocs: number
    totalChunks: number
    sources: Array<{ name: string; links: number; saved: number; failed: number; skipped: number; errors: string[] }>
    startedAt: string
    finishedAt: string
  }>(apiPath('/admin/rag/crawl'))
export const crawlAdminRag = syncAdminRag
export const resetAdminDemo = () => http.post<{ success: boolean }>(apiPath('/admin/demo/reset'))
export const resetAdminDemoData = resetAdminDemo
