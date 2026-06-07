<template>
  <view class="edit-page">
    <scroll-view class="edit-scroll" scroll-y :show-scrollbar="false">
      <view class="edit-hero">
        <view class="edit-hero__grain"></view>
        <view class="edit-nav">
          <button class="nav-back acm-touchable" @click="goBack">
            <SvgIcon name="chevron-left" :size="22" color="var(--acm-text-inverse)" />
          </button>
          <text class="edit-title">修改个人档案</text>
          <view class="nav-spacer"></view>
        </view>

        <view class="avatar-panel">
          <view class="avatar-frame">
            <image class="avatar-image" :src="form.avatar" mode="aspectFill" />
          </view>
          <view class="avatar-copy">
            <text class="avatar-title">农户身份头像</text>
            <text class="avatar-desc">{{ avatarUploading ? '正在上传头像...' : '' }}</text>
            <button class="avatar-upload-btn" :disabled="avatarUploading" @click="chooseAvatar">
              <SvgIcon :name="avatarUploading ? 'loader-circle' : 'image-plus'" :size="15" color="var(--acm-brand-primary)" :class="avatarUploading ? 'spin' : ''" />
              <text>{{ avatarUploading ? '上传中' : '更换头像' }}</text>
            </button>
          </view>
        </view>
      </view>

      <view class="form-card">
        <view class="form-head">
          <text class="form-kicker">基础资料</text>
        </view>

        <view class="field-list">
          <view class="field-item">
            <text class="field-label">昵称</text>
            <input
              class="field-input"
              :value="form.nickname"
              maxlength="24"
              placeholder="请输入昵称"
              @input="onInput('nickname', $event)"
            />
          </view>

          <view class="field-item">
            <text class="field-label">真实姓名</text>
            <input
              class="field-input"
              :value="form.realName"
              maxlength="24"
              placeholder="可选，用于认证资料"
              @input="onInput('realName', $event)"
            />
          </view>

          <view class="field-item">
            <text class="field-label">所在地区</text>
            <input
              class="field-input"
              :value="form.region"
              maxlength="40"
              placeholder="例如：山东烟台"
              @input="onInput('region', $event)"
            />
          </view>

          <view class="field-item">
            <text class="field-label">经营身份</text>
            <input
              class="field-input"
              :value="form.farmRole"
              maxlength="32"
              placeholder="例如：果园经营者、合作社成员"
              @input="onInput('farmRole', $event)"
            />
          </view>

          <view class="field-item field-item--textarea">
            <text class="field-label">个人简介</text>
            <textarea
              class="field-textarea"
              :value="form.bio"
              maxlength="120"
              placeholder="简单介绍你的种植方向、主要作物或经营需求"
              @input="onInput('bio', $event)"
            />
          </view>
        </view>

        <view class="readonly-box">
          <SvgIcon name="phone" :size="16" color="var(--acm-brand-primary)" />
          <text>登录账号：{{ phoneText }}</text>
        </view>
      </view>
    </scroll-view>

    <view class="bottom-bar">
      <button class="save-btn" :disabled="saving" @click="saveProfile">
        <SvgIcon :name="saving ? 'loader-circle' : 'check'" :size="18" color="var(--acm-text-inverse)" :class="saving ? 'spin' : ''" />
        <text>{{ saving ? '保存中' : '保存资料' }}</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SvgIcon from '../../components/SvgIcon.vue'
import { useAuthStore } from '../../stores/auth'

const DEFAULT_AVATAR = '/static/images/profile/default-farmer-avatar.svg'

const authStore = useAuthStore()
const saving = ref(false)
const avatarUploading = ref(false)

const form = reactive({
  nickname: '',
  realName: '',
  region: '',
  farmRole: '',
  bio: '',
  avatar: DEFAULT_AVATAR,
})

const phoneText = computed(() => authStore.userInfo?.phone || '未登录')

const fillForm = () => {
  const user = authStore.userInfo || {}
  form.nickname = String(user.nickname || user.name || '')
  form.realName = String(user.realName || '')
  form.region = String(user.region || '')
  form.farmRole = String(user.farmRole || '')
  form.bio = String(user.bio || '')
  form.avatar = String(user.avatar || DEFAULT_AVATAR)
}

onLoad(async () => {
  if (!authStore.isLoggedIn) {
    uni.showToast({ title: '请先登录后修改资料', icon: 'none' })
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }

  fillForm()
  try {
    await authStore.fetchUserProfile()
    fillForm()
  } catch (_error) {
    // 本地缓存仍可编辑，保存时再由接口给出结果。
  }
})

