import { http } from '../utils/request'

const isMockMode = () => false; // 强制走真实接口

export interface CropInfo {
  id: number
  name: string
  area: string
  plantDate: string
  stage: string
  health: number
  days: number
  nextTask: string
  location?: string
  expectedYield?: number
  yieldUnit?: string
  expectedMarketTime?: string
}

export interface TaskInfo {
  id: number
  title: string
  crop: string
  time: string
  priority: 'high' | 'medium'
  desc: string
}

export interface WeatherInfo {
  temp: string
  condition: string
  humidity: string
  wind: string
  suggestion: string
  city?: string
  adcode?: string
  provider?: string
  reporttime?: string
  resolvedBy?: string
  locationAddress?: string
}

export interface MarketCropItem {
  id: number
  spuId?: string
  name: string
  currentPrice: number
  unit: string
  change: number
  trend: 'up' | 'down' | 'stable'
  prediction: string
  advice: string
  marketStatus: string
  avgPrice: number
  highPrice: number
  lowPrice: number
  weekVolume: number
  monthVolume: number
  userOwned: boolean
  source?: 'core' | 'field' | 'follow'
}

export interface RecommendationItem {
  title: string
  content: string
  roi: string
  profit: number
  benefits: string[]
  tag: string
  difficulty: string
  cycle: string
  matchScore: number
  reason: string
}

export interface PriceAlertItem {
  crop: string
  title: string
  message: string
  action: string
  urgency: 'high' | 'medium'
}

export interface NearbyMarketItem {
  name: string
  distance: string
  price: number
  trend: 'up' | 'down' | 'stable'
}

export interface MarketRagSource {
  id: string
  title: string
  sourceName: string
  sourceUrl: string
  publishDate: string
  products?: string[]
}

export interface MarketRagReportResult {
  id: number
  crop: string
  region: string
  question: string
  reportText: string
  sources: MarketRagSource[]
  provider: string
  generatedAt: string
  kb?: {
    documents: number
    chunks: number
    reports: number
    lastCrawledAt: string
  }
}

export interface BuyerProduct {
  name: string
  price: number
  demand: number
  unit: string
  minQuantity?: number
}

export interface MatchedProductItem {
  name: string
  price: number
  demand: number
  matchedQuantity: number
  unit: string
  revenue: number
}

export interface BuyerNavigationInfo {
  latitude: number
  longitude: number
  name: string
  address: string
  origin?: {
    latitude: number
    longitude: number
    address: string
  }
  amapWebUrl: string
  amapAppUrl: string
}

export interface BuyerItem {
  id: number
  name: string
  merchantType?: 'supplier' | 'purchaser' | 'comprehensive' | string
  distance: string
  distanceKm?: number
  rating: number
  orders: number
  contact: string
  contactName?: string
  address?: string
  latitude?: number
  longitude?: number
  businessHours?: string
  sourcePlatform?: string
  sourceUrl?: string
  sourceNote?: string
  products: BuyerProduct[]
  badge: string
  profit: number
  netProfit: number
  transport: number
  loss: number
  matchScore?: number
  matchReason?: string
  provider?: string
  navigation?: BuyerNavigationInfo
}

export interface MyProductItem {
  name: string
  quantity: number
  unit: string
}

export interface BuyerRecommendationInfo {
  provider: string
  summary: string
  generatedAt?: string
}

export interface BuyerInterestPayload {
  merchantId: number
  actionType: 'interest' | 'navigate' | 'contact' | 'view'
  source?: string
  extraPayload?: Record<string, unknown>
}

export interface BuyerInterestItem {
  id: number
  actionType: 'interest' | 'navigate' | 'contact' | 'view' | string
  source: string
  extraPayload: Record<string, unknown> | null
  createdAt: string
  merchant: {
    id: number
    name: string
    merchantType: 'supplier' | 'purchaser' | 'comprehensive' | string
    address: string
    contact: string
  }
}

export interface NotificationItem {
  id: number
  userId?: number | null
  type: 'price' | 'buyer' | 'system' | string
  title: string
  content: string
  source: string
  sourceId: string
  linkPayload?: Record<string, unknown> | null
  read: boolean
  readAt: string
  createdAt: string
}

export interface NotificationQuery {
  type?: 'all' | 'price' | 'buyer' | 'system' | string
  read?: 'all' | 'unread'
  page?: number
  pageSize?: number
}

export interface AdTemplate {
  id: number
  type: string
  title: string
  content: string
  tags: string[]
  platform: 'wechat' | 'xiaohongshu' | 'douyin'
  engagement: number
}

export interface FarmProfile {
  products: string[]
  features: string[]
  certification: string
  location: string
}

export interface AdHistoryItem {
  title: string
  meta: string
}

export type MarketingGoal = 'buyer' | 'wechat' | 'video' | 'group'

export interface MarketingMaterialPackage {
  productTitle: string
  wechatCopy: string
  shortVideoScript: string
  inquiryScript: string
  imageSuggestions: string[]
  tags: string[]
  completenessScore: number
  complianceTips: string[]
}

