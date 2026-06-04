import type { AssistantAction } from '../types/assistant'
import { clearAssistantPendingAction, readAssistantPendingAction } from '../utils/assistantAction'

export const useAssistantPrefill = () => {
  const consumePendingFormFill = (formKey: string): AssistantAction | null => {
    const action = readAssistantPendingAction()
    if (!action || action.type !== 'form_fill' || action.formKey !== formKey) return null
    clearAssistantPendingAction()
    return action
  }

  return {
    consumePendingFormFill,
  }
}
