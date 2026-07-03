<template>
  <view class="page">
    <view class="header">
      <view class="status-bar-spacer" :style="{ height: `${statusBarHeight}px` }"></view>
      <view class="header-content">
        <!-- <view class="logo-wrap">
          <image class="logo" src="/static/logo.png" mode="aspectFit" />
        </view> -->
        <text class="app-name">云上农管家</text>
        <text class="app-slogan">种植管理、农技问诊、行情销售，一站式智慧农服助手</text>
      </view>
    </view>

    <view class="content">
      <view class="login-card">
        <view class="tab-wrap">
          <view
            v-for="tab in tabs"
            :key="tab.key"
            :class="['tab-item', activeTab === tab.key ? 'tab-active' : '']"
            @click="activeTab = tab.key"
          >
            <text :class="['tab-text', activeTab === tab.key ? 'tab-text-active' : '']">{{ tab.label }}</text>
          </view>
        </view>

        <view v-if="activeTab === 'password'" class="form-wrap">
          <view class="form-group">
            <view class="input-label">
              <SvgIcon name="phone" :size="16" color="var(--acm-text-secondary)" />
              <text>手机号</text>
            </view>
            <input
              class="input"
              v-model="phone"
              type="number"
              maxlength="11"
              placeholder="请输入手机号"
            />
          </view>

          <view class="form-group">
            <view class="input-label">
              <SvgIcon name="lock" :size="16" color="var(--acm-text-secondary)" />
              <text>密码</text>
            </view>
            <view class="input-password-wrap">
              <input
                class="input"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入密码"
              />
              <button class="toggle-eye" @click="showPassword = !showPassword">
                <SvgIcon :name="showPassword ? 'eye' : 'eye-off'" :size="18" color="var(--acm-text-muted)" />
              </button>
            </view>
          </view>

          <view class="form-footer">
            <text class="forgot-pwd" @click="showForgotHint">忘记密码？</text>
          </view>

          <button class="submit-btn" :disabled="isSubmitting || !canSubmit" @click="handleLogin">
            <template v-if="isSubmitting">
              <SvgIcon name="loader-circle" :size="18" color="var(--acm-white)" class="spin" />
              <text>登录中...</text>
            </template>
            <template v-else>登 录</template>
          </button>
        </view>

        <view v-else class="form-wrap">
          <view class="form-group">
            <view class="input-label">
              <SvgIcon name="phone" :size="16" color="var(--acm-text-secondary)" />
              <text>手机号</text>
            </view>
            <input
              class="input"
              v-model="phone"
              type="number"
              maxlength="11"
              placeholder="请输入手机号"
              @input="onPhoneInput"
            />
          </view>

          <view class="form-group">
            <view class="input-label">
              <SvgIcon name="shield-check" :size="16" color="var(--acm-text-secondary)" />
              <text>验证码</text>
            </view>
            <view class="input-code-wrap">
              <input
                class="input"
                v-model="smsCode"
                type="number"
                maxlength="6"
                placeholder="请输入验证码"
              />
              <button
                :class="['code-btn', countdown > 0 ? 'code-btn-disabled' : '']"
                :disabled="countdown > 0 || !isValidPhone"
                @click="handleSendCode"
              >
                {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
              </button>
            </view>
          </view>

          <button class="submit-btn" :disabled="isSubmitting || !canSmsSubmit" @click="handleSmsLogin">
            <template v-if="isSubmitting">
              <SvgIcon name="loader-circle" :size="18" color="var(--acm-white)" class="spin" />
              <text>登录中...</text>
            </template>
            <template v-else>登 录</template>
          </button>
        </view>

        <view class="divider">
          <view class="divider-line"></view>
          <text class="divider-text">其他登录方式</text>
          <view class="divider-line"></view>
        </view>

        <view class="social-login">
          <button class="social-btn" @click="handleWechatLogin">
            <SvgIcon name="message-circle" :size="22" color="var(--acm-brand-primary)" />
          </button>
        </view>

        <view class="register-link">
          <text>还没有账号？</text>
          <text class="link-text" @click="goRegister">立即注册</text>
        </view>
      </view>

      <view class="agreement">
        <text class="agree-text">登录即表示同意</text>
        <text class="link-text" @click="showAgreement('user')">《用户协议》</text>
        <text class="agree-text">和</text>
        <text class="link-text" @click="showAgreement('privacy')">《隐私政策》</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SvgIcon from '../../components/SvgIcon.vue'
import { useAuthStore } from '../../stores/auth'
import { getPostLoginRedirect, hasValidStoredToken } from '../../utils/auth-guard'

const tabs = [
  { key: 'password', label: '密码登录' },
  { key: 'sms', label: '验证码登录' },
]

const activeTab = ref('password')
const phone = ref('')
const password = ref('')
const smsCode = ref('')
const showPassword = ref(false)
const isSubmitting = ref(false)
const countdown = ref(0)
const statusBarHeight = ref(0)

let timer: ReturnType<typeof setInterval> | null = null

const authStore = useAuthStore()

const isValidPhone = computed(() => /^1[3-9]\d{9}$/.test(phone.value))

const canSubmit = computed(() => {
  return isValidPhone.value && password.value.length >= 6
})

const canSmsSubmit = computed(() => {
  return isValidPhone.value && smsCode.value.length === 6
})

onLoad(() => {
  const systemInfo = uni.getSystemInfoSync()
  statusBarHeight.value = systemInfo.statusBarHeight || 0
  if (hasValidStoredToken()) {
    uni.reLaunch({ url: getPostLoginRedirect() })
  }
})

const onPhoneInput = (event: any) => {
  phone.value = event?.detail?.value || ''
}

const handleSendCode = async () => {
  if (countdown.value > 0) return
  if (!isValidPhone.value) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
    return
  }

  try {
    await authStore.sendSmsCode(phone.value)
    countdown.value = 60
    timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        if (timer) clearInterval(timer)
        timer = null
      }
    }, 1000)
  } catch (_error) {
    uni.showToast({ title: '发送失败', icon: 'error' })
  }
}