export interface GenerateMarketingPayload {
  productId?: number | string
  productName: string
  productInfo?: Record<string, unknown>
  expectedYield?: number | string
  yieldUnit?: string
  expectedMarketTime?: string
  location?: string
  marketPrice?: number
  marketUnit?: string
  goal: MarketingGoal
  channel?: MarketingGoal | string
  tone?: string
  sellingPoints: string[]
  targetAudience?: string
  targetBuyerName?: string
  extraRequirements?: string
}

export interface AddCropPayload {
  name: string
  area: string
  plantDate: string
  stage: string
  location: string
  expectedYield: number | string
  yieldUnit: string
  expectedMarketTime: string
}

export interface AIDiagnosisPayload {
  content: string
  image?: string
}

export interface LocationPayload {
  latitude?: number
  longitude?: number
  adcode?: string
}

export interface AIDiagnosisResult {
  reply: string
  provider?: string
  reasoning?: string
}

export interface AIDiagnosisHistoryItem {
  id: number
  content: string
  image: string
  reply: string
  provider: string
  createdAt: string
}

interface StoredCropItem {
  id: number
  name: string
  area: string
  plantDate: string
  stage: string
  location: string
  expectedYield: number | string
  yieldUnit: string
  expectedMarketTime: string
  createdAt: number
}

const USER_CROPS_STORAGE_KEY = 'acm_user_added_crops_v1'
const USER_MARKET_FOLLOW_STORAGE_KEY = 'acm_user_market_follow_v1'
const USER_FIELD_REMOVED_STORAGE_KEY = 'acm_user_removed_field_crops_v1'
const USER_MARKET_HIDDEN_STORAGE_KEY = 'acm_user_hidden_market_crops_v1'
const USER_AI_HISTORY_STORAGE_KEY = 'acm_ai_history_v1'
const USER_NOTIFICATIONS_STORAGE_KEY = 'acm_notifications_v1'

