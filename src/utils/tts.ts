export const speakText = (text: string) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
  return true
}

export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}
