import { http } from '../utils/request'
import type { AssistantChatRequest, AssistantChatResponse } from '../types/assistant'

const API_BASE_URL = 'https://agricloud-api.onrender.com/api'

const apiPath = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export const sendAssistantMessage = (payload: AssistantChatRequest) => {
  return http.post<AssistantChatResponse, AssistantChatRequest>(apiPath('/assistant/chat'), payload)
}