const handleLogin = async () => {
  if (!canSubmit.value) return
  isSubmitting.value = true
  try {
    await authStore.login({
      phone: phone.value,
      password: password.value,
      loginType: 'password',
    })
    uni.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(() => {
      uni.reLaunch({ url: getPostLoginRedirect() })
    }, 500)
  } catch (error: any) {
    uni.showToast({ title: error.message || '登录失败', icon: 'error' })
  } finally {
    isSubmitting.value = false
  }
}

const handleSmsLogin = async () => {
  if (!canSmsSubmit.value) return
  isSubmitting.value = true
  try {
    await authStore.login({
      phone: phone.value,
      code: smsCode.value,
      loginType: 'sms',
    })
    uni.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(() => {
      uni.reLaunch({ url: getPostLoginRedirect() })
    }, 500)
  } catch (error: any) {
    uni.showToast({ title: error.message || '登录失败', icon: 'error' })
  } finally {
    isSubmitting.value = false
  }
}

const handleWechatLogin = () => {
  uni.showToast({ title: '微信登录开发中', icon: 'none' })
}

const showForgotHint = () => {
  uni.showToast({ title: '请联系客服重置密码', icon: 'none' })
}

const goRegister = () => {
  uni.navigateTo({ url: '/pages/register/index' })
}

const showAgreement = (type: string) => {
  uni.showToast({ title: `${type === 'user' ? '用户协议' : '隐私政策'}查看中`, icon: 'none' })
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  height: auto;
  background: var(--acm-bg-field-gradient);
  display: block;
  overflow-y: auto;
}

.header {
  padding: 0 32rpx;
  background: linear-gradient(180deg, var(--acm-brand-primary-dark), var(--acm-brand-primary), var(--acm-brand-primary-soft));
}

.status-bar-spacer {
  width: 100%;
}

.header-content {
  padding-top: 40rpx;
  padding-bottom: 48rpx;
  text-align: center;
  max-width: 720rpx;
  margin: 0 auto;
}

// .logo-wrap {
//   margin-bottom: 24rpx;
// }

.logo {
  width: 120rpx;
  height: 120rpx;
  border-radius: 32rpx;
  background: var(--acm-white-20);
  padding: 16rpx;
}

.app-name {
  display: block;
  font-size: 48rpx;
  color: var(--acm-white);
  font-weight: 600;
  margin-bottom: 16rpx;
}

.app-slogan {
  display: block;
  font-size: 24rpx;
  color: var(--acm-white-80);
  line-height: 1.55;
  max-width: 560rpx;
  margin: 0 auto;
}

.content {
  flex: 1;
  padding: 0 32rpx;
  box-sizing: border-box;
}

.login-card {
  background: var(--acm-white);
  border: 2rpx solid var(--acm-border-soft);
  border-radius: var(--acm-radius-sheet);
  padding: 48rpx 40rpx;
  box-shadow: var(--acm-shadow-elevated);
  max-width: 680rpx;
  margin: 0 auto;
}

.tab-wrap {
  display: flex;
  gap: 32rpx;
  margin-bottom: 48rpx;
  border-bottom: 2rpx solid var(--acm-border-soft);
  padding-bottom: 16rpx;
}

.tab-item {
  position: relative;
  padding-bottom: 16rpx;
}

