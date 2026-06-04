import { ref } from 'vue'
import { sendAssistantMessage } from '../api/assistant'
import type { AssistantAction, AssistantMessage } from '../types/assistant'
import { executeAssistantAction } from '../utils/assistantAction'

const createMessageId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`

const shouldRunAutomatically = (action?: AssistantAction) => {
  if (!action) return false
  if (action.shouldAutoNavigate && action.targetPage) return true
  return action.type === 'navigate' && Boolean(action.targetPage)
}

export const useAssistant = (currentPage?: string) => {
  const messages = ref<AssistantMessage[]>([
    {
      id: createMessageId(),
      role: 'assistant',
      content: '你好，我是云上农管家助手。说一句话，我可以帮你打开页面并预填表单。',
    },
  ])
  const loading = ref(false)

  const sendMessage = async (content: string) => {
    const message = content.trim()
    if (!message || loading.value) return

    messages.value.push({ id: createMessageId(), role: 'user', content: message })
    loading.value = true

    try {
      const response = await sendAssistantMessage({
        message,
        context: { currentPage },
      })
      const autoRun = shouldRunAutomatically(response.action)
      messages.value.push({
        id: createMessageId(),
        role: 'assistant',
        content: response.reply || '我已识别到你的指令，正在处理。',
        action: autoRun ? undefined : response.action,
      })

      if (autoRun) {
        setTimeout(() => executeAssistantAction(response.action), 350)
      }
    } catch (error) {
      console.error('[assistant] chat failed:', error)
      messages.value.push({
        id: createMessageId(),
        role: 'assistant',
        content: '助手暂时没有响应，请稍后再试。',
      })
    } finally {
      loading.value = false
    }
  }

  const runAction = (action?: AssistantAction) => {
    executeAssistantAction(action)
  }

  return {
    messages,
    loading,
    sendMessage,
    runAction,
  }
}
