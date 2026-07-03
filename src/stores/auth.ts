import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { http, isMockMode } from '../utils/request'
import { redirectToLogin } from '../utils/auth-guard'

const API_BASE_URL = 'https://agricloud-api.onrender.com/api'

const apiPath = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export interface UserInfo {
  id?: string | number
  name?: string
  phone?: string
  avatar?: string
  nickname?: string
  role?: string
  [key: string]: unknown
}

export interface LoginPayload {
  phone: string
  password?: string
  code?: string
  loginType?: 'password' | 'sms' | 'wechat'
}

export interface RegisterPayload {
  phone: string
  password: string
  code?: string
  nickname?: string
}

export interface UpdateUserProfilePayload {
  nickname: string
  realName?: string
  region?: string
  farmRole?: string
  bio?: string
  avatar?: string
}

export interface UploadAvatarPayload {
  dataUrl: string
  filename?: string
}

export interface UploadAvatarResult {
  url: string
  objectKey: string
  mimeType: string
  size: number
  user: UserInfo
}

const readUserInfo = (): UserInfo | null => {
  const cached = uni.getStorageSync('userInfo')
  if (!cached) return null

  if (typeof cached === 'string') {
    try {
      return JSON.parse(cached) as UserInfo
    } catch (_error) {
      return null
    }
  }

  if (typeof cached === 'object') return cached as UserInfo
  return null
}

