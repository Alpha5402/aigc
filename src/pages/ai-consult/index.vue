<template>
  <AppPage class="diagnosis-page">
    <view class="consult-shell">
      <view class="consult-topbar">
        <button class="topbar-btn acm-touchable" @click="goBack">
          <SvgIcon name="chevron-left" :size="20" color="var(--acm-brand-primary-dark)" />
        </button>
        <view class="topbar-title">
          <text>AI 智能问诊</text>
          <text>农技问答助手</text>
        </view>
        <button class="topbar-pill acm-touchable" @click="resetConsult">
          <SvgIcon name="plus" :size="15" color="var(--acm-brand-primary-dark)" />
          <text>新对话</text>
        </button>
        <button class="topbar-pill acm-touchable" @click="toggleHistoryPanel">
          <SvgIcon name="message-square-text" :size="15" color="var(--acm-brand-primary-dark)" />
          <text>历史</text>
        </button>
        <button class="topbar-btn acm-touchable" @click="showApiConfig">
          <SvgIcon name="settings" :size="18" color="var(--acm-brand-primary-dark)" />
        </button>
      </view>

      <!-- <view class="intro-card">
        <view class="intro-copy">
          <text class="intro-title">农技问诊助手</text>
          <text class="intro-desc">描述症状或上传作物近照，获取初步处理建议。</text>
        </view>
        <view class="intro-icon">
          <SvgIcon name="stethoscope" :size="25" color="var(--acm-brand-primary-dark)" />
        </view>
      </view> -->

      <view class="consult-body">
        <view class="chat-area">
          <view v-for="message in chatMessages" :key="message.id" :class="['chat-row', message.type === 'user' ? 'chat-row--user' : 'chat-row--ai']">
            <view v-if="message.type === 'ai'" class="chat-avatar">
              <SvgIcon name="leaf" :size="19" color="var(--acm-brand-primary-dark)" />
            </view>
            <view :class="['chat-bubble', message.type === 'user' ? 'chat-bubble--user' : 'chat-bubble--ai']">
              <ImageWithFallback
                v-if="message.image"
                :src="message.image"
                class="chat-image"
                mode="aspectFill"
                @click="previewImage(message.image)"
              />
              <view v-if="message.thinking" class="thinking-line">
                <SvgIcon name="loader-circle" :size="16" color="var(--acm-brand-primary)" class="spin" />
                <text>正在分析症状并整理建议...</text>
              </view>
              <view v-else-if="message.type === 'ai'" class="chat-content" v-html="formatContent(message.content)"></view>
              <text v-else class="chat-text">{{ message.content }}</text>
              <text class="chat-time">{{ formatTime(message.timestamp) }}</text>
            </view>
          </view>
          <view v-if="hasConversation" class="consult-note consult-note--inline">
            <SvgIcon name="info" :size="16" color="var(--acm-info)" />
            <text>AI 建议仅供初步参考，实际处理请结合当地农技指导和现场情况。</text>
          </view>
        </view>
      </view>

      <view v-if="!hasConversation" class="consult-note consult-note--fixed">
        <SvgIcon name="info" :size="16" color="var(--acm-info)" />
        <text>AI 建议仅供初步参考，实际处理请结合当地农技指导和现场情况。</text>
      </view>

      <view class="input-spacer"></view>
    </view>
  </AppPage>

  <view v-show="showHistoryPanel" class="history-drawer__mask" :class="{ 'is-open': showHistoryPanel }" @click="closeHistoryPanel">
    <view class="history-drawer" :class="{ 'is-open': showHistoryPanel }" @click.stop>
      <view class="history-drawer__head">
        <text class="history-drawer__title">历史记录</text>
        <button class="history-drawer__close" @click="closeHistoryPanel">
          <SvgIcon name="x" :size="14" color="var(--acm-text-regular)" />
        </button>
      </view>
      <view class="history-drawer__list">
        <view v-if="!historySidebarItems.length" class="history-drawer__empty">暂无历史对话</view>
        <view v-for="record in historySidebarItems" :key="record.id" class="history-drawer__item" @click="restoreHistory(record)">
          <SvgIcon name="message-square-text" :size="14" color="var(--acm-brand-primary)" />
          <text class="history-drawer__text">{{ stripHtml(record.content) }}</text>
          <text class="history-drawer__time">{{ formatTime(record.timestamp) }}</text>
        </view>
      </view>
    </view>
  </view>

  <view v-if="selectedImage" class="floating-preview">
    <ImageWithFallback :src="selectedImage" class="floating-preview__image" mode="aspectFill" @click="previewImage(selectedImage)" />
    <button class="floating-preview__close" @click="removeSelectedImage">
      <SvgIcon name="x" :size="13" color="var(--acm-text-inverse)" />
    </button>
    <view v-if="imageCompressing" class="preview-loading">
      <text>{{ uploadProgress >= 100 ? '处理中...' : `上传中 ${uploadProgress}%` }}</text>
    </view>
  </view>

  <view v-if="showImageOptions" class="upload-popover">
    <button class="upload-choice" @click="chooseFromCamera">
      <SvgIcon name="camera" :size="19" color="var(--acm-brand-primary)" />
      <text>拍照</text>
    </button>
    <button class="upload-choice" @click="chooseFromAlbum">
      <SvgIcon name="image" :size="19" color="var(--acm-brand-primary)" />
      <text>相册</text>
    </button>
  </view>

  <view class="bottom-composer">
    <button class="composer-tool" @click="toggleImageOptions">
      <SvgIcon name="image-plus" :size="21" color="var(--acm-brand-primary-dark)" />
    </button>
    <button :class="['composer-tool', listening ? 'composer-tool--active' : '']" @click="showVoiceHint">
      <SvgIcon :name="listening ? 'audio-lines' : 'mic'" :size="20" color="var(--acm-brand-primary-dark)" />
    </button>
    <textarea
      class="composer-input"
      :value="inputText"
      placeholder="请输入要咨询的农业问题"
      :adjust-position="true"
      :cursor-spacing="120"
      :show-confirm-bar="false"
      confirm-type="send"
      @input="onInput"
      @confirm="handleSendMessage"
    />
    <button :class="['composer-send', canSend ? 'composer-send--ready' : '']" :disabled="!canSend || isSending" @click="handleSendMessage">
      <SvgIcon :name="isSending ? 'square' : 'arrow-up'" :size="20" color="var(--acm-text-inverse)" />
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad, onUnload, onBackPress } from '@dcloudio/uni-app'
import AppPage from '../../components/common/AppPage.vue'
import ImageWithFallback from '../../components/common/ImageWithFallback.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { useAssistantSpeech } from '../../composables/useAssistantSpeech'
import { validateAiConsultInput } from '../../utils/validators'
import { askAiDiagnosis, getAiDiagnosisHistory, type AIDiagnosisHistoryItem } from '../../api/agri'
import { uploadImage } from '../../utils/upload'

