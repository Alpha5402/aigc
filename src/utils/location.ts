const LOCATION_CACHE_KEY = 'acm_current_location_v1'
const LOCATION_CACHE_TTL_MS = 10 * 60 * 1000
const LOCATION_REQUEST_TIMEOUT_MS = 3000
const isDevMode = import.meta.env.DEV

export interface CurrentLocationPayload {
  latitude: number
  longitude: number
}

interface StoredLocationPayload extends CurrentLocationPayload {
  cachedAt: number
}

const readLocationCache = (): CurrentLocationPayload | null => {
  try {
    const raw = uni.getStorageSync(LOCATION_CACHE_KEY)
    if (!raw) return null
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object') return null
    const latitude = Number(parsed.latitude)
    const longitude = Number(parsed.longitude)
    const cachedAt = Number(parsed.cachedAt)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(cachedAt)) {
      return null
    }
    if (Date.now() - cachedAt > LOCATION_CACHE_TTL_MS) return null
    return { latitude, longitude }
  } catch (_error) {
    return null
  }
}

const writeLocationCache = (payload: CurrentLocationPayload) => {
  const nextValue: StoredLocationPayload = {
    ...payload,
    cachedAt: Date.now(),
  }
  uni.setStorageSync(LOCATION_CACHE_KEY, JSON.stringify(nextValue))
}

export const getCurrentLocationPayload = async (forceRefresh = false): Promise<CurrentLocationPayload | null> => {
  if (!forceRefresh) {
    const cached = readLocationCache()
    if (cached) return cached
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (payload: CurrentLocationPayload | null, reason?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      if (!payload && reason && isDevMode) {
        console.warn(`[location] ${reason}`)
      }
      resolve(payload)
    }

    const timeoutId = setTimeout(() => {
      finish(null, `getLocation timeout after ${LOCATION_REQUEST_TIMEOUT_MS}ms`)
    }, LOCATION_REQUEST_TIMEOUT_MS)

    uni.getLocation({
      type: 'gcj02',
      success: (res) => {
        const payload = {
          latitude: Number(res.latitude),
          longitude: Number(res.longitude),
        }
        if (Number.isFinite(payload.latitude) && Number.isFinite(payload.longitude)) {
          writeLocationCache(payload)
          finish(payload)
          return
        }
        finish(null, 'getLocation returned invalid coordinates')
      },
      fail: (error) => {
        finish(null, error?.errMsg || 'getLocation failed')
      },
    })
  })
}