const onInput = (key: keyof typeof form, event: any) => {
  form[key] = event?.detail?.value || ''
}

const goBack = () => {
  uni.navigateBack()
}

const inferMimeType = (path: string) => {
  const lower = String(path || '').toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

const readFileAsDataUrl = (filePath: string) =>
  new Promise<string>((resolve, reject) => {
    // #ifdef H5
    fetch(filePath)
      .then((response) => response.blob())
      .then((blob) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('读取头像失败'))
        reader.readAsDataURL(blob)
      })
      .catch(reject)
    // #endif

    // #ifndef H5
    const fs = uni.getFileSystemManager()
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        resolve(`data:${inferMimeType(filePath)};base64,${res.data}`)
      },
      fail: () => reject(new Error('读取头像失败')),
    })
    // #endif
  })

const uploadAvatarFile = async (filePath: string) => {
  if (avatarUploading.value) return
  avatarUploading.value = true
  try {
    const dataUrl = await readFileAsDataUrl(filePath)
    const result = await authStore.uploadUserAvatar({
      dataUrl,
      filename: filePath.split(/[\\/]/).pop() || 'avatar.jpg',
    })
    form.avatar = result.url
    uni.showToast({ title: '头像已更新', icon: 'success' })
  } catch (_error) {
    uni.showToast({ title: '头像上传失败', icon: 'none' })
  } finally {
    avatarUploading.value = false
  }
}

const chooseAvatar = () => {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const filePath = res.tempFilePaths?.[0]
      if (filePath) void uploadAvatarFile(filePath)
    },
  })
}

