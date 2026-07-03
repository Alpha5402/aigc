const LOCATION_CACHE_KEY = 'acm_current_location_v1'
const LOCATION_CACHE_TTL_MS = 10 * 60 * 1000
const LOCATION_REQUEST_TIMEOUT_MS = 8000
const isDevMode = import.meta.env.DEV
const PI = Math.PI
const EARTH_SEMI_MAJOR_AXIS = 6378245
const GCJ_ECCENTRICITY_SQUARED = 0.006693421622965943

export interface CurrentLocationPayload {
  latitude: number
  longitude: number
}

interface StoredLocationPayload extends CurrentLocationPayload {
  cachedAt: number
}

const isOutsideMainlandChina = (latitude: number, longitude: number) =>
  longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271

const transformLatitude = (x: number, y: number) => {
  let result = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  result += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  result += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3
  result += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3
  return result
}

const transformLongitude = (x: number, y: number) => {
  let result = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  result += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  result += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3
  result += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3
  return result
}

const wgs84ToGcj02 = (latitude: number, longitude: number): CurrentLocationPayload => {
  if (isOutsideMainlandChina(latitude, longitude)) return { latitude, longitude }

  let latitudeOffset = transformLatitude(longitude - 105, latitude - 35)
  let longitudeOffset = transformLongitude(longitude - 105, latitude - 35)
  const radianLatitude = (latitude / 180) * PI
  let magic = Math.sin(radianLatitude)
  magic = 1 - GCJ_ECCENTRICITY_SQUARED * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  latitudeOffset =
    (latitudeOffset * 180) /
    (((EARTH_SEMI_MAJOR_AXIS * (1 - GCJ_ECCENTRICITY_SQUARED)) / (magic * sqrtMagic)) * PI)
  longitudeOffset =
    (longitudeOffset * 180) /
    ((EARTH_SEMI_MAJOR_AXIS / sqrtMagic) * Math.cos(radianLatitude) * PI)

  return {
    latitude: latitude + latitudeOffset,
    longitude: longitude + longitudeOffset,
  }
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
      // System positioning works on vivo devices without bundling a paid map SDK.
      // The product and backend use GCJ-02, so convert the system WGS-84 result locally.
      type: 'wgs84',
      success: (res) => {
        const payload = wgs84ToGcj02(Number(res.latitude), Number(res.longitude))
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
