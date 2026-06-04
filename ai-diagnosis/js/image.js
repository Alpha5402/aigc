/**
 * 图像识别与视频理解模块
 * 负责处理图片上传、前端压缩、预览和准备多模态请求格式
 */

// --- 类型定义 ---

/**
 * 媒体项类型
 * @typedef {Object} MediaItem
 * @property {string} id - 唯一标识
 * @property {string} type - 类型：'image' | 'video'
 * @property {string} dataUrl - base64 数据 URL
 * @property {File} [file] - 原始文件对象
 */

// --- 工具函数：前端图片压缩 ---

/**
 * 使用 Canvas 压缩图片
 * @param {File} file - 原始文件
 * @param {number} MAX_WIDTH - 目标最大宽度 (例如 1024 或 1280)
 * @param {number} MAX_QUALITY - 目标质量 (0-1, 例如 0.8)
 * @returns {Promise<string>} - 压缩后的 Base64 Data URL
 */
function compressImage(file, MAX_WIDTH = 1280, MAX_QUALITY = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // 1. 计算缩放比例
                let { width, height } = img;
                const ratio = width / height;

                // 2. 如果宽度超过限制，按比例缩小
                if (width > MAX_WIDTH) {
                    width = MAX_WIDTH;
                    height = width / ratio;
                }

                // 3. 创建 Canvas 进行绘制
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // 生产环境中这里还需要处理 EXIF 旋转问题
                canvas.width = width;
                canvas.height = height;

                // 4. 开始绘制（浏览器会在这一过程进行降采样）
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                ctx.drawImage(img, 0, 0, width, height);

                // 5. 导出为 Base64
                try {
                    // 强制转为 JPEG，兼容性最好，且能有效缩小体积
                    const mimeType = 'image/jpeg';
                    const dataUrl = canvas.toDataURL(mimeType, MAX_QUALITY);
                    resolve(dataUrl);
                } catch (error) {
                    // 防御性编程：如果 toDataURL 失败，回退到原始尺寸
                    console.warn('Canvas 压缩失败，回退到原始尺寸:', error);
                    resolve(e.target.result);
                }
            };
            img.onerror = reject;
            img.src = e.target.result;
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// --- 导出的 API ---

/**
 * 处理图片文件上传（集成智能压缩）
 * @param {File} file - 上传的文件对象
 * @returns {Promise<MediaItem>}
 */
export async function handleImageUpload(file) {
    // 1. 基础验证
    if (!file.type.startsWith('image/')) {
        throw new Error('请上传图片文件');
    }

    // 2. 文件大小限制判定 (5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const originalSizeMB = (file.size / 1024 / 1024).toFixed(2);

    if (file.size > MAX_FILE_SIZE) {
        console.log(`图片原始大小: ${originalSizeMB} MB, 触发前端智能压缩机制...`);
    }

    try {
        // 3. 执行压缩 (限制宽度为 1280px，质量 0.8，这能节省大量 Token)
        const compressedDataUrl = await compressImage(file, 1280, 0.8);

        // 4. 验证压缩后的大小
        // Base64 的长度大约是原始二进制的 4/3 倍，所以用 length * 0.75 估算真实体积
        const estimatedFileSize = compressedDataUrl.length * 0.75;

        console.log(`前端压缩完成: 约 ${originalSizeMB} MB -> 约 ${(estimatedFileSize / 1024 / 1024).toFixed(2)} MB`);

        if (estimatedFileSize > MAX_FILE_SIZE) {
            throw new Error('图片压缩后依然过大，请裁剪或上传更小的图片');
        }

        return {
            id: generateId(),
            type: 'image',
            dataUrl: compressedDataUrl,
            file: file
        };
    } catch (error) {
        // 5. 优雅降级：如果压缩过程异常，尝试直接读取原文件返回
        console.error('图片压缩过程异常，启用回退机制:', error);

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    id: generateId(),
                    type: 'image',
                    dataUrl: e.target.result,
                    file: file
                });
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    }
}

/**
 * 处理视频文件上传（注意：视频通常需要公网 URL）
 * @param {File} file - 上传的文件对象
 * @returns {Promise<MediaItem>}
 */
