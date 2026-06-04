/**
 * AI 农病害诊断服务模块
 * 集成阿里云 DashScope API，支持流式输出
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | AIMessageContent[]
}

export interface AIMessageContent {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface AIStreamCallbacks {
  onText?: (text: string) => void
  onComplete?: (fullText: string, tokens?: number) => void
  onError?: (error: Error) => void
  onAbort?: () => void
}

const SYSTEM_PROMPT = `你是一位专业的农业病害诊断专家，拥有丰富的农作物病理学知识。你的职责是：

1. **病害识别**：通过用户提供的图片和描述，准确识别作物病害类型（真菌、细菌、病毒、线虫等）
2. **虫害诊断**：识别作物虫害类型，分析危害程度
3. **营养诊断**：判断作物是否存在营养缺乏或过剩问题
4. **防治建议**：提供科学、实用的防治方案，包括农业防治、生物防治、化学防治等
5. **预防措施**：指导用户如何预防病害发生

回答时请：
- 先明确诊断结果（病害/虫害/营养问题名称）
- 说明病因或致病因素
- 提供详细的防治方案
- 给出预防建议
- 如需更多信息，请主动询问

注意：如果图片不清晰或信息不足，请诚实告知用户，不要猜测诊断结果。`

const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

function getApiKey(): string {
  const urlParams = new URLSearchParams(window.location.search)
  const urlApiKey = urlParams.get('api_key')
  const storedKey = uni.getStorageSync('BAI_LIAN_API_KEY')
  const defaultKey = 'YOUR_API_KEY_HERE'
  return urlApiKey || storedKey || defaultKey
}

function getModelName(): string {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('model') || uni.getStorageSync('MODEL_NAME') || 'qwen-vl-max'
}

export function createAbortController(): AbortController {
  return new AbortController()
}

export async function sendAIMessage(
  messages: AIMessage[],
  callbacks: AIStreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const apiKey = getApiKey()
  const modelName = getModelName()

  const messagesWithSystem: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages
  ]

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages: messagesWithSystem,
        stream: true,
        stream_options: { include_usage: true }
      }),
      signal: signal
    })

    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}`
      if (response.status === 401) {
        errorMessage = 'API Key 无效，请检查配置'
      } else if (response.status === 429) {
        errorMessage = '请求过于频繁，请稍后重试'
      }
      throw new Error(errorMessage)
    }

    await processSSEStream(response.body!, callbacks, signal)

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('用户主动终止了生成过程')
      callbacks.onAbort?.()
      return
    }
    console.error('AI请求错误:', error)
    callbacks.onError?.(error)
  }
}

async function processSSEStream(
  readableStream: ReadableStream<Uint8Array>,
  callbacks: AIStreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  let fullText = ''
  let totalTokens: number | undefined
  const decoder = new TextDecoder('utf-8')
  const reader = readableStream.getReader()

  try {
    while (true) {
      if (signal?.aborted) {
        callbacks.onAbort?.()
        break
      }

      const { done, value } = await reader.read()

      if (done) {
        callbacks.onComplete?.(fullText, totalTokens)
        break
      }

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.trim() === '' || !line.startsWith('data: ')) continue
        const dataStr = line.slice(6)
        if (dataStr === '[DONE]') continue

        try {
          const parsed = JSON.parse(dataStr)
          const delta = parsed.choices?.[0]?.delta?.content || ''

          if (delta) {
            fullText += delta
            callbacks.onText?.(fullText)
          }

          if (parsed.usage) {
            totalTokens = parsed.usage.total_tokens
          }
        } catch {
          // 忽略单行解析错误
        }
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      callbacks.onAbort?.()
    } else {
      callbacks.onError?.(error)
    }
  } finally {
    reader.releaseLock()
  }
}

export function prepareMultimodalContent(text: string, imageBase64?: string): AIMessageContent[] {
  const content: AIMessageContent[] = []

  if (imageBase64) {
    content.push({
      type: 'image_url',
      image_url: { url: imageBase64 }
    })
  }

  if (text.trim()) {
    content.push({
      type: 'text',
      text: text
    })
  }

  return content
}

export function isApiConfigured(): boolean {
  const apiKey = getApiKey()
  return apiKey !== 'YOUR_API_KEY_HERE' && apiKey.length > 10
}

export function getApiConfigStatus(): { configured: boolean; maskedKey: string } {
  const apiKey = getApiKey()
  const configured = apiKey !== 'YOUR_API_KEY_HERE' && apiKey.length > 10
  const maskedKey = configured && apiKey.length > 8
    ? apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4)
    : '未配置'

  return { configured, maskedKey }
}
