import { redirectToLogin } from './auth-guard'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'TRACE' | 'CONNECT'

export interface HttpRequestOptions<TData = Record<string, unknown>> {
  url: string
  method?: HttpMethod
  data?: TData | string | ArrayBuffer
  header?: Record<string, string>
  timeout?: number
}

export interface HttpError extends Error {
  code: number | string
  statusCode?: number
  raw?: unknown
}

const DEFAULT_TIMEOUT = 30000
const APP_PROD_API_BASE_URL = 'https://agricloud-api.onrender.com/api'
const APP_DEV_API_BASE_URL = APP_PROD_API_BASE_URL

const normalizeBaseUrl = (value?: string) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('/')) return raw.replace(/\/$/, '')

  try {
    const url = new URL(raw)
    if (!/^https?:$/i.test(url.protocol)) return ''

    const path = url.pathname.replace(/\/$/, '')
    if ((!path || path === '') && url.port === '3000') {
      url.pathname = '/api'
    } else {
      url.pathname = path || ''
    }
    return url.toString().replace(/\/$/, '')
  } catch (_error) {
    return ''
  }
}

const isLocalHostName = (hostname: string) => ['127.0.0.1', 'localhost'].includes(hostname)

const isAppRuntime = () => {
  try {
    const systemInfo = uni.getSystemInfoSync()
    const platform = String(systemInfo?.uniPlatform || '').toLowerCase()
    if (platform === 'app' || platform === 'app-plus') return true
    return typeof (globalThis as any).plus !== 'undefined'
  } catch (_error) {
    return typeof (globalThis as any).plus !== 'undefined'
  }
}

const isLocalBaseUrl = (value: string) => {
  try {
    return isLocalHostName(new URL(value).hostname)
  } catch (_error) {
    return false
  }
}

const getBaseUrl = () => {
  const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined
  const runtimeBase = uni.getStorageSync('baseURL')
  const localHost =
    typeof window !== 'undefined' && isLocalHostName(window.location.hostname)
  const normalizedEnvBase = normalizeBaseUrl(envBase)
  const normalizedRuntimeBase = normalizeBaseUrl(String(runtimeBase || ''))
  const appRuntime = isAppRuntime()
  const productionApp = appRuntime && import.meta.env.PROD
  const appFallbackBase = normalizeBaseUrl(APP_PROD_API_BASE_URL)

  if (import.meta.env.PROD && (!normalizedEnvBase || normalizedEnvBase.startsWith('/') || isLocalBaseUrl(normalizedEnvBase))) {
    return appFallbackBase
  }

  // A release APK must not be redirected to an old LAN address cached by a
  // previously installed debug build.
  if (productionApp) {
    if (normalizedEnvBase && !normalizedEnvBase.startsWith('/') && !isLocalBaseUrl(normalizedEnvBase)) {
      return normalizedEnvBase
    }
    return appFallbackBase
  }

  if (normalizedRuntimeBase) {
    if (appRuntime && normalizedEnvBase && isLocalBaseUrl(normalizedRuntimeBase) && !isLocalBaseUrl(normalizedEnvBase)) {
      console.warn('[request] ignore cached local baseURL in app:', normalizedRuntimeBase)
      return normalizedEnvBase
    }

    if (appRuntime && isLocalBaseUrl(normalizedRuntimeBase)) {
      console.warn('[request] ignore cached local baseURL in app:', normalizedRuntimeBase)
      return APP_DEV_API_BASE_URL
    }

    if (localHost && normalizedEnvBase) {
      try {
        const runtimeUrl = new URL(normalizedRuntimeBase)
        const envUrl = new URL(normalizedEnvBase)
        const runtimeIsLocal = isLocalHostName(runtimeUrl.hostname)
        if (!runtimeIsLocal || runtimeUrl.port !== envUrl.port) {
          console.warn('[request] ignore cached baseURL in local dev:', normalizedRuntimeBase)
          return normalizedEnvBase
        }
      } catch (_error) {
        return normalizedRuntimeBase
      }
    }
    return normalizedRuntimeBase
  }

  if (runtimeBase) {
    console.warn('[request] invalid cached baseURL ignored:', runtimeBase)
    try {
      uni.removeStorageSync('baseURL')
    } catch (_error) {
      // ignore storage cleanup errors
    }
  }

  if (appRuntime && (!normalizedEnvBase || normalizedEnvBase.startsWith('/') || isLocalBaseUrl(normalizedEnvBase))) {
    return APP_DEV_API_BASE_URL
  }

  if (normalizedEnvBase) return normalizedEnvBase
  return localHost ? 'http://127.0.0.1:3000/api' : appFallbackBase
}

