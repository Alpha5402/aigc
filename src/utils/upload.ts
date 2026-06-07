import { http } from './request'
import { compressImage, formatFileSize, getMimeType } from './image-compress'

export interface UploadResult {
  success: boolean
  url?: string
  objectKey?: string
  error?: string
  originalSize?: number
  compressedSize?: number
}

export interface UploadOptions {
  filePath: string
  onProgress?: (progress: number) => void
  maxSize?: number
  quality?: number
}

interface OssSignResult {
  uploadUrl: string
  url: string
  objectKey: string
  fields: Record<string, string>
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024
const DEFAULT_QUALITY = 80
const DEFAULT_TIMEOUT = 60000

const getUploadSignUrl = (): string => {
  const envUploadUrl = (import.meta as any)?.env?.VITE_UPLOAD_URL as string | undefined
  const runtimeUploadUrl = uni.getStorageSync('uploadURL')
  return String(runtimeUploadUrl || envUploadUrl || '/oss/sign').trim()
}

export const isMockMode = (): boolean => String((import.meta as any)?.env?.VITE_USE_MOCK || '').trim() === 'true'

const getFileSize = (filePath: string): Promise<number> =>
  new Promise((resolve, reject) => {
    uni.getFileInfo({
      filePath,
      success: (res) => resolve(res.size),
      fail: (error) => reject(error),
    })
  })

const requestUploadSignature = async (mimeType: string, size: number) =>
  http.post<OssSignResult, { mimeType: string; size: number }>(getUploadSignUrl(), {
    mimeType,
    size,
  })

const recordUpload = async (payload: {
  url: string
  objectKey: string
  mimeType: string
  size: number
}) => {
  try {
    await http.post('/oss/record', payload)
  } catch (_error) {
    // 不阻断主流程
  }
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl)
  return response.blob()
}

const uploadByFormData = async (
  dataUrl: string,
  signature: OssSignResult,
  onProgress?: (progress: number) => void,
) => {
  const formData = new FormData()
  Object.entries(signature.fields).forEach(([key, value]) => {
    formData.append(key, value)
  })
  const blob = await dataUrlToBlob(dataUrl)
  formData.append('file', blob, signature.objectKey.split('/').pop() || 'image.jpg')

  onProgress?.(60)
  const response = await fetch(signature.uploadUrl, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`上传失败，HTTP状态码: ${response.status}`)
  }

  onProgress?.(100)
}

const uploadByUniFile = (
  filePath: string,
  signature: OssSignResult,
  onProgress?: (progress: number) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const uploadTask = uni.uploadFile({
      url: signature.uploadUrl,
      filePath,
      name: 'file',
      formData: signature.fields,
      timeout: DEFAULT_TIMEOUT,
      success: (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`上传失败，HTTP状态码: ${response.statusCode}`))
          return
        }
        onProgress?.(100)
        resolve()
      },
      fail: (error) => reject(new Error(error?.errMsg || '网络异常，上传失败')),
    })

    uploadTask.onProgressUpdate?.((res) => {
      onProgress?.(30 + Math.floor(res.progress * 0.7))
    })
  })

export const uploadImage = async (options: UploadOptions): Promise<UploadResult> => {
  const { filePath, onProgress, maxSize = DEFAULT_MAX_SIZE, quality = DEFAULT_QUALITY } = options

  if (!filePath) {
    return { success: false, error: '图片路径不能为空' }
  }

  try {
    const fileSize = await getFileSize(filePath)
    if (fileSize > maxSize) {
      return {
        success: false,
        error: `文件大小超出限制，最大允许 ${(maxSize / 1024 / 1024).toFixed(2)}MB`,
      }
    }

    onProgress?.(0)
    const compressed = await compressImage(filePath, 1280, quality / 100)
    if (!compressed.success) {
      return {
        success: false,
        error: compressed.error || '图片压缩失败',
      }
    }

    onProgress?.(30)
    if (isMockMode()) {
      onProgress?.(100)
      return {
        success: true,
        url: compressed.dataUrl || compressed.filePath || filePath,
        originalSize: compressed.originalSize,
        compressedSize: compressed.compressedSize,
      }
    }

    const effectiveMimeType = compressed.mimeType || getMimeType(compressed.filePath || filePath)
    const effectiveSize = compressed.compressedSize || compressed.originalSize || fileSize
    const signature = await requestUploadSignature(effectiveMimeType, effectiveSize)

    if (compressed.dataUrl) {
      await uploadByFormData(compressed.dataUrl, signature, onProgress)
    } else if (compressed.filePath) {
      await uploadByUniFile(compressed.filePath, signature, onProgress)
    } else {
      return { success: false, error: '缺少可上传的图片数据' }
    }

    await recordUpload({
      url: signature.url,
      objectKey: signature.objectKey,
      mimeType: effectiveMimeType,
      size: effectiveSize,
    })

    return {
      success: true,
      url: signature.url,
      objectKey: signature.objectKey,
      originalSize: compressed.originalSize,
      compressedSize: compressed.compressedSize,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || error?.errMsg || '上传过程发生错误',
    }
  }
}

export const uploadImages = async (
  filePaths: string[],
  options?: Omit<UploadOptions, 'filePath'>,
): Promise<UploadResult[]> => {
  const results: UploadResult[] = []

  for (const currentPath of filePaths) {
    const result = await uploadImage({
      ...options,
      filePath: currentPath,
    })
    results.push(result)
  }

  return results
}

export const chooseAndUploadImage = async (
  options?: Omit<UploadOptions, 'filePath'>,
  chooseOptions?: {
    count?: number
    sizeType?: ('original' | 'compressed')[]
    sourceType?: ('album' | 'camera')[]
  },
): Promise<UploadResult[]> =>
  new Promise((resolve) => {
    uni.chooseImage({
      count: chooseOptions?.count ?? 1,
      sizeType: chooseOptions?.sizeType ?? ['compressed'],
      sourceType: chooseOptions?.sourceType ?? ['album', 'camera'],
      success: async (res) => {
        const results = await uploadImages(res.tempFilePaths, options)
        resolve(results)
      },
      fail: (error) => {
        resolve([{ success: false, error: error?.errMsg || '选择图片失败' }])
      },
    })
  })

export { formatFileSize }

export default {
  uploadImage,
  uploadImages,
  chooseAndUploadImage,
  isMockMode,
}
