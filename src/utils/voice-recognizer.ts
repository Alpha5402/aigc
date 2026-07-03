import { recognizeSpeech } from '../api/speech'

type SpeechRecognitionCtor = new () => any
type SpeechErrorMap = Record<string, string>

const RECOGNIZE_TIMEOUT = 12000
const APP_RECORD_DURATION = 8000

const speechErrorMessages: SpeechErrorMap = {
  'no-speech': '没有听到有效语音，请靠近麦克风后再试',
  'audio-capture': '没有检测到可用麦克风，请检查设备或关闭占用麦克风的软件',
  'not-allowed': '麦克风权限未开启，请在系统或浏览器中允许麦克风权限',
  'service-not-allowed': '当前环境不允许使用语音识别服务，请检查权限或改用文字输入',
  network: '语音识别服务连接失败，请检查网络后重试',
  aborted: '语音识别已中断，请重新点击语音按钮',
  'language-not-supported': '当前环境不支持中文语音识别，请使用文字输入',
}

const getSpeechErrorMessage = (error?: string, fallback?: string) => {
  if (error && speechErrorMessages[error]) return speechErrorMessages[error]
  return fallback || `语音识别失败${error ? `：${error}` : ''}，请使用文字输入`
}

const getSpeechRecognition = (): SpeechRecognitionCtor | null => {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

const startWebSpeechRecognize = (): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const Recognition = getSpeechRecognition()
    if (!Recognition) {
      reject(new Error('当前浏览器不支持语音识别，请使用文字输入'))
      return
    }

    const recognition = new Recognition()
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }

    const timer = setTimeout(() => {
      finish(() => {
        try {
          recognition.stop()
        } catch (error) {
          console.warn('[voice] H5 stop error:', error)
        }
        reject(new Error('长时间没有检测到语音，请重新尝试或使用文字输入'))
      })
    }, RECOGNIZE_TIMEOUT)

    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      const text = String(event?.results?.[0]?.[0]?.transcript || '').trim()
      console.log('[voice] H5 result:', text)
      finish(() => {
        if (text) {
          resolve(text)
          return
        }
        reject(new Error('没有识别到有效语音，请重新尝试或使用文字输入'))
      })
    }

    recognition.onerror = (event: any) => {
      console.warn('[voice] H5 error:', event)
      finish(() => {
        reject(new Error(getSpeechErrorMessage(event?.error)))
      })
    }

    recognition.onnomatch = () => {
      finish(() => {
        reject(new Error('没有识别到有效语音，请重新尝试或使用文字输入'))
      })
    }

    try {
      recognition.start()
    } catch (error: any) {
      console.warn('[voice] H5 error:', error)
      finish(() => {
        reject(new Error(getSpeechErrorMessage(error?.name || error?.message, '语音识别启动失败，请使用文字输入')))
      })
    }
  })
}

const waitForPlusReady = () => {
  return new Promise<any>((resolve, reject) => {
    const currentPlus = (globalThis as any).plus

    if (currentPlus) {
      resolve(currentPlus)
      return
    }

    if (typeof document === 'undefined') {
      reject(new Error('当前 App 运行环境未准备完成，请稍后重试'))
      return
    }

    let done = false

    const timer = setTimeout(() => {
      if (done) return
      done = true
      reject(new Error('App 运行环境未准备完成，请稍后重试'))
    }, 3000)

    document.addEventListener(
      'plusready',
      () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve((globalThis as any).plus)
      },
      false,
    )
  })
}

const stringifySpeechError = (error: any) => {
  try {
    return JSON.stringify(error)
  } catch (_stringifyError) {
    return error
  }
}

const readAppFileAsBase64 = (filePath: string): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const plusObj = (globalThis as any).plus
    if (!plusObj?.io) {
      reject(new Error('当前 App 运行环境暂不支持读取录音文件'))
      return
    }

    plusObj.io.resolveLocalFileSystemURL(
      filePath,
      (entry: any) => {
        entry.file(
          (file: any) => {
            const reader = new plusObj.io.FileReader()
            reader.onloadend = (event: any) => {
              const result = String(event?.target?.result || reader.result || '')
              const base64 = result.includes(',') ? result.split(',').pop() : result
              if (base64) {
                resolve(base64)
                return
              }
              reject(new Error('录音文件读取失败，请重新尝试'))
            }
            reader.onerror = () => reject(new Error('录音文件读取失败，请重新尝试'))
            reader.readAsDataURL(file)
          },
          () => reject(new Error('录音文件打开失败，请重新尝试')),
        )
      },
      () => reject(new Error('录音文件不存在，请重新尝试')),
    )
  })
}

const recordAppVoice = (): Promise<{ audioBase64: string; format: string }> => {
  return new Promise((resolve, reject) => {
    if (typeof uni.getRecorderManager !== 'function') {
      reject(new Error('当前 App 基座不支持录音，请使用文字输入'))
      return
    }

    const recorder = uni.getRecorderManager()
    let settled = false
    const cleanup = () => {
      ;(recorder as any).offStop?.(handleStop)
      ;(recorder as any).offError?.(handleError)
    }
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const handleStop = async (result: any) => {
      try {
        const tempFilePath = String(result?.tempFilePath || '')
        if (!tempFilePath) {
          finish(() => reject(new Error('没有生成录音文件，请重新尝试')))
          return
        }
        const audioBase64 = await readAppFileAsBase64(tempFilePath)
        finish(() => resolve({ audioBase64, format: 'pcm' }))
      } catch (error: any) {
        finish(() => reject(error))
      }
    }
    const handleError = (error: any) => {
      console.warn('[voice] App recorder error:', error)
      finish(() => reject(new Error(getSpeechErrorMessage(error?.errMsg || error?.message, '录音失败，请检查麦克风权限'))))
    }

    recorder.onStop(handleStop)
    recorder.onError(handleError)

    try {
      recorder.start({
        duration: APP_RECORD_DURATION,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 256000,
        format: 'PCM' as any,
      })
      uni.showToast({ title: '请说话，8 秒内自动识别', icon: 'none' })
    } catch (error: any) {
      finish(() => reject(new Error(getSpeechErrorMessage(error?.errMsg || error?.message, '录音启动失败，请检查麦克风权限'))))
    }
  })
}

const startPlusSpeechRecognize = async (): Promise<string> => {
  await waitForPlusReady()
  const recording = await recordAppVoice()
  const result = await recognizeSpeech(recording)
  const text = String(result?.text || '').trim()
  if (!text) {
    throw new Error('没有识别到有效语音，请重新尝试或使用文字输入')
  }
  return text
}

export const isVoiceRecognizeSupported = () => {
  // #ifdef H5
  return Boolean(getSpeechRecognition())
  // #endif

  // #ifdef APP-PLUS
  return typeof uni.getRecorderManager === 'function'
  // #endif

  return false
}

export const startVoiceRecognize = (): Promise<string> => {
  console.log('[voice] platform start recognize')

  // #ifdef H5
  return startWebSpeechRecognize()
  // #endif

  // #ifdef APP-PLUS
  return startPlusSpeechRecognize()
  // #endif

  return Promise.reject(new Error('当前平台暂不支持语音识别，请使用文字输入'))
}