interface MessageItem {
  id: string
  type: 'user' | 'ai'
  content: string
  image?: string
  imageUrl?: string
  timestamp: number
  thinking?: boolean
  tokens?: number
}

const WELCOME_MESSAGE = '您好，这里是农技问诊助手。请描述作物症状，或上传叶片、果实、茎秆近照，我会整理初步处理建议。'

const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const messages = ref<MessageItem[]>([
  {
    id: createMessageId(),
    type: 'ai',
    content: WELCOME_MESSAGE,
    timestamp: Date.now(),
  },
])
const historyLoaded = ref(false)

const inputText = ref('')
const selectedImage = ref('')
const selectedImageUrl = ref('')
const showImageOptions = ref(false)
const scrollTop = ref(0)
const isSending = ref(false)
const keyboardHeight = ref(0)
const imageCompressing = ref(false)
const uploadProgress = ref(0)
const requestStopped = ref(false)
const currentMessageIds = ref<string[]>([])
const { listening, listenOnce } = useAssistantSpeech()

const canSend = ref(false)
const showHistoryPanel = ref(false)
const historySidebarItems = computed(() =>
  messages.value.filter((message) => message.type === 'user' && message.content).slice().reverse(),
)
const chatMessages = computed(() => {
  const activeMessages = currentMessageIds.value
    .map((id) => messages.value.find((message) => message.id === id))
    .filter(Boolean) as MessageItem[]
  return activeMessages.length ? activeMessages : [createWelcomeMessage()]
})
const hasConversation = computed(() => chatMessages.value.some((message) => message.type === 'user'))

