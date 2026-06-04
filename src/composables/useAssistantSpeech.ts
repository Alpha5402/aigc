import { ref } from 'vue'
import { isVoiceRecognizeSupported, startVoiceRecognize } from '../utils/voice-recognizer'

export const useAssistantSpeech = () => {
  const listening = ref(false)
  const supported = isVoiceRecognizeSupported()

  const listenOnce = async () => {
    if (listening.value) return ''

    if (!supported) {
      uni.showToast({ title: '当前平台暂不支持语音识别，请使用文字输入', icon: 'none' })
      return ''
    }

    listening.value = true
    try {
      return await startVoiceRecognize()
    } catch (error: any) {
      uni.showToast({ title: error?.message || '语音识别失败，请使用文字输入', icon: 'none' })
      return ''
    } finally {
      listening.value = false
    }
  }

  return {
    listening,
    supported,
    listenOnce,
  }
}