.tab-active::after {
  content: '';
  position: absolute;
  bottom: -18rpx;
  left: 0;
  right: 0;
  height: 4rpx;
  background: var(--acm-primary);
  border-radius: 4rpx;
}

.tab-text {
  font-size: 32rpx;
  color: var(--acm-text-secondary);
}

.tab-text-active {
  color: var(--acm-text-primary);
  font-weight: 600;
}

.form-wrap {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.input-label {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 28rpx;
  color: var(--acm-text-primary);
}

.input {
  width: 100%;
  background: var(--acm-bg-card-soft);
  border: 2rpx solid var(--acm-border-soft);
  border-radius: var(--acm-radius-input);
  height: 88rpx;
  padding: 0 24rpx;
  font-size: 30rpx;
  color: var(--acm-text-primary);
  box-sizing: border-box;
}

.input-password-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input-password-wrap .input {
  padding-right: 80rpx;
}

.toggle-eye {
  position: absolute;
  right: 24rpx;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
}

.input-code-wrap {
  display: flex;
  gap: 16rpx;
}

.input-code-wrap .input {
  flex: 1;
}

.code-btn {
  width: 200rpx;
  height: 88rpx;
  border: 0;
  border-radius: 24rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-white);
  font-size: 26rpx;
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 0;
  line-height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.code-btn-disabled {
  background: var(--acm-neutral-soft);
  color: var(--acm-text-muted);
}

.form-footer {
  display: flex;
  justify-content: flex-end;
}

.forgot-pwd {
  font-size: 24rpx;
  color: var(--acm-primary);
}

.submit-btn {
  width: 100%;
  height: 96rpx;
  border: 0;
  border-radius: 48rpx;
  background: var(--acm-brand-primary);
  color: var(--acm-white);
  font-size: 32rpx;
  font-weight: 600;
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.submit-btn[disabled] {
  background: var(--acm-neutral-soft);
  color: var(--acm-text-muted);
}

.spin {
  animation: acm-spin 1s linear infinite;
}

.divider {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-top: 48rpx;
  margin-bottom: 32rpx;
}

.divider-line {
  flex: 1;
  height: 2rpx;
  background: var(--acm-border-soft);
}

.divider-text {
  font-size: 24rpx;
  color: var(--acm-text-muted);
  white-space: nowrap;
}

.social-login {
  display: flex;
  justify-content: center;
  gap: 48rpx;
  margin-bottom: 32rpx;
}

.social-btn {
  width: 96rpx;
  height: 96rpx;
  border: 0;
  border-radius: 48rpx;
  background: var(--acm-brand-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.register-link {
  text-align: center;
  font-size: 26rpx;
  color: var(--acm-text-secondary);
}

.link-text {
  color: var(--acm-primary);
}

.agreement {
  text-align: center;
  padding: 48rpx 0;
  font-size: 22rpx;
  color: var(--acm-text-muted);
  line-height: 1.6;
}

@media screen and (min-width: 768px) {
  .header,
  .content {
    width: min(100vw, 480px);
    margin: 0 auto;
  }
}

@keyframes acm-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Round 2 visual convergence: first brand impression */
.page {
  background:
    linear-gradient(180deg, rgba(37, 84, 58, 0.1), rgba(246, 243, 234, 0.98) 46%),
    var(--acm-bg-app);
}

.header {
  position: relative;
  overflow: hidden;
  border-bottom-left-radius: 44rpx;
  border-bottom-right-radius: 44rpx;
  background:
    linear-gradient(180deg, rgba(37, 84, 58, 0.8), rgba(37, 84, 58, 0.48)),
    url('/static/images/field-command/field-hero-cabbage.jpg');
  background-size: cover;
  background-position: center 58%;
  box-shadow: 0 18rpx 42rpx rgba(37, 84, 58, 0.16);
}

// .logo-wrap {
//   background: rgba(255, 254, 249, 0.88);
//   border: 1rpx solid rgba(255, 254, 249, 0.42);
// }

.app-name,
.app-slogan {
  color: var(--acm-text-inverse);
}

.app-slogan {
  opacity: 0.88;
}

.login-card {
  border: 1rpx solid rgba(207, 222, 202, 0.86);
  background: rgba(255, 254, 249, 0.96);
  box-shadow: 0 14rpx 36rpx rgba(64, 84, 62, 0.09);
}

.form-group,
.tab-wrap {
  border-color: rgba(200, 222, 197, 0.62);
  background: rgba(255, 254, 249, 0.78);
}

.social-btn {
  border: 1rpx solid rgba(200, 222, 197, 0.68);
  background: rgba(238, 247, 236, 0.82);
}
</style>