export async function handleVideoUpload(file) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('video/')) {
            reject(new Error('请上传视频文件'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            resolve({
                id: generateId(),
                type: 'video',
                dataUrl: e.target.result,
                file: file
            });
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

/**
 * 创建媒体预览元素
 * @param {MediaItem} mediaItem - 媒体项
 * @param {Function} onRemove - 删除回调
 * @returns {HTMLElement}
 */
export function createMediaPreview(mediaItem, onRemove) {
    const container = document.createElement('div');
    container.className = 'relative inline-block m-1 group';
    container.dataset.mediaId = mediaItem.id;

    if (mediaItem.type === 'image') {
        const img = document.createElement('img');
        img.src = mediaItem.dataUrl;
        img.className = 'w-20 h-20 object-cover rounded-lg border border-gray-300 dark:border-gray-700 shadow-sm transition-transform hover:scale-105 cursor-pointer';
        container.appendChild(img);

        // 点击图片打开大图预览
        img.addEventListener('click', () => {
            openImagePreview(mediaItem.dataUrl);
        });
    } else if (mediaItem.type === 'video') {
        const video = document.createElement('video');
        video.src = mediaItem.dataUrl;
        video.className = 'w-20 h-20 object-cover rounded-lg border border-gray-300 dark:border-gray-700 shadow-sm cursor-pointer';
        video.muted = true;
        container.appendChild(video);

        // 点击视频打开大图预览
        video.addEventListener('click', () => {
            openImagePreview(mediaItem.dataUrl, 'video');
        });
    }

    // 删除按钮
    const removeBtn = document.createElement('button');
    removeBtn.className = 'absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-md';
    removeBtn.innerHTML = 'x';
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        onRemove(mediaItem.id);
        container.remove();
    };
    container.appendChild(removeBtn);

    return container;
}

/**
 * 打开图片/视频预览模态框
 * @param {string} dataUrl - base64 数据 URL
 * @param {string} type - 类型：'image' | 'video'
 */
export function openImagePreview(dataUrl, type = 'image') {
    // 创建模态框容器
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm';
    modal.id = 'image-preview-modal';

    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.className = 'absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10';
    closeBtn.innerHTML = '<i class="fas fa-times text-2xl"></i>';
    closeBtn.onclick = () => modal.remove();

    // 新标签页打开按钮
    const openInNewBtn = document.createElement('button');
    openInNewBtn.className = 'absolute top-4 right-14 text-white hover:text-gray-300 transition-colors z-10';
    openInNewBtn.innerHTML = '<i class="fas fa-external-link-alt text-xl"></i>';
    openInNewBtn.title = '在新标签页打开';
    openInNewBtn.onclick = () => {
        const newTab = window.open();
        if (newTab) {
            newTab.document.write(`
                <!DOCTYPE html>
                <html>
                <head><title>病害图片预览</title></head>
                <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#1a1a1a;">
                    <img src="${dataUrl}" style="max-width:100%;max-height:100vh;object-contain;">
                </body>
                </html>
            `);
        }
    };

    // 媒体内容
    let mediaEl;
    if (type === 'video') {
        mediaEl = document.createElement('video');
        mediaEl.src = dataUrl;
        mediaEl.className = 'max-w-[90vw] max-h-[90vh] object-contain rounded-lg';
        mediaEl.controls = true;
        mediaEl.autoplay = true;
    } else {
        mediaEl = document.createElement('img');
        mediaEl.src = dataUrl;
        mediaEl.className = 'max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl';
    }

    modal.appendChild(closeBtn);
    modal.appendChild(openInNewBtn);
    modal.appendChild(mediaEl);

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // ESC 键关闭
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);

    document.body.appendChild(modal);
}

/**
 * 准备多模态请求的 content 数组
 * @param {MediaItem[]} mediaItems - 媒体项列表
 * @param {string} text - 文本内容
 * @returns {Array} - 符合 API 要求的 content 数组
 */
export function prepareMultimodalContent(mediaItems, text) {
    const content = [];

    for (const item of mediaItems) {
        if (item.type === 'image') {
            content.push({
                type: 'image_url',
                image_url: { url: item.dataUrl }
            });
        } else if (item.type === 'video') {
            console.warn('视频需要公网 URL，当前使用 base64 可能不被支持');
            content.push({
                type: 'video_url',
                video_url: { url: item.dataUrl }
            });
        }
    }

    if (text.trim()) {
        content.push({
            type: 'text',
            text: text
        });
    }

    return content;
}

/**
 * 检查是否有媒体项
 * @param {MediaItem[]} mediaItems - 媒体项列表
 * @returns {boolean}
 */
export function hasMediaItems(mediaItems) {
    return mediaItems && mediaItems.length > 0;
}

/**
 * 获取视觉模型名称
 * @returns {string}
 */
export function getVisionModelName() {
    return 'qwen3-vl-plus-2025-12-19';
}

/**
 * 生成唯一 ID
 * @returns {string}
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
