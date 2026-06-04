import { http } from '../utils/request'
import type { AssistantChatRequest, AssistantChatResponse } from '../types/assistant'

export const sendAssistantMessage = (payload: AssistantChatRequest) => {
  return http.post<AssistantChatResponse, AssistantChatRequest>('/assistant/chat', payload)
}