const saveProfile = async () => {
  const nickname = form.nickname.trim()
  if (!nickname) {
    uni.showToast({ title: '请填写昵称', icon: 'none' })
    return
  }
  if (saving.value) return
  if (avatarUploading.value) {
    uni.showToast({ title: '头像上传中，请稍后保存', icon: 'none' })
    return
  }

  saving.value = true
  try {
    await authStore.updateUserProfile({
      nickname,
      realName: form.realName.trim(),
      region: form.region.trim(),
      farmRole: form.farmRole.trim(),
      bio: form.bio.trim(),
      avatar: form.avatar || DEFAULT_AVATAR,
    })
    uni.showToast({ title: '资料已保存', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack()
    }, 500)
  } catch (_error) {
    uni.showToast({ title: '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.edit-page {
  height: 100vh;
  background:
    radial-gradient(circle at 88% 4%, rgba(214, 168, 58, 0.16), transparent 26%),
    linear-gradient(180deg, #f6f3ea 0%, #eef6ea 62%, #f7f4ec 100%);
  overflow: hidden;
}

.edit-scroll {
  height: 100%;
  padding-bottom: 140rpx;
  box-sizing: border-box;
}

.edit-hero {
  position: relative;
  overflow: hidden;
  padding: calc(24rpx + constant(safe-area-inset-top)) 24rpx 30rpx;
  padding: calc(24rpx + env(safe-area-inset-top)) 24rpx 30rpx;
  border-bottom-left-radius: 42rpx;
  border-bottom-right-radius: 42rpx;
  background:
    linear-gradient(116deg, rgba(37, 84, 58, 0.96), rgba(54, 125, 73, 0.76) 58%, rgba(214, 168, 58, 0.26)),
    url('/static/images/field-command/field-focus-orchard.jpg');
  background-size: cover;
  background-position: center;
  box-shadow: 0 16rpx 38rpx rgba(37, 84, 58, 0.16);
}

.edit-hero__grain {
  position: absolute;
  right: -72rpx;
  bottom: 24rpx;
  width: 280rpx;
  height: 118rpx;
  border-radius: 999rpx;
  background:
    repeating-linear-gradient(100deg, rgba(255, 254, 247, 0.18) 0 3rpx, transparent 3rpx 21rpx),
    linear-gradient(90deg, transparent, rgba(255, 254, 247, 0.15));
  transform: rotate(-8deg);
}

.edit-nav {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-back,
.nav-spacer {
  width: 72rpx;
  height: 72rpx;
}

.nav-back {
  margin: 0;
  padding: 0;
  border: 1rpx solid rgba(255, 254, 247, 0.28);
  border-radius: 50%;
  background: rgba(255, 254, 247, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-back::after,
.save-btn::after {
  border: 0;
}

.edit-title {
  color: var(--acm-text-inverse);
  font-size: 34rpx;
  font-weight: 850;
}

.avatar-panel {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 22rpx;
  margin-top: 34rpx;
  padding: 24rpx;
  border: 1rpx solid rgba(255, 254, 247, 0.3);
  border-radius: 32rpx;
  background: rgba(255, 254, 249, 0.9);
  box-shadow: 0 12rpx 30rpx rgba(37, 84, 58, 0.14);
  box-sizing: border-box;
}

.avatar-frame {
  width: 112rpx;
  height: 112rpx;
  padding: 0;
  border: 0;
  border-radius: 30rpx;
  background: transparent;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
}

.avatar-image {
  width: 100%;
  height: 100%;
  border-radius: 30rpx;
  display: block;
}

.avatar-copy {
  min-width: 0;
  flex: 1;
}

.avatar-title,
.avatar-desc {
  display: block;
}

.avatar-title {
  color: var(--acm-text-primary);
  font-size: 32rpx;
  font-weight: 860;
}

.avatar-desc {
  margin-top: 10rpx;
  color: var(--acm-text-secondary);
  font-size: 24rpx;
  line-height: 1.45;
}

.avatar-upload-btn {
  width: fit-content;
  min-height: 52rpx;
  margin: 16rpx 0 0;
  padding: 0 20rpx;
  border: 1rpx solid rgba(54, 125, 73, 0.2);
  border-radius: 999rpx;
  background: rgba(238, 247, 236, 0.9);
  color: var(--acm-brand-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  font-size: 23rpx;
  font-weight: 820;
  line-height: 1;
  box-sizing: border-box;
}

.avatar-upload-btn::after {
  border: 0;
}

.avatar-upload-btn[disabled] {
  opacity: 0.72;
}

.form-card {
  margin: 24rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(207, 222, 202, 0.88);
  border-radius: 34rpx;
  background: linear-gradient(180deg, rgba(255, 254, 249, 0.98), rgba(248, 251, 245, 0.96));
  box-shadow: 0 10rpx 28rpx rgba(64, 84, 62, 0.07);
  box-sizing: border-box;
}

.form-head {
  margin-bottom: 22rpx;
}

.form-kicker,
.form-title {
  display: block;
}

.form-kicker {
  color: var(--acm-soil-earth);
  font-size: 22rpx;
  font-weight: 820;
  margin-bottom: 8rpx;
}

.form-title {
  color: var(--acm-text-primary);
  font-size: 32rpx;
  font-weight: 860;
  line-height: 1.25;
}

.field-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.field-item {
  min-height: 104rpx;
  padding: 18rpx 20rpx;
  border: 1rpx solid rgba(200, 222, 197, 0.64);
  border-radius: 24rpx;
  background: rgba(255, 254, 249, 0.74);
  box-sizing: border-box;
}

.field-item--textarea {
  min-height: 178rpx;
}

.field-label {
  display: block;
  color: var(--acm-text-secondary);
  font-size: 23rpx;
  font-weight: 760;
  margin-bottom: 10rpx;
}

.field-input,
.field-textarea {
  width: 100%;
  color: var(--acm-text-primary);
  font-size: 29rpx;
  line-height: 1.4;
}

.field-input {
  height: 42rpx;
}

.field-textarea {
  height: 96rpx;
}

.readonly-box {
  margin-top: 18rpx;
  padding: 18rpx 20rpx;
  border-radius: 22rpx;
  background: rgba(230, 241, 244, 0.62);
  border: 1rpx solid rgba(190, 214, 222, 0.58);
  display: flex;
  align-items: center;
  gap: 10rpx;
  color: var(--acm-text-secondary);
  font-size: 24rpx;
  box-sizing: border-box;
}

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 18rpx 24rpx calc(18rpx + constant(safe-area-inset-bottom));
  padding: 18rpx 24rpx calc(18rpx + env(safe-area-inset-bottom));
  background: rgba(246, 243, 234, 0.88);
  backdrop-filter: blur(10rpx);
  border-top: 1rpx solid rgba(207, 222, 202, 0.78);
  box-sizing: border-box;
}

.save-btn {
  width: 100%;
  min-height: 88rpx;
  margin: 0;
  border: 0;
  border-radius: 999rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  font-size: 28rpx;
  font-weight: 850;
  box-shadow: 0 12rpx 28rpx rgba(37, 84, 58, 0.18);
  box-sizing: border-box;
}

.save-btn[disabled] {
  opacity: 0.72;
}

.spin {
  animation: acm-spin 1s linear infinite;
}

@keyframes acm-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
