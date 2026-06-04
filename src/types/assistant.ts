export type AssistantIntent =
  | 'field_add_crop'
  | 'market_query'
  | 'buyer_match'
  | 'marketing_copy'
  | 'diagnosis_advice'
  | 'navigate_market'
  | 'navigate_buyer'
  | 'navigate_marketing'
  | 'general'

export interface AssistantAction {
  type: 'navigate' | 'form_fill' | 'chat'
  intent: AssistantIntent
  targetPage?: string
  formKey?: string
  params?: Record<string, any>
  missingSlots?: string[]
  confirmText?: string
  shouldAutoNavigate?: boolean
  prefillMode?: 'partial' | 'complete'
  notice?: string
}

export interface AssistantChatResponse {
  reply: string
  intent: AssistantIntent
  action?: AssistantAction
  actions?: AssistantAction[]
  cards?: any[]
}

export interface AssistantChatRequest {
  message: string
  context?: {
    currentPage?: string
  }
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  action?: AssistantAction
}
