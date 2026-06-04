const LOGIN_PAGE = '/pages/login/index'
const DEFAULT_PAGE = '/pages/my-field/index'
const REDIRECT_KEY = 'acm_auth_redirect_after_login'
const PUBLIC_PAGES = new Set([
  LOGIN_PAGE, 
  '/pages/register/index', 
  '/pages/market/index', 
  '/pages/buyer/index',
  '/pages/ai-consult/index',
  '/pages/my-field/index',
  '/pages/ads/index'
])

const normalizePath = (value: string) => {
  const clean = String(value || '').trim()
  if (!clean) return DEFAULT_PAGE
  const noHash = clean.replace(/^#/, '')
  return noHash.startsWith('/') ? noHash : `/${noHash}`
}

const splitPath = (value: string) => normalizePath(value).split('?')[0]

const readCurrentFullPath = () => {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  if (current?.route) {
    const path = normalizePath(current.route)
    const options = (current as any).options || {}
    const query = Object.keys(options)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(options[key]))}`)
      .join('&')
    return query ? `${path}?${query}` : path
  }

  if (typeof window !== 'undefined') {
    const hash = window.location.hash || ''
    const hashPath = hash.replace(/^#/, '')
    if (hashPath) return normalizePath(hashPath)
  }

  return DEFAULT_PAGE
}

export const hasValidStoredToken = () => {
  const token = String(uni.getStorageSync('token') || '')
  if (!token) return false

  const expireAt = Number(uni.getStorageSync('tokenExpireAt') || 0)
  if (expireAt && Date.now() >= expireAt) {
    uni.removeStorageSync('token')
    uni.removeStorageSync('refreshToken')
    uni.removeStorageSync('tokenExpireAt')
    uni.removeStorageSync('userInfo')
    return false
  }

  return true
}

export const isPublicAuthPage = (path: string) => PUBLIC_PAGES.has(splitPath(path))

export const getPostLoginRedirect = () => {
  const stored = String(uni.getStorageSync(REDIRECT_KEY) || '')
  uni.removeStorageSync(REDIRECT_KEY)
  if (!stored || isPublicAuthPage(stored)) return DEFAULT_PAGE
  return normalizePath(stored)
}

export const redirectToLogin = (targetPath?: string) => {
  const currentPath = normalizePath(targetPath || readCurrentFullPath())
  if (isPublicAuthPage(currentPath)) return
  if (!isPublicAuthPage(currentPath)) {
    uni.setStorageSync(REDIRECT_KEY, currentPath)
  }
  uni.reLaunch({ url: LOGIN_PAGE })
}

let guarding = false

export const ensureAuthenticatedRoute = () => {
  const currentPath = readCurrentFullPath()
  if (isPublicAuthPage(currentPath)) return true
  if (hasValidStoredToken()) return true
  if (guarding) return false

  guarding = true
  setTimeout(() => {
    redirectToLogin(currentPath)
    guarding = false
  }, 0)
  return false
}