const buildUrl = (url: string) => {
  if (/^https?:\/\//i.test(url)) return url
  const base = getBaseUrl()
  if (!base) {
    const fallbackBase = normalizeBaseUrl(APP_PROD_API_BASE_URL)
    if (fallbackBase) {
      const cleanFallbackBase = fallbackBase.endsWith('/') ? fallbackBase.slice(0, -1) : fallbackBase
      const cleanFallbackPath = url.startsWith('/') ? url : `/${url}`
      return `${cleanFallbackBase}${cleanFallbackPath}`
    }
    return url
  }

  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  const cleanPath = url.startsWith('/') ? url : `/${url}`
  const finalUrl = `${cleanBase}${cleanPath}`
  if (import.meta.env.DEV && cleanPath.includes('/market/')) {
    console.log('[market] api baseURL =', cleanBase)
    console.log('[market] request url =', finalUrl)
  }
  return finalUrl
}

const createHttpError = (code: number | string, message: string, statusCode?: number, raw?: unknown): HttpError => {
  const error = new Error(message) as HttpError
  error.code = code
  error.statusCode = statusCode
  error.raw = raw
  return error
}

const resolveBusinessData = <T>(responseData: any): T => {
  if (responseData && typeof responseData === 'object' && 'data' in responseData) {
    return responseData.data as T
  }
  return responseData as T
}

const request = <T = unknown, TData = Record<string, unknown>>(options: HttpRequestOptions<TData>) => {
  const token = String(uni.getStorageSync('token') || '')

  return new Promise<T>((resolve, reject) => {
    let requestUrl = ''
    try {
      requestUrl = buildUrl(options.url)
    } catch (error) {
      reject(error)
      return
    }

    uni.request({
      url: requestUrl,
      method: options.method || 'GET',
      data: options.data as any,
      timeout: options.timeout || DEFAULT_TIMEOUT,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.header || {}),
      },
      success: (response) => {
        const statusCode = response.statusCode
        const data: any = response.data || {}

        const okHttpStatus = statusCode >= 200 && statusCode < 300
        if (!okHttpStatus) {
          if (statusCode === 401) {
            uni.removeStorageSync('token')
            uni.removeStorageSync('refreshToken')
            uni.removeStorageSync('tokenExpireAt')
            uni.removeStorageSync('userInfo')
            redirectToLogin()
          }
          reject(createHttpError(statusCode, data?.message || '请求失败', statusCode, response))
          return
        }

        if (data && typeof data === 'object' && 'code' in data) {
          const code = Number(data.code)
          if (![0, 200].includes(code)) {
            if (code === 401) {
              uni.removeStorageSync('token')
              uni.removeStorageSync('refreshToken')
              uni.removeStorageSync('tokenExpireAt')
              uni.removeStorageSync('userInfo')
              redirectToLogin()
            }
            reject(createHttpError(code, data?.message || '请求失败', statusCode, data))
            return
          }
        }

        resolve(resolveBusinessData<T>(data))
      },
      fail: (error) => {
        const message = error?.errMsg ? `${error.errMsg}（${requestUrl}）` : `网络异常（${requestUrl}）`
        reject(createHttpError(-1, message, undefined, error))
      },
    })
  })
}

export const http = {
  request,
  get: <T = unknown, TData = Record<string, unknown>>(url: string, data?: TData, header?: Record<string, string>) =>
    request<T, TData>({ url, method: 'GET', data, header }),
  post: <T = unknown, TData = Record<string, unknown>>(url: string, data?: TData, header?: Record<string, string>) =>
    request<T, TData>({ url, method: 'POST', data, header }),
  put: <T = unknown, TData = Record<string, unknown>>(url: string, data?: TData, header?: Record<string, string>) =>
    request<T, TData>({ url, method: 'PUT', data, header }),
  delete: <T = unknown, TData = Record<string, unknown>>(url: string, data?: TData, header?: Record<string, string>) =>
    request<T, TData>({ url, method: 'DELETE', data, header }),
}

export const isMockMode = () => false