const onKeyboardHeightChange = (event: any) => {
  keyboardHeight.value = Number(event?.height || 0)
  if (keyboardHeight.value > 0) {
    showImageOptions.value = false
  }
}

const refreshCanSend = () => {
  canSend.value = Boolean(inputText.value.trim() || selectedImage.value)
}

const bumpScroll = () => {
  nextTick(() => {
    scrollTop.value += 100000
  })
}

const createWelcomeMessage = (): MessageItem => ({
  id: createMessageId(),
  type: 'ai',
  content: WELCOME_MESSAGE,
  timestamp: Date.now(),
})

const buildHistoryMessages = (historyList: AIDiagnosisHistoryItem[]): MessageItem[] => {
  const orderedHistory = [...historyList].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  )

  const historyMessages: MessageItem[] = []
  orderedHistory.forEach((item) => {
    const baseTimestamp = new Date(item.createdAt).getTime() || Date.now()
    historyMessages.push({
      id: `history-user-${item.id}`,
      type: 'user',
      content: item.content || '请帮我看下这个作物的问题',
      image: item.image || undefined,
      imageUrl: item.image || undefined,
      timestamp: baseTimestamp,
    })
    historyMessages.push({
      id: `history-ai-${item.id}`,
      type: 'ai',
      content: item.reply,
      timestamp: baseTimestamp + 1,
    })
  })

  return historyMessages
}

const loadDiagnosisHistory = async () => {
  try {
    const { historyList } = await getAiDiagnosisHistory()
    messages.value = historyList?.length ? buildHistoryMessages(historyList) : [createWelcomeMessage()]
  } catch (_error) {
    messages.value = [createWelcomeMessage()]
  } finally {
    historyLoaded.value = true
    bumpScroll()
  }
}

const onInput = (event: any) => {
  inputText.value = event?.detail?.value || ''
  refreshCanSend()
}

const toggleImageOptions = () => {
  showImageOptions.value = !showImageOptions.value
}

const toggleHistoryPanel = () => {
  showHistoryPanel.value = !showHistoryPanel.value
}

const closeHistoryPanel = () => {
  showHistoryPanel.value = false
}

const removeSelectedImage = () => {
  selectedImage.value = ''
  selectedImageUrl.value = ''
  uploadProgress.value = 0
  refreshCanSend()
}

const previewImage = (src: string) => {
  uni.previewImage({
    urls: [src],
    current: src
  })
}

const chooseImage = async (sourceType: Array<'camera' | 'album'>) => {
  showImageOptions.value = false
  imageCompressing.value = true
  uploadProgress.value = 0

  uni.chooseImage({
    count: 1,
    sourceType,
    success: async (res) => {
      const filePath = res.tempFilePaths[0]
      selectedImage.value = filePath

      const uploadResult = await uploadImage({
        filePath,
        onProgress: (progress) => {
          uploadProgress.value = progress
        },
      })

      if (uploadResult.success && uploadResult.url) {
        selectedImageUrl.value = uploadResult.url
      } else {
        uni.showToast({ title: uploadResult.error || '图片上传失败', icon: 'none' })
        selectedImage.value = ''
        selectedImageUrl.value = ''
        uploadProgress.value = 0
      }

      imageCompressing.value = false
      refreshCanSend()
    },
    fail: () => {
      imageCompressing.value = false
      uploadProgress.value = 0
      uni.showToast({ title: '选择图片失败', icon: 'none' })
    },
  })
}

const chooseFromCamera = () => chooseImage(['camera'])
const chooseFromAlbum = () => chooseImage(['album'])

const showVoiceHint = async () => {
  const recognizedText = await listenOnce()
  if (!recognizedText) return
  inputText.value = `${inputText.value}${inputText.value ? '，' : ''}${recognizedText}`
  refreshCanSend()
}

const showApiConfig = () => {
  uni.showModal({
    title: 'AI 配置状态',
    content: 'AI 问诊已改为后端代理模式。请在服务器 backend/.env 中配置 DASHSCOPE_API_KEY、DASHSCOPE_TEXT_MODEL 和 DASHSCOPE_VL_MODEL；调用失败时会直接提示错误，避免返回演示诊断。',
    showCancel: false,
    confirmText: '知道了'
  })
}

const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.redirectTo({ url: '/pages/my-field/index' })
  }
}