const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(String(uni.getStorageSync('token') || ''))
  const refreshToken = ref<string>(String(uni.getStorageSync('refreshToken') || ''))
  const userInfo = ref<UserInfo | null>(readUserInfo())
  const tokenExpireAt = ref<number>(Number(uni.getStorageSync('tokenExpireAt') || 0))

  const isTokenExpired = computed(() => {
    if (!tokenExpireAt.value) return true
    return Date.now() >= tokenExpireAt.value - TOKEN_REFRESH_THRESHOLD
  })

  const isLoggedIn = computed(() => Boolean(token.value) && (!tokenExpireAt.value || Date.now() < tokenExpireAt.value))

  const setToken = (value: string, expireAt?: number) => {
    token.value = value || ''
    if (token.value) {
      uni.setStorageSync('token', token.value)
      if (expireAt) {
        tokenExpireAt.value = expireAt
        uni.setStorageSync('tokenExpireAt', expireAt)
      }
    } else {
      uni.removeStorageSync('token')
      uni.removeStorageSync('tokenExpireAt')
      tokenExpireAt.value = 0
    }
  }

  const setRefreshToken = (value: string) => {
    refreshToken.value = value || ''
    if (refreshToken.value) {
      uni.setStorageSync('refreshToken', refreshToken.value)
    } else {
      uni.removeStorageSync('refreshToken')
    }
  }

  const setUserInfo = (value: UserInfo | null) => {
    userInfo.value = value
    if (value) {
      uni.setStorageSync('userInfo', value)
    } else {
      uni.removeStorageSync('userInfo')
    }
  }

  const clearAuth = () => {
    setToken('')
    setRefreshToken('')
    setUserInfo(null)
  }

  const login = async (payload: LoginPayload) => {
    if (isMockMode()) {
      await new Promise((resolve) => setTimeout(resolve, 800))
      const mockToken = 'mock_token_' + Date.now()
      const mockExpireAt = Date.now() + 24 * 60 * 60 * 1000
      const mockRefreshToken = 'mock_refresh_' + Date.now()
      const mockUser: UserInfo = {
        id: 1,
        phone: payload.phone,
        name: payload.phone.slice(0, 3) + '****' + payload.phone.slice(7),
        nickname: '用户' + payload.phone.slice(-4),
        avatar: '',
      }
      setToken(mockToken, mockExpireAt)
      setRefreshToken(mockRefreshToken)
      setUserInfo(mockUser)
      return { token: mockToken, user: mockUser }
    }

    const res = await http.post<{ token: string; refreshToken: string; expireAt: number; user: UserInfo }, LoginPayload>(apiPath('/auth/login'), payload)
    setToken(res.token, res.expireAt)
    setRefreshToken(res.refreshToken)
    setUserInfo(res.user)
    return res
  }

  const register = async (payload: RegisterPayload) => {
    if (isMockMode()) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const mockToken = 'mock_token_' + Date.now()
      const mockExpireAt = Date.now() + 24 * 60 * 60 * 1000
      const mockRefreshToken = 'mock_refresh_' + Date.now()
      const mockUser: UserInfo = {
        id: 1,
        phone: payload.phone,
        name: payload.nickname || payload.phone,
        nickname: payload.nickname || ('用户' + payload.phone.slice(-4)),
        avatar: '',
      }
      setToken(mockToken, mockExpireAt)
      setRefreshToken(mockRefreshToken)
      setUserInfo(mockUser)
      return { token: mockToken, user: mockUser }
    }

    const res = await http.post<{ token: string; refreshToken: string; expireAt: number; user: UserInfo }, RegisterPayload>(apiPath('/auth/register'), payload)
    setToken(res.token, res.expireAt)
    setRefreshToken(res.refreshToken)
    setUserInfo(res.user)
    return res
  }

  const sendSmsCode = async (phone: string) => {
    if (isMockMode()) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      uni.showToast({ title: '模拟验证码：123456', icon: 'none', duration: 3000 })
      return { success: true }
    }
    return http.post<{ success: boolean }, { phone: string }>(apiPath('/auth/sms/send'), { phone })
  }

  const refreshAccessToken = async () => {
    if (!refreshToken.value) {
      clearAuth()
      throw new Error('No refresh token')
    }

    if (isMockMode()) {
      const newToken = 'mock_token_' + Date.now()
      const newExpireAt = Date.now() + 24 * 60 * 60 * 1000
      setToken(newToken, newExpireAt)
      return { token: newToken }
    }

    const res = await http.post<{ token: string; expireAt: number }>(apiPath('/auth/refresh'), { refreshToken: refreshToken.value })
    setToken(res.token, res.expireAt)
    return res
  }

  const fetchUserProfile = async () => {
    if (isMockMode()) {
      return userInfo.value
    }
    const user = await http.get<UserInfo>(apiPath('/auth/profile'))
    setUserInfo(user)
    return user
  }

  const updateUserProfile = async (payload: UpdateUserProfilePayload) => {
    if (isMockMode()) {
      const nextUser = {
        ...(userInfo.value || {}),
        ...payload,
        name: payload.nickname,
        avatar: payload.avatar || userInfo.value?.avatar || '/static/images/profile/default-farmer-avatar.svg',
      }
      setUserInfo(nextUser)
      return nextUser
    }

    const user = await http.put<UserInfo, UpdateUserProfilePayload>(apiPath('/auth/profile'), payload)
    setUserInfo(user)
    return user
  }

  const uploadUserAvatar = async (payload: UploadAvatarPayload) => {
    if (isMockMode()) {
      const nextUser = {
        ...(userInfo.value || {}),
        avatar: payload.dataUrl,
      }
      setUserInfo(nextUser)
      return {
        url: payload.dataUrl,
        objectKey: '',
        mimeType: 'image/png',
        size: payload.dataUrl.length,
        user: nextUser,
      }
    }

    const result = await http.post<UploadAvatarResult, UploadAvatarPayload>(apiPath('/auth/avatar'), payload)
    setUserInfo(result.user)
    return result
  }

  const logout = async () => {
    if (!isMockMode() && token.value) {
      try {
        await http.post(apiPath('/auth/logout'), { token: token.value })
      } catch (_error) {
        // ignore logout error
      }
    }
    clearAuth()
  }

  const requireAuth = (): boolean => {
    if (isLoggedIn.value) {
      if (isTokenExpired.value) {
        refreshAccessToken().catch(() => {
          clearAuth()
          uni.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
        })
      }
      return true
    }
    redirectToLogin()
    return false
  }

  return {
    token,
    refreshToken,
    userInfo,
    isLoggedIn,
    isTokenExpired,
    setToken,
    setRefreshToken,
    setUserInfo,
    clearAuth,
    login,
    register,
    sendSmsCode,
    refreshAccessToken,
    fetchUserProfile,
    updateUserProfile,
    uploadUserAvatar,
    logout,
    requireAuth,
  }
})
