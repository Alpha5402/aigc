export interface AddCropFormData {
  name: string
  area: string
  expectedYield: string | number
  expectedMarketTime: string
  yieldUnit?: string
  plantDate?: string
  stage?: string
  location?: string
}

export const validateAddCropForm = (form: AddCropFormData): string | null => {
  if (!form.name.trim()) return '请输入作物名称'
  if (!String(form.area || '').trim()) return '请输入种植面积'

  const area = Number(form.area)
  if (Number.isNaN(area) || area <= 0) return '种植面积需大于0'
  if (area > 100000) return '种植面积数值异常'

  if (!String(form.expectedYield || '').trim()) return '请输入预期产出'
  const expectedYield = Number(form.expectedYield)
  if (Number.isNaN(expectedYield) || expectedYield <= 0) return '预期产出需大于0'
  if (expectedYield > 100000000) return '预期产出数值异常'

  if (!form.expectedMarketTime) return '请选择预计上市时间'

  if (form.location && form.location.trim().length > 20) {
    return '地块位置最多20个字符'
  }

  return null
}

export const validateAiConsultInput = (content: string, image?: string): string | null => {
  if (!content.trim() && !image) {
    return '请输入问题描述或上传图片'
  }

  if (content.trim().length > 1000) {
    return '描述内容过长，请精简后重试'
  }

  return null
}