const parseNumber = (value: string) => {
  const numeric = Number(String(value).replace(/[^\d.]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

const normalizeCropName = (name: string) => String(name || '').trim().replace(/\s+/g, '').replace(/树$/, '')

const toDisplayCropName = (name: string) => {
  const normalized = normalizeCropName(name)
  if (!normalized) return normalized
  return normalized.endsWith('树') ? normalized : normalized
}

const readStorageList = <T>(key: string): T[] => {
  try {
    const raw = uni.getStorageSync(key)
    if (!raw) return []
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch (_error) {
    return []
  }
}

const writeStorageList = <T>(key: string, list: T[]) => {
  uni.setStorageSync(key, JSON.stringify(list))
}

const getStoredCrops = () => readStorageList<StoredCropItem>(USER_CROPS_STORAGE_KEY)

const saveStoredCrops = (list: StoredCropItem[]) => {
  writeStorageList(USER_CROPS_STORAGE_KEY, list)
}

const getFollowedCropNames = () => readStorageList<string>(USER_MARKET_FOLLOW_STORAGE_KEY)

const saveFollowedCropNames = (names: string[]) => {
  writeStorageList(USER_MARKET_FOLLOW_STORAGE_KEY, names)
}

const getRemovedFieldCropNames = () => readStorageList<string>(USER_FIELD_REMOVED_STORAGE_KEY)

const saveRemovedFieldCropNames = (names: string[]) => {
  writeStorageList(USER_FIELD_REMOVED_STORAGE_KEY, names)
}

const getHiddenMarketCropNames = () => readStorageList<string>(USER_MARKET_HIDDEN_STORAGE_KEY)

const saveHiddenMarketCropNames = (names: string[]) => {
  writeStorageList(USER_MARKET_HIDDEN_STORAGE_KEY, names)
}

const getStoredAiHistory = () => readStorageList<AIDiagnosisHistoryItem>(USER_AI_HISTORY_STORAGE_KEY)

const saveStoredAiHistory = (list: AIDiagnosisHistoryItem[]) => {
  writeStorageList(USER_AI_HISTORY_STORAGE_KEY, list)
}

const getStoredNotifications = () => readStorageList<NotificationItem>(USER_NOTIFICATIONS_STORAGE_KEY)

const saveStoredNotifications = (list: NotificationItem[]) => {
  writeStorageList(USER_NOTIFICATIONS_STORAGE_KEY, list)
}



const randomRange = (min: number, max: number, decimals = 1) => {
  const value = min + Math.random() * (max - min)
  return Number(value.toFixed(decimals))
}

const randomInt = (min: number, max: number) => {
  return Math.floor(min + Math.random() * (max - min + 1))
}

const randomTrend = (): 'up' | 'down' | 'stable' => {
  const trends: Array<'up' | 'down' | 'stable'> = ['up', 'down', 'stable']
  return trends[randomInt(0, trends.length - 1)]
}

const buildFieldCropFromStored = (item: StoredCropItem): CropInfo => {
  const areaValue = parseNumber(item.area) || randomRange(1, 5, 1)
  const health = randomInt(72, 96)
  const days = randomInt(20, 140)
  const stage = item.stage || '生长期'
  const expectedYieldValue = Number(item.expectedYield || '')
  return {
    id: item.id,
    name: toDisplayCropName(item.name),
    area: `${areaValue}亩`,
    plantDate: item.plantDate || '2026年4月',
    stage,
    health,
    days,
    nextTask: randomTrend() === 'up' ? '补充水肥' : '巡查病虫害',
    location: item.location || '',
    expectedYield: Number.isFinite(expectedYieldValue) && expectedYieldValue > 0 ? expectedYieldValue : undefined,
    yieldUnit: item.yieldUnit || '斤',
    expectedMarketTime: item.expectedMarketTime || '',
  }
}

const mockCrops: CropInfo[] = [
  {
    id: 1,
    name: '苹果树',
    area: '3亩',
    plantDate: '2026年3月',
    stage: '成熟期',
    health: 85,
    days: 45,
    nextTask: '施肥',
  },
  {
    id: 2,
    name: '大豆',
    area: '1.5亩',
    plantDate: '2026年2月',
    stage: '生长期',
    health: 92,
    days: 78,
    nextTask: '病虫害检查',
  },
]

const mockTasks: TaskInfo[] = [
  {
    id: 1,
    title: '苹果树清园',
    crop: '苹果树',
    time: '上午',
    priority: 'high',
    desc: '惊蛰已过，该给果树清园了',
  },
  {
    id: 2,
    title: '查看土壤湿度',
    crop: '大豆',
    time: '下午',
    priority: 'medium',
    desc: '检查灌溉系统是否正常',
  },
]

const mockWeather: WeatherInfo = {
  temp: '18°C',
  condition: '晴',
  humidity: '65%',
  wind: '微风',
  suggestion: '适合田间作业',
}

const mockMarketCrops: MarketCropItem[] = [
  {
    id: 1,
    name: '苹果',
    currentPrice: 4.5,
    unit: '斤',
    change: -7.1,
    trend: 'down',
    prediction: '预计2天后价格下跌',
    advice: '建议尽快出售',
    marketStatus: '供大于求',
    avgPrice: 4.2,
    highPrice: 5.8,
    lowPrice: 3.6,
    weekVolume: 23500,
    monthVolume: 95600,
    userOwned: true,
    source: 'core',
  },
  {
    id: 2,
    name: '大豆',
    currentPrice: 5.8,
    unit: '斤',
    change: 3.2,
    trend: 'up',
    prediction: '未来一周持续上涨',
    advice: '可继续观望',
    marketStatus: '供不应求',
    avgPrice: 5.5,
    highPrice: 6.2,
    lowPrice: 5,
    weekVolume: 18300,
    monthVolume: 72400,
    userOwned: true,
    source: 'core',
  },
  {
    id: 3,
    name: '玉米',
    currentPrice: 2.3,
    unit: '斤',
    change: -0.8,
    trend: 'stable',
    prediction: '价格波动较小',
    advice: '择机出售',
    marketStatus: '供需平衡',
    avgPrice: 2.3,
    highPrice: 2.5,
    lowPrice: 2.1,
    weekVolume: 45600,
    monthVolume: 185000,
    userOwned: false,
    source: 'core',
  },
]

const mockNearbyMarkets: NearbyMarketItem[] = [
  { name: '烟台批发市场', distance: '2.3km', price: 4.8, trend: 'up' },
  { name: '栖霞农贸市场', distance: '5.6km', price: 4.5, trend: 'stable' },
  { name: '蓬莱收购站', distance: '8.9km', price: 4.3, trend: 'down' },
]

const mockPriceAlerts: PriceAlertItem[] = [
  {
    crop: '苹果',
    title: '价格即将跌破心理价位',
    message: '苹果价格预计明天跌至4.2元/斤，低于你的心理价位4.5元',
    action: '建议今天出售',
    urgency: 'high',
  },
  {
    crop: '大豆',
    title: '达到最佳出售时机',
    message: '大豆价格已达5.8元/斤，较本月均价上涨5.5%',
    action: '可择机出售',
    urgency: 'medium',
  },
]

const mockRecommendations: RecommendationItem[] = [
  {
    title: '你的苹果+套种方案',
    content: '苹果树下套种大豆',
    roi: '45',
    profit: 1200,
    benefits: ['天然固氮，节约肥料成本200元/亩', '充分利用现有3亩苹果林空间', '大豆行情好，预计增收1200元'],
    tag: '高度匹配',
    difficulty: '简单',
    cycle: '3-4个月',
    matchScore: 95,
    reason: '基于你现有的3亩苹果树+1.5亩大豆经验',
  },
  {
    title: '季节性机会',
    content: '清明前后种植早熟蔬菜',
    roi: '38',
    profit: 980,
    benefits: ['惊蛰已过，适合春播', '烟台地区气候适宜', '城市市场需求旺盛'],
    tag: '时令推荐',
    difficulty: '中等',
    cycle: '2-3个月',
    matchScore: 78,
    reason: '根据你的地理位置和当前节气',
  },
  {
    title: '优势品种转型',
    content: '有机苹果认证升级',
    roi: '62',
    profit: 2800,
    benefits: ['有机苹果价格高30-50%', '你的生态种植基础好', '认证周期仅需1年'],
    tag: '长期收益',
    difficulty: '中等',
    cycle: '12个月',
    matchScore: 88,
    reason: '基于你的林下套种生态优势',
  },
]

const mockBuyers: BuyerItem[] = [
  {
    id: 1,
    name: '烟台鲜果批发市场',
    merchantType: 'comprehensive',
    distance: '2.3km',
    distanceKm: 2.3,
    rating: 4.8,
    orders: 328,
    contact: '138****8888',
    contactName: '王经理',
    address: '山东省烟台市芝罘区幸福南路28号',
    latitude: 37.5612,
    longitude: 121.3997,
    products: [
      { name: '苹果', price: 4.8, demand: 500, unit: '斤' },
      { name: '大豆', price: 5.5, demand: 300, unit: '斤' },
    ],
    badge: '金牌',
    profit: 2850,
    netProfit: 2420,
    transport: 120,
    loss: 310,
    matchScore: 91,
    matchReason: '苹果需求量大，净收益高，适合优先联系。',
  },
  {
    id: 2,
    name: '村口农贸市场',
    merchantType: 'supplier',
    distance: '0.8km',
    distanceKm: 0.8,
    rating: 4.6,
    orders: 156,
    contact: '139****6666',
    contactName: '李老板',
    address: '山东省烟台市芝罘区卧龙中路19号',
    latitude: 37.5312,
    longitude: 121.4245,
    products: [
      { name: '苹果', price: 4.2, demand: 300, unit: '斤' },
      { name: '大豆', price: 5.8, demand: 200, unit: '斤' },
    ],
    badge: '银牌',
    profit: 2520,
    netProfit: 2460,
    transport: 40,
    loss: 20,
    matchScore: 88,
    matchReason: '距离近、运输损耗低，适合当天快速成交。',
  },
  {
    id: 3,
    name: '市区超市采购中心',
    merchantType: 'purchaser',
    distance: '12.5km',
    distanceKm: 12.5,
    rating: 4.9,
    orders: 542,
    contact: '137****9999',
    contactName: '赵采购',
    address: '山东省烟台市莱山区港城东大街377号',
    latitude: 37.4684,
    longitude: 121.4683,
    products: [
      { name: '苹果', price: 5.2, demand: 800, unit: '斤' },
      { name: '大豆', price: 6, demand: 400, unit: '斤' },
    ],
    badge: '金牌',
    profit: 3360,
    netProfit: 2280,
    transport: 580,
    loss: 500,
    matchScore: 85,
    matchReason: '报价最高，但运输成本偏高，适合大批量出货。',
  },
]

const mockMyProducts: MyProductItem[] = [
  { name: '苹果', quantity: 500, unit: '斤' },
  { name: '大豆', quantity: 200, unit: '斤' },
]

const buildMockNavigation = (buyer: BuyerItem): BuyerNavigationInfo => ({
  latitude: Number(buyer.latitude || 37.4647),
  longitude: Number(buyer.longitude || 121.4479),
  name: buyer.name,
  address: buyer.address || '山东省烟台市',
  amapWebUrl: `https://uri.amap.com/navigation?to=${buyer.longitude || 121.4479},${buyer.latitude || 37.4647},${encodeURIComponent(
    buyer.name,
  )}&mode=car&src=AgriCloudManager&coordinate=gaode&callnative=1`,
  amapAppUrl: '',
})

const mockAdTemplates: AdTemplate[] = [
  {
    id: 1,
    type: '朋友圈',
    title: '生态种植 · 新鲜直达',
    content:
      '自家果园的红富士苹果成熟啦。\n\n林下套种大豆，天然固氮，无化肥污染。\n阳光充足，果香浓郁，脆甜爽口。\n当天采摘，新鲜直达，支持批发零售。\n\n惊蛰刚过，正是口感最佳的时候。\n价格美丽，欢迎咨询。',
    tags: ['生态种植', '新鲜采摘', '批发零售'],
    platform: 'wechat',
    engagement: 85,
  },
  {
    id: 2,
    type: '小红书',
    title: '果园直供 | 林下套种的生态苹果',
    content:
      '今天分享我们家的生态苹果。\n\n特别之处：\n• 苹果树下套种大豆，天然肥料\n• 0 化肥 0 农药残留\n• 惊蛰时节成熟，口感更佳\n\n农场主亲自打理，实拍图在后面。\n\n现在下单还送自家大豆，批发更优惠。\n\n#生态农业 #健康生活 #果园直供',
    tags: ['小红书', '图文种草', '高转化'],
    platform: 'xiaohongshu',
    engagement: 92,
  },
  {
    id: 3,
    type: '抖音口播',
    title: '果园老板教你挑苹果',
    content:
      '【开场】\n老铁们好，我是烟台果农老王！\n\n【痛点】\n市面上的苹果，打蜡的、催熟的，吃着不放心？\n\n【解决方案】\n来我家果园！林下套种大豆，天然固氮，不用化肥！\n\n【证明】\n你看这苹果，红彤彤的，咬一口嘎嘣脆，汁水四溅！\n\n【行动号召】\n现在下单，批发价直供！评论区扣1，私信你！',
    tags: ['短视频', '口播脚本', '带货'],
    platform: 'douyin',
    engagement: 88,
  },
]

const mockFarmProfile: FarmProfile = {
  products: ['苹果', '大豆'],
  features: ['林下套种', '生态种植', '天然固氮'],
  certification: 'AI种植档案认证',
  location: '山东烟台',
}

const mockHistoryList: AdHistoryItem[] = [
  { title: '苹果推广文案 #1', meta: '2天前 · 已复制3次' },
  { title: '苹果推广文案 #2', meta: '2天前 · 已复制3次' },
]

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const wait = (duration = 180) =>
  new Promise<void>((resolve) => {
    setTimeout(() => resolve(), duration)
  })

const useMock = async <T>(valueFactory: () => T, duration?: number) => {
  await wait(duration)
  return valueFactory()
}

const buildLocalMarketFallbackReport = (payload: {
  crop: string
  region?: string
  question?: string
}): MarketRagReportResult => {
  const crop = payload.crop || '该作物'
  const region = payload.region || '山东烟台'

  return {
    id: Date.now(),
    crop,
    region,
    question: payload.question || `最近${crop}价格走势怎么样，适合出货吗？`,
    provider: 'local-fallback',
    generatedAt: new Date().toISOString(),
    kb: {
      documents: 0,
      chunks: 0,
      reports: 0,
      lastCrawledAt: '',
    },
    sources: [
      {
        id: 'local-fallback',
        title: `${crop}行情兜底分析`,
        sourceName: '本地兜底策略',
        sourceUrl: '',
        publishDate: '未标注',
        products: [crop],
      },
    ],
    reportText: `【行情概况】
数据不足，仅作参考：当前未能及时取得足够的公开行情检索资料。${region}地区需结合本地批发市场、采购商报价和库存情况综合决策。

【价格变化】
暂未取得足够的直接成交价、价格指数或涨跌幅数据。建议把当地实时询价作为主依据，重点观察近3天询价变化、同类农产品价格和批发市场走货速度。

【影响因素】
影响${crop}销售的主要因素包括产地供应量、客商采购积极性、天气与运输成本、节假日消费需求，以及周边同类产品价格变化。

【未来预期】
在资料不足的情况下，短期更适合按“稳健偏谨慎”处理：若询价连续走弱，应优先锁定确定订单；若询价稳定且走货顺畅，可保留部分货源继续观察。

【销售建议】
建议采用分批出货策略：先小批量试探成交价，再对比周边市场和采购商报价。若当前报价达到心理价位，可先出售30%-50%，剩余部分根据后续询价变化调整。

【风险提示】
本报告为兜底分析，不替代真实成交价。最终出货决策应以当地市场实时询价、采购合同和运输损耗核算为准。`,
  }
}

const buildAiReply = (payload: AIDiagnosisPayload) => {
  if (payload.image) {
    return '根据您上传的照片，叶片可能存在黄化现象。\n\n建议：\n1. 补充氮肥，建议尿素15-20kg/亩\n2. 如病斑扩散，喷施多菌灵500倍液\n3. 控制浇水量，避免积水\n\n可再补充症状细节，我会继续给出更精准建议。'
  }

  if (payload.content.includes('黄') || payload.content.includes('发黄')) {
    return '作物发黄常见原因：\n1. 缺氮：老叶先黄\n2. 缺铁：新叶发黄\n3. 病害：黄斑扩散\n4. 水分异常\n\n建议先检查浇水和施肥，再拍照补充细节。'
  }

  return '我已记录你的问题。请补充：\n1. 作物种类\n2. 当前症状\n3. 所在地区\n\n也可以直接拍照，我会进一步诊断。'
}

export const getMyFieldData = async (location?: LocationPayload) => {
  if (isMockMode()) {
    return useMock(() => {
      const removedFieldNames = new Set(getRemovedFieldCropNames().map((item) => normalizeCropName(item)))
      const baseCrops = mockCrops.filter((item) => !removedFieldNames.has(normalizeCropName(item.name)))
      const storedCrops = getStoredCrops()
        .filter((item) => !removedFieldNames.has(normalizeCropName(item.name)))
        .map((item) => buildFieldCropFromStored(item))
      const existingNames = new Set(baseCrops.map((item) => normalizeCropName(item.name)))
      const mergedCrops = [...baseCrops]

      storedCrops.forEach((item) => {
        const normalized = normalizeCropName(item.name)
        if (!existingNames.has(normalized)) {
          mergedCrops.push(item)
          existingNames.add(normalized)
        }
      })

      const filteredMockTasks = mockTasks.filter((task) => !removedFieldNames.has(normalizeCropName(task.crop)))

      const extraTasks: TaskInfo[] = storedCrops.slice(0, 3).map((item, index) => ({
        id: 100 + index,
        title: `${item.name}田间巡查`,
        crop: item.name,
        time: index % 2 === 0 ? '上午' : '下午',
        priority: index % 2 === 0 ? 'high' : 'medium',
        desc: `关注${item.name}当前长势并记录水肥情况`,
      }))

      return {
        crops: clone(mergedCrops),
        tasks: clone([...filteredMockTasks, ...extraTasks]),
        weather: clone(mockWeather),
      }
    })
  }

  return http.get<{
    crops: CropInfo[]
    tasks: TaskInfo[]
    weather: WeatherInfo
  }>('/field/overview', location)
}

export const getMarketData = async () => {
  const res = await http.get<{
    crops: MarketCropItem[]
    nearbyMarkets: NearbyMarketItem[]
    priceAlerts: PriceAlertItem[]
    recommendations: RecommendationItem[]
  }>('/market/overview')

  const followed = getFollowedCropNames()
  const backendCropNames = res.crops.map((c) => normalizeCropName(c.name))
  const hiddenMarketNames = getHiddenMarketCropNames()

  const additionalCrops = followed
    .filter((name) => !backendCropNames.includes(normalizeCropName(name)))
    .map((name, index) => ({
      id: -Date.now() - index,
      name,
      currentPrice: 0,
      unit: '斤',
      change: 0,
      trend: 'stable' as const,
      prediction: '暂无数据',
      advice: '等待后台数据接入',
      marketStatus: '未知',
      avgPrice: 0,
      highPrice: 0,
      lowPrice: 0,
      weekVolume: 0,
      monthVolume: 0,
      userOwned: false,
      source: 'follow' as const,
    }))

  res.crops = [...res.crops, ...additionalCrops].filter(
    (c) => !hiddenMarketNames.includes(normalizeCropName(c.name)),
  )

  return res
}

export interface ForecastHistoryPoint {
  date: string
  price: number
  sourceName: string
}

export interface ForecastDayPoint {
  point: number | null
  ci80Lower: number | null
  ci80Upper: number | null
  ci95Lower: number | null
  ci95Upper: number | null
}

export interface MarketForecastData {
  spu: {
    spuId: string
    displayName: string
    variety: { code: string; displayName: string }
    origin: { adcode: string; displayName: string }
    grade: { displayName: string }
    unit: { displayName: string }
  }
  horizon: number
  originDate?: string
  latestHistoryDate?: string
  status: string
  degraded: string | null
  modelFamilies: string[]
  generatedAt: string | null
  history: ForecastHistoryPoint[]
  forecast: ForecastDayPoint[]
}

export const getMarketForecast = async (spuId: string, horizon: 7 | 30 = 7) => {
  return http.get<MarketForecastData>(`/market/forecast/${encodeURIComponent(spuId)}`, { horizon })
}

export const generateMarketRagReport = async (payload: {
  crop: string
  region?: string
  question?: string
}) => {
  if (isMockMode()) {
    return useMock<MarketRagReportResult>(
      () => ({
        ...buildLocalMarketFallbackReport(payload),
        provider: 'mock-fallback',
      }),
      900,
    )
  }

  return http.request<MarketRagReportResult, typeof payload>({
    url: '/market/report/rag',
    method: 'POST',
    data: payload,
    timeout: 60000,
  })
}

export const getBuyerData = async () => {
  if (isMockMode()) {
    return useMock(() => ({
      buyers: clone(mockBuyers).map((buyer) => ({
        ...buyer,
        navigation: buildMockNavigation(buyer),
        provider: 'mock-fallback',
      })),
      myProducts: clone(mockMyProducts),
      recommendation: {
        provider: 'mock-fallback',
        summary: '已按净收益、距离和需求量为你筛出最适合联系的收购商。',
      },
    }))
  }

  return http.get<{
    buyers: BuyerItem[]
    myProducts: MyProductItem[]
    recommendation: BuyerRecommendationInfo
  }>('/buyer/overview')
}

export const getBuyerRecommendations = async (payload?: {
  currentLocation?: {
    latitude: number
    longitude: number
    address?: string
  }
}) => {
  if (isMockMode()) {
    return getBuyerData()
  }

  return http.post<{
    buyers: BuyerItem[]
    myProducts: MyProductItem[]
    recommendation: BuyerRecommendationInfo
  }>('/buyer/recommend', payload || {})
}

export const getCurrentWeather = async (location?: LocationPayload) => {
  if (isMockMode()) {
    return useMock(() => clone(mockWeather), 180)
  }

  return http.get<WeatherInfo>('/weather/current', location)
}

export const getBuyerNavigation = async (merchantId: number, origin?: {
  latitude?: number
  longitude?: number
  address?: string
}) => {
  if (isMockMode()) {
    const buyer = mockBuyers.find((item) => item.id === merchantId) || mockBuyers[0]
    return buildMockNavigation(buyer)
  }

  return http.get<BuyerNavigationInfo>('/map/navigation', {
    merchantId,
    originLat: origin?.latitude,
    originLng: origin?.longitude,
    originAddress: origin?.address,
  })
}

export const logBuyerInterest = async (payload: BuyerInterestPayload) => {
  if (isMockMode()) {
    return useMock(() => ({ success: true }), 180)
  }

  return http.post<{ success: boolean }, BuyerInterestPayload>('/buyer/interest', payload)
}

export const getBuyerInterests = async () => {
  if (isMockMode()) {
    return useMock(() => ({ list: [] as BuyerInterestItem[] }), 180)
  }

  return http.get<{
    list: BuyerInterestItem[]
  }>('/buyer/interests')
}

const buildDefaultNotifications = (): NotificationItem[] => [
  {
    id: 1,
    type: 'price',
    title: '价格波动提醒',
    content: '苹果今日价格下跌7.1%，建议关注周边采购报价。',
    source: 'mock',
    sourceId: 'price:apple',
    read: false,
    readAt: '',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    id: 2,
    type: 'buyer',
    title: '感兴趣收购商',
    content: '你已标记烟台鲜果批发市场为感兴趣，可继续跟进联系。',
    source: 'mock',
    sourceId: 'buyer:1',
    read: false,
    readAt: '',
    createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
  },
  {
    id: 3,
    type: 'system',
    title: '欢迎使用智慧农云管理系统',
    content: '通知中心已开启，价格预警、买家行为和系统消息会在这里汇总。',
    source: 'mock',
    sourceId: 'system:welcome',
    read: true,
    readAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
]

export const getNotifications = async (query?: NotificationQuery) => {
  if (isMockMode()) {
    return useMock(() => {
      let list = getStoredNotifications()
      if (!list.length) {
        list = buildDefaultNotifications()
        saveStoredNotifications(list)
      }
      const type = query?.type || 'all'
      const read = query?.read || 'all'
      const filtered = list
        .filter((item) => type === 'all' || item.type === type)
        .filter((item) => read !== 'unread' || !item.read)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      return {
        list: filtered,
        total: filtered.length,
        unread: list.filter((item) => !item.read).length,
        page: query?.page || 1,
        pageSize: query?.pageSize || 20,
      }
    }, 180)
  }

  return http.get<{
    list: NotificationItem[]
    total: number
    unread: number
    page: number
    pageSize: number
  }>('/notifications', query)
}

export const markNotificationRead = async (id: number) => {
  if (isMockMode()) {
    return useMock(() => {
      const list = getStoredNotifications().map((item) =>
        item.id === id ? { ...item, read: true, readAt: new Date().toISOString() } : item,
      )
      saveStoredNotifications(list)
      return { success: true }
    }, 120)
  }

  return http.post<{ success: boolean }, { id: number }>('/notifications/read', { id })
}

export const markAllNotificationsRead = async (type = 'all') => {
  if (isMockMode()) {
    return useMock(() => {
      const now = new Date().toISOString()
      const list = getStoredNotifications().map((item) =>
        type === 'all' || item.type === type ? { ...item, read: true, readAt: now } : item,
      )
      saveStoredNotifications(list)
      return { success: true, changed: list.length }
    }, 120)
  }

  return http.post<{ success: boolean; changed: number }, { type?: string }>('/notifications/read-all', { type })
}

export const getAdsData = async () => {
  if (isMockMode()) {
    return useMock(() => ({
      templates: clone(mockAdTemplates),
      farmProfile: clone(mockFarmProfile),
      historyList: clone(mockHistoryList),
    }))
  }

  return http.get<{
    templates: AdTemplate[]
    farmProfile: FarmProfile
    historyList: AdHistoryItem[]
  }>('/ads/overview')
}

export const generateAdCopy = async (template: AdTemplate) => {
  if (isMockMode()) {
    return useMock(
      () => ({
        ...template,
        content: `${template.content}\n\n【AI优化】已根据当前行情和受众偏好补充表达重点。`,
        engagement: Math.min(99, template.engagement + 2),
      }),
      1400,
    )
  }

  return http.post<AdTemplate, { templateId: number }>('/ads/generate', { templateId: template.id })
}

export const submitAddCrop = async (payload: AddCropPayload) => {
  if (isMockMode()) {
    const normalizedName = normalizeCropName(payload.name)
    const areaValue = parseNumber(payload.area) || 1
    const plantDate = payload.plantDate || '2026-04-01'
    const stage = payload.stage || '生长期'
    const location = payload.location || ''
    const expectedYield = payload.expectedYield || ''
    const yieldUnit = payload.yieldUnit || '斤'
    const expectedMarketTime = payload.expectedMarketTime || ''

    const existing = getStoredCrops()
    const existsIndex = existing.findIndex((item) => normalizeCropName(item.name) === normalizedName)
    const nextId = Date.now()

    const nextItem: StoredCropItem = {
      id: existsIndex >= 0 ? existing[existsIndex].id : nextId,
      name: toDisplayCropName(normalizedName),
      area: String(areaValue),
      plantDate: plantDate.replace(/-/g, '年').replace(/(\d{4})年(\d{2})年(\d{2})/, '$1年$2月$3日'),
      stage,
      location,
      expectedYield,
      yieldUnit,
      expectedMarketTime,
      createdAt: existsIndex >= 0 ? existing[existsIndex].createdAt : nextId,
    }

    if (existsIndex >= 0) {
      existing.splice(existsIndex, 1, nextItem)
    } else {
      existing.push(nextItem)
    }
    saveStoredCrops(existing)

    const removedFieldNames = getRemovedFieldCropNames().filter((item) => normalizeCropName(item) !== normalizedName)
    saveRemovedFieldCropNames(removedFieldNames)

    const hiddenMarketNames = getHiddenMarketCropNames().filter((item) => normalizeCropName(item) !== normalizedName)
    saveHiddenMarketCropNames(hiddenMarketNames)

    return useMock(
      () => ({
        id: nextItem.id,
        ...payload,
        expectedYield,
        yieldUnit,
        expectedMarketTime,
      }),
      600,
    )
  }

  return http.post('/crop/create', payload)
}

export const askAiDiagnosis = async (payload: AIDiagnosisPayload) => {
  if (isMockMode()) {
    return useMock(() => {
      const result: AIDiagnosisResult = {
        reply: buildAiReply(payload),
        provider: 'mock-fallback',
        reasoning: '',
      }

      const history = getStoredAiHistory()
      const nextItem: AIDiagnosisHistoryItem = {
        id: Date.now(),
        content: payload.content || '',
        image: payload.image || '',
        reply: result.reply,
        provider: result.provider || 'mock-fallback',
        createdAt: new Date().toISOString(),
      }

      saveStoredAiHistory([nextItem, ...history].slice(0, 10))
      return result
    }, 900)
  }

  return http.request<AIDiagnosisResult, AIDiagnosisPayload>({
    url: '/ai/diagnose',
    method: 'POST',
    data: payload,
    timeout: 90000,
  })
}

export const getAiDiagnosisHistory = async () => {
  if (isMockMode()) {
    return useMock(() => ({
      historyList: getStoredAiHistory(),
    }))
  }

  return http.get<{
    historyList: AIDiagnosisHistoryItem[]
  }>('/ai/history')
}

export const addMarketFollowCrop = (name: string) => {
  const normalized = normalizeCropName(name)
  if (!normalized) return getFollowedCropNames()

  const list = getFollowedCropNames()
  if (!list.some((item) => normalizeCropName(item) === normalized)) {
    list.push(toDisplayCropName(normalized))
    saveFollowedCropNames(list)
  }

  const hiddenMarketNames = getHiddenMarketCropNames().filter((item) => normalizeCropName(item) !== normalized)
  saveHiddenMarketCropNames(hiddenMarketNames)

  return list
}

export const getMarketFollowCropList = () => {
  return getFollowedCropNames()
}

export const removeMarketFollowCrop = (name: string) => {
  const normalized = normalizeCropName(name)
  if (!normalized) return getFollowedCropNames()

  const followed = getFollowedCropNames().filter((item) => normalizeCropName(item) !== normalized)
  saveFollowedCropNames(followed)

  const hiddenMarketNames = getHiddenMarketCropNames()
  if (!hiddenMarketNames.some((item) => normalizeCropName(item) === normalized)) {
    hiddenMarketNames.push(toDisplayCropName(normalized))
    saveHiddenMarketCropNames(hiddenMarketNames)
  }

  return followed
}

export const removeMyFieldCrop = async (id: number, name: string) => {
  const normalized = normalizeCropName(name)

  // 调用后端接口删除作物（优先通过作物名称删除，因为前端 id 经过偏移映射）
  try {
    await http.delete('/crop', { name: toDisplayCropName(normalized || name) })
  } catch (_error) {
    // 后端删除失败时降级为仅本地删除
    console.warn('[removeMyFieldCrop] backend delete failed, falling back to local-only')
  }

  if (!normalized) return getStoredCrops()

  const nextStored = getStoredCrops().filter((item) => normalizeCropName(item.name) !== normalized)
  saveStoredCrops(nextStored)

  const removedFieldNames = getRemovedFieldCropNames()
  if (!removedFieldNames.some((item) => normalizeCropName(item) === normalized)) {
    removedFieldNames.push(toDisplayCropName(normalized))
    saveRemovedFieldCropNames(removedFieldNames)
  }

  return nextStored
}


const toStringList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/\n|,|，/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

const pickMarketingField = (source: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key]
    if (Array.isArray(value) ? value.length : value) return value
  }
  return ''
}

const normalizeMarketingMaterialPackage = (response: unknown): MarketingMaterialPackage => {
  const root = (response && typeof response === 'object' ? response : {}) as Record<string, any>
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, any>
  const materials = (data.materials && typeof data.materials === 'object' ? data.materials : {}) as Record<string, any>
  const source = { ...data, ...materials }

  return {
    productTitle: String(pickMarketingField(source, ['productTitle', 'title', 'headline']) || ''),
    wechatCopy: String(pickMarketingField(source, ['wechatCopy', 'copywriting', 'copy', 'posterText']) || ''),
    shortVideoScript: String(pickMarketingField(source, ['shortVideoScript', 'videoScript', 'script']) || ''),
    inquiryScript: String(pickMarketingField(source, ['inquiryScript', 'buyerInquiryScript', 'inquiry']) || ''),
    imageSuggestions: toStringList(pickMarketingField(source, ['imageSuggestions', 'imagePrompts', 'posterSuggestions'])),
    tags: toStringList(pickMarketingField(source, ['tags', 'hashtags'])),
    completenessScore: Number(pickMarketingField(source, ['completenessScore', 'score']) || 0),
    complianceTips: toStringList(pickMarketingField(source, ['complianceTips', 'tips', 'warnings'])),
  }
}

export const generateMarketingMaterials = async (payload: GenerateMarketingPayload) => {
  const response = await http.post<unknown, GenerateMarketingPayload>('/ads/generate', payload)
  return normalizeMarketingMaterialPackage(response)
}
