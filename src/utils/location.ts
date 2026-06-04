const LOCATION_CACHE_KEY = 'acm_current_location_v1'
const LOCATION_CACHE_TTL_MS = 10 * 60 * 1000

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
    uni.getLocation({
      type: 'gcj02',
      success: (res) => {
        const payload = {
          latitude: Number(res.latitude),
          longitude: Number(res.longitude),
        }
        if (Number.isFinite(payload.latitude) && Number.isFinite(payload.longitude)) {
          writeLocationCache(payload)
          resolve(payload)
          return
        }
        resolve(null)
      },
      fail: () => resolve(null),
    })
  })
}
