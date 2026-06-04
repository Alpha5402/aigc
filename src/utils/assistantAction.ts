import type { AssistantAction } from '../types/assistant'

const ASSISTANT_PENDING_ACTION_KEY = 'assistant_pending_action'

const tabPages = new Set([
  '/pages/my-field/index',
  '/pages/market/index',
  '/pages/buyer/index',
  '/pages/ads/index',
])

export const saveAssistantPendingAction = (action: AssistantAction) => {
  uni.setStorageSync(ASSISTANT_PENDING_ACTION_KEY, action)
}

export const readAssistantPendingAction = (): AssistantAction | null => {
  const action = uni.getStorageSync(ASSISTANT_PENDING_ACTION_KEY)
  if (!action || typeof action !== 'object') return null
  return action as AssistantAction
}

export const clearAssistantPendingAction = () => {
  uni.removeStorageSync(ASSISTANT_PENDING_ACTION_KEY)
}

export const goAssistantPage = (targetPage: string) => {
  if (!targetPage) return
  const url = targetPage.startsWith('/') ? targetPage : `/${targetPage}`
  if (tabPages.has(url)) {
    uni.switchTab({
      url,
      fail: () => uni.reLaunch({ url }),
    })
    return
  }

  uni.navigateTo({
    url,
    fail: () => uni.redirectTo({ url }),
  })
}

export const executeAssistantAction = (action?: AssistantAction) => {
  if (!action?.targetPage && action?.type !== 'chat') return

  if (action.type === 'form_fill') {
    saveAssistantPendingAction(action)
    goAssistantPage(action.targetPage || '/pages/add-crop/index')
    return
  }

  if (action.type === 'navigate' && action.targetPage) {
    goAssistantPage(action.targetPage)
  }
}
