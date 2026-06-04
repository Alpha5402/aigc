<template>
  <view class="page">
    <view class="header">
      <view class="status-bar-spacer" :style="{ height: `${statusBarHeight}px` }"></view>
      <view class="header-row">
        <button class="back-btn" @click="goBack">
          <SvgIcon name="arrow-left" :size="18" color="var(--acm-white)" />
        </button>
        <view>
          <text class="header-title">注册账号</text>
          <text class="header-subtitle">种植管理、农技问诊、行情销售，一站式智慧农服助手</text>
        </view>
      </view>
    </view>

    <scroll-view class="content" scroll-y>
      <view class="register-card">
        <view class="form-wrap">
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
                placeholder="请设置密码（至少6位）"
                @input="onPasswordInput"
              />
              <button class="toggle-eye" @click="showPassword = !showPassword">
                <SvgIcon :name="showPassword ? 'eye' : 'eye-off'" :size="18" color="var(--acm-text-muted)" />
              </button>
            </view>
            <text v-if="passwordStrength" :class="['strength-text', 'strength-' + passwordStrength]">
              {{ strengthText }}
            </text>
          </view>

          <view class="form-group">
            <view class="input-label">
              <SvgIcon name="lock" :size="16" color="var(--acm-text-secondary)" />
              <text>确认密码</text>
            </view>
            <view class="input-password-wrap">
              <input
                class="input"
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="请再次输入密码"
              />
              <button class="toggle-eye" @click="showConfirmPassword = !showConfirmPassword">
                <SvgIcon :name="showConfirmPassword ? 'eye' : 'eye-off'" :size="18" color="var(--acm-text-muted)" />
              </button>
            </view>
          </view>

          <view class="form-group">
            <view class="input-label">
              <SvgIcon name="user" :size="16" color="var(--acm-text-secondary)" />
              <text>昵称（可选）</text>
            </view>
            <input
              class="input"
              v-model="nickname"
              type="text"
              placeholder="给自己起个名字吧"
              maxlength="20"
            />
          </view>

          <view class="agree-wrap">
            <view class="checkbox-wrap" @click="agreed = !agreed">
              <view :class="['checkbox', agreed ? 'checkbox-checked' : '']">
                <SvgIcon v-if="agreed" name="check" :size="14" color="var(--acm-white)" />
              </view>
            </view>
            <text class="agree-text">
              我已阅读并同意
              <text class="link-text" @click.stop="showAgreement('user')">《用户协议》</text>
              和
              <text class="link-text" @click.stop="showAgreement('privacy')">《隐私政策》</text>
            </text>
          </view>

          <button class="submit-btn" :disabled="isSubmitting || !canSubmit" @click="handleRegister">
            <template v-if="isSubmitting">
              <SvgIcon name="loader-circle" :size="18" color="var(--acm-white)" class="spin" />
              <text>注册中...</text>
            </template>
            <template v-else>立即注册</template>
          </button>

          <view class="login-link">
            <text>已有账号？</text>
            <text class="link-text" @click="goLogin">去登录</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SvgIcon from '../../components/SvgIcon.vue'
import { useAuthStore } from '../../stores/auth'
import { getPostLoginRedirect, hasValidStoredToken } from '../../utils/auth-guard'

const phone = ref('')
const smsCode = ref('')
const password = ref('')
const confirmPassword = ref('')
const nickname = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const agreed = ref(false)
const isSubmitting = ref(false)
const countdown = ref(0)
const statusBarHeight = ref(0)

let timer: ReturnType<typeof setInterval> | null = null

const authStore = useAuthStore()

const isValidPhone = computed(() => /^1[3-9]\d{9}$/.test(phone.value))

const passwordStrength = computed(() => {
  const pwd = password.value
  if (!pwd) return ''
  if (pwd.length < 6) return 'weak'
  if (pwd.length < 10 && !/[A-Z]/.test(pwd) && !/[0-9]/.test(pwd)) return 'weak'
  if (pwd.length >= 10 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) return 'strong'
  return 'medium'
})

const strengthText = computed(() => {
  const map: Record<string, string> = {
    weak: '密码强度：弱',
    medium: '密码强度：中',
    strong: '密码强度：强',
  }
  return map[passwordStrength.value] || ''
})

