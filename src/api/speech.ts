import { http } from '../utils/request'

const SPEECH_ASR_URL = 'https://agricloud-api.onrender.com/api/speech/asr'

export interface SpeechAsrPayload {
  audioBase64: string
  format: string
}

export interface SpeechAsrResult {
  text: string
}

export const recognizeSpeech = (payload: SpeechAsrPayload) => {
  return http.post<SpeechAsrResult, SpeechAsrPayload>(SPEECH_ASR_URL, payload)
}