const resetConsult = () => {
  inputText.value = ''
  selectedImage.value = ''
  selectedImageUrl.value = ''
  uploadProgress.value = 0
  showImageOptions.value = false
  requestStopped.value = true
  isSending.value = false
  currentMessageIds.value = []
  refreshCanSend()
}

const restoreHistory = (record: MessageItem) => {
  const recordIndex = messages.value.findIndex((message) => message.id === record.id)
  if (recordIndex < 0) return
  const ids = [record.id]
  const nextMessage = messages.value[recordIndex + 1]
  if (nextMessage?.type === 'ai') ids.push(nextMessage.id)
  currentMessageIds.value = ids
  closeHistoryPanel()
}

const stripHtml = (content: string): string => {
  if (!content) return ''
  return sanitizeContent(content)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96)
}

const formatContent = (content: string): string => {
  if (!content) return ''
  return renderMarkdown(sanitizeContent(content))
}

const sanitizeContent = (content: string): string => {
  return content
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[🔍📖🛡️👁️]/g, '')
}

const escapeHtml = (content: string): string =>
  content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const renderInlineMarkdown = (content: string): string => {
  const escaped = escapeHtml(content)
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(\S(?:.*?\S)?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_(\S(?:.*?\S)?)_/g, '$1<em>$2</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
}

const renderMarkdown = (content: string): string => {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let listType: 'ul' | 'ol' | '' = ''

  const closeList = () => {
    if (!listType) return
    html.push(`</${listType}>`)
    listType = ''
  }

  const openList = (type: 'ul' | 'ol') => {
    if (listType === type) return
    closeList()
    html.push(`<${type} class="md-list md-list--${type}">`)
    listType = type
  }

  lines.forEach((rawLine) => {
    const line = rawLine.trim()

    if (!line) {
      closeList()
      return
    }

    if (/^[-*_]{3,}$/.test(line)) {
      closeList()
      html.push('<hr class="md-divider">')
      return
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      closeList()
      const level = Math.min(3, headingMatch[1].length)
      html.push(`<h${level} class="md-heading md-heading--${level}">${renderInlineMarkdown(headingMatch[2])}</h${level}>`)
      return
    }

    const orderedMatch = line.match(/^(\d+)[.)]\s+(.+)$/)
    if (orderedMatch) {
      openList('ol')
      html.push(`<li>${renderInlineMarkdown(orderedMatch[2])}</li>`)
      return
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/)
    if (unorderedMatch) {
      openList('ul')
      html.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`)
      return
    }

    closeList()
    html.push(`<p class="md-paragraph">${renderInlineMarkdown(line)}</p>`)
  })

  closeList()
  return html.join('')
}

const handleSendMessage = async () => {
  const errorText = validateAiConsultInput(inputText.value, selectedImage.value)
  if (errorText) {
    uni.showToast({ title: errorText, icon: 'none' })
    return
  }

  if (isSending.value) return

  const userMessage: MessageItem = {
    id: createMessageId(),
    type: 'user',
    content: inputText.value.trim() || '请帮我看下这个作物的问题',
    image: selectedImage.value || undefined,
    imageUrl: selectedImageUrl.value || undefined,
    timestamp: Date.now(),
  }

  messages.value.push(userMessage)
  currentMessageIds.value = [userMessage.id]

  inputText.value = ''
  selectedImage.value = ''
  selectedImageUrl.value = ''
  uploadProgress.value = 0
  showImageOptions.value = false
  refreshCanSend()
  bumpScroll()

  isSending.value = true
  requestStopped.value = false

  const aiMessageId = createMessageId()
  messages.value.push({
    id: aiMessageId,
    type: 'ai',
    content: '',
    timestamp: Date.now(),
    thinking: true,
  })
  currentMessageIds.value.push(aiMessageId)
  bumpScroll()

  try {
    const result = await askAiDiagnosis({
      content: userMessage.content,
      image: userMessage.imageUrl,
    })

    const lastMessage = messages.value.find((item) => item.id === aiMessageId)
    if (lastMessage) {
      lastMessage.thinking = false
      lastMessage.content = requestStopped.value ? '已停止生成' : result.reply
    }
  } catch (error: any) {
    const lastMessage = messages.value.find((item) => item.id === aiMessageId)
    if (lastMessage) {
      lastMessage.thinking = false
      lastMessage.content = `诊断失败: ${error?.message || '请求失败'}`
    }
    uni.showToast({ title: error?.message || '请求失败', icon: 'none' })
  } finally {
    isSending.value = false
    bumpScroll()
  }
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

onLoad(() => {
  if (typeof uni.onKeyboardHeightChange === 'function') {
    uni.onKeyboardHeightChange(onKeyboardHeightChange)
  }
  if (!historyLoaded.value) {
    loadDiagnosisHistory()
  }
})

onUnload(() => {
  if (typeof uni.offKeyboardHeightChange === 'function') {
    uni.offKeyboardHeightChange(onKeyboardHeightChange)
  }
  requestStopped.value = true
})

onBackPress((options) => {
  // 拦截手机物理返回键，与左上角返回按钮行为一致
  if (options.from === 'backbutton') {
    goBack()
    return true
  }
  return false
})

refreshCanSend()
</script>

<style scoped lang="scss">
.diagnosis-page {
  background: var(--acm-bg-app);
}

.consult-shell {
  min-height: 100%;
  box-sizing: border-box;
  padding-bottom: calc(178rpx + env(safe-area-inset-bottom));
}

.consult-topbar {
  min-height: 78rpx;
  padding: calc(12rpx + constant(safe-area-inset-top)) 0 12rpx;
  padding: calc(12rpx + env(safe-area-inset-top)) 0 12rpx;
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.topbar-title {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.topbar-title text:first-child {
  color: var(--acm-text-primary);
  font-size: 32rpx;
  font-weight: 850;
  line-height: 1.15;
}

.topbar-title text:last-child {
  color: var(--acm-text-secondary);
  font-size: 22rpx;
}

.topbar-btn {
  width: 62rpx;
  height: 62rpx;
  box-shadow: none;
}

.topbar-pill {
  height: 62rpx;
  padding: 0 18rpx;
  box-shadow: none;
  white-space: nowrap;
}

.topbar-btn,
.topbar-pill {
  border: 1rpx solid rgba(200, 222, 197, 0.72);
  border-radius: 999rpx;
  background: rgba(255, 254, 249, 0.86);
  color: var(--acm-brand-primary-dark);
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.intro-card {
  position: relative;
  min-height: 154rpx;
  border: 1rpx solid rgba(207, 222, 202, 0.86);
  border-radius: 30rpx;
  background:
    linear-gradient(100deg, rgba(255, 254, 249, 0.98) 0%, rgba(255, 254, 249, 0.9) 64%, rgba(255, 254, 249, 0.42) 100%),
    url('/static/images/ai-consult/leaf-disease-closeup.jpg');
  background-size: cover;
  background-position: right center;
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 26rpx;
  margin-bottom: 18rpx;
}

.intro-copy {
  max-width: 480rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.intro-title {
  color: var(--acm-brand-primary-dark);
  font-size: 36rpx;
  font-weight: 880;
  line-height: 1.18;
}

.intro-desc {
  color: var(--acm-text-regular);
  font-size: 25rpx;
  line-height: 1.5;
}

.intro-icon {
  width: 70rpx;
  height: 70rpx;
  border-radius: 22rpx;
  background: rgba(255, 254, 249, 0.78);
  border: 1rpx solid rgba(200, 222, 197, 0.68);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.history-section {
  margin-bottom: 18rpx;
  border: 1rpx solid rgba(207, 222, 202, 0.72);
  border-radius: 26rpx;
  background: rgba(255, 254, 249, 0.7);
  box-shadow: none;
  padding: 18rpx;
}

.history-head {
  margin-bottom: 12rpx;
}

.card-title {
  display: block;
  color: var(--acm-brand-primary-dark);
  font-size: 29rpx;
  font-weight: 820;
  line-height: 1.25;
}

.card-desc {
  display: block;
  margin-top: 5rpx;
  color: var(--acm-text-secondary);
  font-size: 23rpx;
  line-height: 1.4;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 0;
}

.history-card {
  min-height: 64rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.54);
  border-radius: 18rpx;
  background: rgba(255, 254, 249, 0.78);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 14rpx;
}

.history-text {
  color: var(--acm-text-regular);
  font-size: 24rpx;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.consult-body {
  display: flex;
  align-items: flex-start;
}

.history-drawer__mask {
  position: fixed;
  inset: 0;
  z-index: 992;
  background: rgba(17, 24, 19, 0.28);
  display: flex;
  justify-content: flex-end;
  opacity: 0;
  transition: opacity 0.5s ease-out;
}

.history-drawer__mask.is-open {
  opacity: 1;
}

.history-drawer {
  width: 72vw;
  max-width: 520rpx;
  height: 100%;
  background: rgba(255, 254, 249, 0.98);
  box-shadow: -20rpx 0 30rpx rgba(40, 56, 42, 0.12);
  padding: calc(28rpx + constant(safe-area-inset-top)) 22rpx 30rpx;
  padding: calc(28rpx + env(safe-area-inset-top)) 22rpx 30rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  transform: translateX(100%);
  transition: transform 0.5s cubic-bezier(0.2, 1.15, 0.35, 1);
  will-change: transform;
}

.history-drawer.is-open {
  transform: translateX(0);
}

.history-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-drawer__title {
  color: var(--acm-text-primary);
  font-size: 30rpx;
  font-weight: 820;
}

.history-drawer__close {
  width: 52rpx;
  height: 52rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.72);
  border-radius: 999rpx;
  background: rgba(255, 254, 249, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}

.history-drawer__list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  overflow-y: auto;
  flex: 1;
  padding-right: 6rpx;
}

.history-drawer__item {
  border: 1rpx solid rgba(200, 222, 197, 0.54);
  border-radius: 18rpx;
  background: rgba(255, 254, 249, 0.96);
  padding: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.history-drawer__text {
  color: var(--acm-text-regular);
  font-size: 24rpx;
  line-height: 1.45;
  max-height: 96rpx;
  overflow: hidden;
}

.history-drawer__time {
  color: var(--acm-text-secondary);
  font-size: 20rpx;
}

.history-drawer__empty {
  color: var(--acm-text-secondary);
  font-size: 24rpx;
  padding: 12rpx;
  text-align: center;
}

.chat-row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
}

.chat-row--user {
  justify-content: flex-end;
}

.chat-row--ai {
  justify-content: flex-start;
}

.chat-avatar {
  width: 58rpx;
  height: 58rpx;
  border-radius: 20rpx;
  background: var(--acm-brand-primary-soft);
  border: 1rpx solid rgba(200, 222, 197, 0.68);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-bubble {
  max-width: 78%;
  border-radius: 26rpx;
  padding: 18rpx 20rpx 14rpx;
  box-sizing: border-box;
  box-shadow: 0 8rpx 22rpx rgba(64, 84, 62, 0.055);
}

.chat-bubble--ai {
  border-top-left-radius: 10rpx;
  background: rgba(255, 254, 249, 0.96);
  border: 1rpx solid rgba(207, 222, 202, 0.86);
}

.chat-bubble--user {
  border-top-right-radius: 10rpx;
  background: linear-gradient(180deg, var(--acm-brand-primary), var(--acm-brand-primary-dark));
  color: var(--acm-text-inverse);
}

.chat-image {
  width: 260rpx;
  height: 190rpx;
  border-radius: 18rpx;
  margin-bottom: 12rpx;
}

.chat-content {
  color: var(--acm-text-primary);
  font-size: 28rpx;
  line-height: 1.72;
}

.chat-content :deep(.md-heading) {
  display: block;
  margin: 0 0 12rpx;
  color: var(--acm-brand-primary-dark);
  font-weight: 860;
  line-height: 1.35;
}

.chat-content :deep(.md-heading--1),
.chat-content :deep(.md-heading--2),
.chat-content :deep(.md-heading--3) {
  font-size: 30rpx;
}

.chat-content :deep(.md-paragraph) {
  margin: 0 0 14rpx;
}

.chat-content :deep(.md-paragraph:last-child) {
  margin-bottom: 0;
}

.chat-content :deep(.md-divider) {
  height: 1rpx;
  border: 0;
  margin: 18rpx 0;
  background: rgba(200, 222, 197, 0.86);
}

.chat-content :deep(.md-list) {
  margin: 0 0 14rpx;
  padding-left: 34rpx;
}

.chat-content :deep(.md-list li) {
  margin-bottom: 8rpx;
  padding-left: 4rpx;
}

.chat-content :deep(strong) {
  color: var(--acm-brand-primary-dark);
  font-weight: 850;
}

.chat-content :deep(em) {
  font-style: normal;
  color: var(--acm-text-regular);
}

.chat-content :deep(code) {
  display: inline-block;
  max-width: 100%;
  box-sizing: border-box;
  border-radius: 8rpx;
  background: rgba(238, 247, 236, 0.88);
  color: var(--acm-brand-primary-dark);
  font-size: 24rpx;
  line-height: 1.4;
  padding: 2rpx 8rpx;
  word-break: break-all;
}

.chat-text {
  color: var(--acm-text-inverse);
  font-size: 28rpx;
  line-height: 1.55;
}

.thinking-line {
  display: flex;
  align-items: center;
  gap: 10rpx;
  color: var(--acm-text-regular);
  font-size: 26rpx;
}

.chat-time {
  display: block;
  margin-top: 10rpx;
  color: var(--acm-text-secondary);
  font-size: 20rpx;
}

.chat-bubble--user .chat-time {
  color: rgba(255, 254, 247, 0.72);
}

.consult-note {
  margin-top: 20rpx;
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  border-radius: 22rpx;
  background: rgba(230, 241, 244, 0.64);
  color: var(--acm-info-text);
  font-size: 24rpx;
  line-height: 1.5;
  padding: 16rpx 18rpx;
}

.consult-note--fixed {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: calc(136rpx + env(safe-area-inset-bottom));
  z-index: 979;
  margin-top: 0;
  box-shadow: 0 10rpx 26rpx rgba(64, 84, 62, 0.12);
}

.consult-note--inline {
  margin-top: 16rpx;
}

.input-spacer {
  height: calc(158rpx + env(safe-area-inset-bottom));
}

.bottom-composer {
  position: fixed;
  left: 22rpx;
  right: 22rpx;
  bottom: calc(18rpx + env(safe-area-inset-bottom));
  z-index: 980;
  min-height: 104rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.8);
  border-radius: 999rpx;
  background: rgba(255, 254, 249, 0.96);
  box-shadow: 0 12rpx 34rpx rgba(64, 84, 62, 0.13);
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 13rpx;
  box-sizing: border-box;
}

.composer-tool,
.composer-send {
  width: 70rpx;
  height: 70rpx;
  border: 0;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.composer-tool {
  background: var(--acm-brand-primary-soft);
}

.composer-tool--active {
  background: rgba(214, 168, 58, 0.24);
  box-shadow: inset 0 0 0 1rpx rgba(214, 168, 58, 0.34);
}

.composer-input {
  flex: 1;
  min-width: 0;
  height: 70rpx;
  max-height: 116rpx;
  color: var(--acm-text-primary);
  font-size: 28rpx;
  line-height: 1.45;
  padding: 12rpx 0;
  box-sizing: border-box;
}

.composer-send {
  background: var(--acm-neutral);
  opacity: 0.58;
}

.composer-send--ready {
  background: var(--acm-brand-primary);
  opacity: 1;
}

.floating-preview {
  position: fixed;
  left: 42rpx;
  bottom: calc(138rpx + env(safe-area-inset-bottom));
  z-index: 979;
  width: 142rpx;
  height: 142rpx;
}

.floating-preview__image {
  width: 142rpx;
  height: 142rpx;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 24rpx rgba(64, 84, 62, 0.12);
}

.floating-preview__close {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 42rpx;
  height: 42rpx;
  border: 0;
  border-radius: 999rpx;
  background: var(--acm-danger);
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-loading {
  position: absolute;
  inset: 0;
  border-radius: 24rpx;
  background: rgba(33, 53, 40, 0.42);
  color: var(--acm-text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
}

.upload-popover {
  position: fixed;
  left: 34rpx;
  bottom: calc(136rpx + env(safe-area-inset-bottom));
  z-index: 981;
  display: flex;
  gap: 12rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.78);
  border-radius: 24rpx;
  background: rgba(255, 254, 249, 0.96);
  box-shadow: 0 12rpx 30rpx rgba(64, 84, 62, 0.12);
  padding: 12rpx;
}

.upload-choice {
  min-width: 118rpx;
  min-height: 70rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.6);
  border-radius: 18rpx;
  background: rgba(238, 247, 236, 0.74);
  color: var(--acm-brand-primary-dark);
  font-size: 25rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.spin {
  animation: acmSpin 1s linear infinite;
}

@keyframes acmSpin {
  to {
    transform: rotate(360deg);
  }
}
</style>