const canSubmit = computed(() => {
  return (
    isValidPhone.value &&
    smsCode.value.length === 6 &&
    password.value.length >= 6 &&
    password.value === confirmPassword.value &&
    agreed.value
  )
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

const onPasswordInput = () => {
  // reactive via computed
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

const handleRegister = async () => {
  if (!canSubmit.value) {
    if (password.value !== confirmPassword.value) {
      uni.showToast({ title: '两次密码输入不一致', icon: 'none' })
      return
    }
    if (!agreed.value) {
      uni.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' })
      return
    }
    return
  }

  isSubmitting.value = true
  try {
    await authStore.register({
      phone: phone.value,
      password: password.value,
      code: smsCode.value,
      nickname: nickname.value || undefined,
    })
    uni.showToast({ title: '注册成功', icon: 'success' })
    setTimeout(() => {
      uni.reLaunch({ url: getPostLoginRedirect() })
    }, 500)
  } catch (error: any) {
    uni.showToast({ title: error.message || '注册失败', icon: 'error' })
  } finally {
    isSubmitting.value = false
  }
}

const goBack = () => {
  uni.navigateBack({ delta: 1 })
}

const goLogin = () => {
  uni.redirectTo({ url: '/pages/login/index' })
}

const showAgreement = (type: string) => {
  uni.showToast({ title: `${type === 'user' ? '用户协议' : '隐私政策'}查看中`, icon: 'none' })
}
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  background: var(--acm-bg-field-gradient);
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(180deg, var(--acm-brand-primary-dark), var(--acm-brand-primary), var(--acm-brand-primary-soft));
  padding: 0 32rpx 32rpx;
}

.status-bar-spacer {
  width: 100%;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-bottom: 8rpx;
  max-width: 720rpx;
  margin-left: auto;
  margin-right: auto;
}

.back-btn {
  width: 72rpx;
  height: 72rpx;
  border: 0;
  border-radius: 9999rpx;
  background: var(--acm-white-20);
  color: var(--acm-white);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-title {
  display: block;
  font-size: 44rpx;
  color: var(--acm-white);
  margin-bottom: 8rpx;
}

.header-subtitle {
  display: block;
  font-size: 26rpx;
  color: var(--acm-white-80);
  line-height: 1.5;
}

.content {
  flex: 1;
  padding: 32rpx;
  box-sizing: border-box;
}

.register-card {
  background: var(--acm-white);
  border: 2rpx solid var(--acm-border-soft);
  border-radius: var(--acm-radius-sheet);
  padding: 48rpx 40rpx;
  box-shadow: var(--acm-shadow-elevated);
  max-width: 680rpx;
  margin: 0 auto;
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
}

.code-btn-disabled {
  background: var(--acm-neutral-soft);
  color: var(--acm-text-muted);
}

.strength-text {
  font-size: 22rpx;
}

.strength-weak {
  color: var(--acm-danger);
}

.strength-medium {
  color: var(--acm-warning);
}

.strength-strong {
  color: var(--acm-success);
}

.agree-wrap {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-top: 8rpx;
}

.checkbox-wrap {
  padding-top: 4rpx;
}

.checkbox {
  width: 32rpx;
  height: 32rpx;
  border-radius: 8rpx;
  border: 2rpx solid var(--acm-border-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox-checked {
  background: var(--acm-primary);
  border-color: var(--acm-primary);
}

.agree-text {
  flex: 1;
  font-size: 24rpx;
  color: var(--acm-text-secondary);
  line-height: 1.5;
}

.link-text {
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

.login-link {
  text-align: center;
  font-size: 26rpx;
  color: var(--acm-text-secondary);
}

@media screen and (min-width: 768px) {
  .page {
    align-items: center;
  }

  .header,
  .content {
    width: min(100vw, 480px);
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

/* Round 2 visual convergence: trusted registration flow */
.page {
  background:
    linear-gradient(180deg, rgba(37, 84, 58, 0.08), rgba(246, 243, 234, 0.98) 46%),
    var(--acm-bg-app);
}

.header {
  position: relative;
  overflow: hidden;
  border-bottom-left-radius: 44rpx;
  border-bottom-right-radius: 44rpx;
  background:
    linear-gradient(180deg, rgba(37, 84, 58, 0.82), rgba(37, 84, 58, 0.48)),
    url('/static/images/field-command/field-hero-cabbage.jpg');
  background-size: cover;
  background-position: center 58%;
  box-shadow: 0 18rpx 42rpx rgba(37, 84, 58, 0.16);
}

.register-card {
  border: 1rpx solid rgba(207, 222, 202, 0.86);
  background: rgba(255, 254, 249, 0.96);
  box-shadow: 0 14rpx 36rpx rgba(64, 84, 62, 0.09);
}

.form-group,
.agree-wrap {
  border-color: rgba(200, 222, 197, 0.62);
  background: rgba(255, 254, 249, 0.78);
}

.back-btn {
  background: rgba(255, 254, 249, 0.18);
  border: 1rpx solid rgba(255, 254, 249, 0.32);
}
</style>
