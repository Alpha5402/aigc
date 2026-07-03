export interface CompressResult {
  success: boolean
  dataUrl?: string
  filePath?: string
  mimeType?: string
  error?: string
  originalSize?: number
  compressedSize?: number
}

const MAX_WIDTH = 1280
const DEFAULT_QUALITY = 0.82

export function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || 'jpg'
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    bmp: 'image/bmp',
    gif: 'image/gif',
  }
  return mimeMap[ext] || 'image/jpeg'
}

const getFileSize = (filePath: string): Promise<number | undefined> =>
  new Promise((resolve) => {
    uni.getFileInfo({
      filePath,
      success: (res) => resolve(res.size),
      fail: () => resolve(undefined),
    })
  })

const readFileAsBase64 = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const fileSystemManager = (uni as any).getFileSystemManager?.()
    if (!fileSystemManager) {
      reject(new Error('当前平台不支持文件系统管理器，将使用文件直传'))
      return
    }

    fileSystemManager.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        const base64 = res.data as string
        resolve(`data:${getMimeType(filePath)};base64,${base64}`)
      },
      fail: (err) => reject(new Error(err.errMsg || '读取文件失败')),
    })
  })

const estimateBase64Size = (dataUrl: string) => {
  const base64 = dataUrl.split(',')[1] || ''
  return Math.floor((base64.length * 3) / 4)
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })

const toDataUrlFromCanvas = async (filePath: string, maxWidth: number, quality: number) => {
  const image = await loadImage(filePath)
  const scale = image.width > maxWidth ? maxWidth / image.width : 1
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('无法创建 canvas 上下文')
  }

  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

const canUseCanvasCompress = () =>
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof Image !== 'undefined' &&
  /^https?:|^blob:|^data:/.test(window.location?.protocol || 'http:')

const compressWithCanvas = async (
  filePath: string,
  maxWidth: number,
  quality: number,
  originalSize?: number,
): Promise<CompressResult> => {
  const dataUrl = await toDataUrlFromCanvas(filePath, maxWidth, quality)
  return {
    success: true,
    dataUrl,
    filePath,
    mimeType: 'image/jpeg',
    originalSize,
    compressedSize: estimateBase64Size(dataUrl),
  }
}

const compressWithUni = async (
  filePath: string,
  quality: number,
  originalSize?: number,
): Promise<CompressResult> =>
  new Promise((resolve) => {
    uni.compressImage({
      src: filePath,
      quality: Math.round(quality * 100),
      success: async (res) => {
        const compressedPath = res.tempFilePath
        const compressedSize = await getFileSize(compressedPath)

        try {
          const dataUrl = await readFileAsBase64(compressedPath)
          resolve({
            success: true,
            dataUrl,
            filePath: compressedPath,
            mimeType: getMimeType(compressedPath),
            originalSize,
            compressedSize,
          })
        } catch (error: any) {
          resolve({
            success: true,
            filePath: compressedPath,
            mimeType: getMimeType(compressedPath),
            originalSize,
            compressedSize,
            error: error?.message,
          })
        }
      },
      fail: async () => {
        try {
          const dataUrl = await readFileAsBase64(filePath)
          resolve({
            success: true,
            dataUrl,
            filePath,
            mimeType: getMimeType(filePath),
            originalSize,
            compressedSize: originalSize,
          })
        } catch (error: any) {
          resolve({
            success: false,
            error: error?.message || '图片处理失败',
            originalSize,
          })
        }
      },
    })
  })

export async function compressImage(
  filePath: string,
  maxWidth: number = MAX_WIDTH,
  quality: number = DEFAULT_QUALITY,
): Promise<CompressResult> {
  const originalSize = await getFileSize(filePath)

  try {
    if (canUseCanvasCompress()) {
      return await compressWithCanvas(filePath, maxWidth, quality, originalSize)
    }
  } catch (_error) {
    // H5 canvas 失败时自动回退到 uni.compressImage
  }

  return compressWithUni(filePath, quality, originalSize)
}

export function chooseAndCompressImage(
  sourceType: Array<'camera' | 'album'> = ['album', 'camera'],
): Promise<CompressResult> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count: 1,
      sourceType,
      success: (res) => {
        const filePath = res.tempFilePaths[0]
        compressImage(filePath).then(resolve)
      },
      fail: (err) => {
        resolve({
          success: false,
          error: err.errMsg || '选择图片失败',
        })
      },
    })
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}
