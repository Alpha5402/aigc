<template>
  <view class="form-field">
    <view class="form-field__label-row">
      <text class="form-field__label">{{ label }}</text>
      <text v-if="required" class="form-field__required">*</text>
    </view>
    <textarea
      v-if="type === 'textarea'"
      class="form-field__control form-field__textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="handleInput"
    />
    <input
      v-else
      class="form-field__control"
      :value="modelValue"
      :type="inputType"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="handleInput"
    />
    <text v-if="helper && !error" class="form-field__helper">{{ helper }}</text>
    <text v-if="error" class="form-field__error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    label: string
    placeholder?: string
    helper?: string
    error?: string
    required?: boolean
    disabled?: boolean
    type?: 'text' | 'number' | 'textarea'
  }>(),
  {
    modelValue: '',
    placeholder: '',
    helper: '',
    error: '',
    required: false,
    disabled: false,
    type: 'text',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputType = computed(() => (props.type === 'number' ? 'digit' : 'text'))

const handleInput = (event: { detail: { value: string } }) => {
  emit('update:modelValue', event.detail.value)
}
</script>

<style scoped lang="scss">
.form-field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.form-field__label-row {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.form-field__label {
  color: var(--acm-text-primary);
  font-size: 26rpx;
  font-weight: 700;
}

.form-field__required,
.form-field__error {
  color: var(--acm-danger);
}

.form-field__control {
  min-height: 88rpx;
  border: 2rpx solid var(--acm-border-soft);
  border-radius: var(--acm-radius-input);
  background: var(--acm-bg-card);
  color: var(--acm-text-primary);
  font-size: var(--acm-font-form);
  padding: 0 24rpx;
  box-sizing: border-box;
}

.form-field__textarea {
  min-height: 180rpx;
  padding-top: 22rpx;
  line-height: 1.5;
}

.form-field__helper,
.form-field__error {
  font-size: 24rpx;
  line-height: 1.45;
}

.form-field__helper {
  color: var(--acm-text-secondary);
}
</style>
