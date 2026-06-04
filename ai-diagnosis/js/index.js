/**
 * 农智 AI 病害诊断助手 - 整合版
 * 包含 SSE 流式处理、图像识别、核心应用逻辑
 */

// ==========================================
// 第一部分：SSE 流式输出处理器
// ==========================================

/**
 * 处理 SSE 流式响应
 * @param {ReadableStream} readableStream - 从 fetch 响应获取的可读流
 * @param {Object} callbacks - 回调函数
 * @returns {Promise<void>}
 */
async function processSSEStream(readableStream, callbacks) {
    let fullText = '';
    let totalTokens = null;
    const decoder = new TextDecoder('utf-8');
    const reader = readableStream.getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                if (callbacks.onComplete) callbacks.onComplete(totalTokens);
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.trim() === '' || !line.startsWith('data: ')) continue;
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta?.content || '';

                    if (delta) {
                        fullText += delta;
                        if (callbacks.onText) callbacks.onText(fullText);
                    }

                    if (parsed.usage) {
                        totalTokens = parsed.usage.total_tokens ||
                                     (parsed.usage.prompt_tokens + parsed.usage.completion_tokens);
                    }
                } catch (parseError) {
                    // 忽略 JSON 解析单行错误
                }
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('底层数据流已成功切断');
            if (callbacks.onAbort) callbacks.onAbort();
            return;
        }
        console.error('SSE 处理错误:', error);
        if (callbacks.onError) callbacks.onError(error);
    } finally {
        reader.releaseLock();
    }
}

/**
 * 发送消息并处理响应流
 * @param {string} apiUrl - API 端点
 * @param {string} apiKey - API 密钥
 * @param {string} modelName - 模型名称
 * @param {Array} messages - 消息历史
 * @param {Object} callbacks - 回调函数
 * @param {AbortSignal} [signal] - 中断信号
 * @returns {Promise<void>}
 */
async function sendMessageStream(apiUrl, apiKey, modelName, messages, callbacks, signal) {
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelName,
                messages: messages,
                stream: true,
                stream_options: { include_usage: true }
            }),
            signal: signal
        });

        if (!response.ok) {
            let errorMessage = response.status === 401 ? 'API Key 无效，请检查配置' : `HTTP Error ${response.status}`;
            throw new Error(errorMessage);
        }

        await processSSEStream(response.body, callbacks);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('用户主动终止了生成过程');
            if (callbacks.onAbort) callbacks.onAbort();
            return;
        }
        console.error('网络请求错误:', error);
        if (callbacks.onError) callbacks.onError(error);
    }
}

/**
 * 解析完整响应为 Markdown
 * @param {string} text - 完整文本内容
 * @returns {string} - 解析后的 HTML
 */
function parseTextToMarkdown(text) {
    if (typeof window !== 'undefined' && window.marked) {
        try {
            return window.marked.parse(text) || '';
        } catch (e) {
            console.error('Markdown 解析错误:', e);
        }
    }
    return text.replace(/\n/g, '<br>');
}

/**
 * 创建格式化后的 HTML，包含正在输入的指示器
 * @param {string} text - 完整文本内容
 * @param {boolean} isComplete - 是否完成
 * @returns {string} - 格式化后的 HTML
 */
function formatTextForDisplay(text, isComplete = false) {
    let html = parseTextToMarkdown(text);
    if (!isComplete) {
        if (html.endsWith('</p>')) {
            html = html.slice(0, -4) + '<span class="cursor-blink"></span></p>';
        } else {
            html += '<span class="cursor-blink"></span>';
        }
    }
    return html;
}

// ==========================================
// 第二部分：图像识别与视频理解模块
// ==========================================

/**
 * 使用 Canvas 压缩图片
 * @param {File} file - 原始文件
 * @param {number} MAX_WIDTH - 目标最大宽度
 * @param {number} MAX_QUALITY - 目标质量
 * @returns {Promise<string>} - 压缩后的 Base64 Data URL
 */
function compressImage(file, MAX_WIDTH = 1280, MAX_QUALITY = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                const ratio = width / height;

                if (width > MAX_WIDTH) {
                    width = MAX_WIDTH;
                    height = width / ratio;
                }

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = width;
                canvas.height = height;

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                ctx.drawImage(img, 0, 0, width, height);

                try {
                    const mimeType = 'image/jpeg';
                    const dataUrl = canvas.toDataURL(mimeType, MAX_QUALITY);
                    resolve(dataUrl);
                } catch (error) {
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

/**
 * 生成唯一 ID
 * @returns {string}
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * 处理图片文件上传（集成智能压缩）
 * @param {File} file - 上传的文件对象
 * @returns {Promise<Object>}
 */
async function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
        throw new Error('请上传图片文件');
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const originalSizeMB = (file.size / 1024 / 1024).toFixed(2);

    if (file.size > MAX_FILE_SIZE) {
        console.log(`图片原始大小: ${originalSizeMB} MB, 触发前端智能压缩机制...`);
    }

    try {
        const compressedDataUrl = await compressImage(file, 1280, 0.8);
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
 * 打开图片/视频预览模态框
 * @param {string} dataUrl - base64 数据 URL
 * @param {string} type - 类型：'image' | 'video'
 */
function openImagePreview(dataUrl, type = 'image') {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm';
    modal.id = 'image-preview-modal';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10';
    closeBtn.innerHTML = '<i class="fas fa-times text-2xl"></i>';
    closeBtn.onclick = () => modal.remove();

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

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

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
 * 创建媒体预览元素
 * @param {Object} mediaItem - 媒体项
 * @param {Function} onRemove - 删除回调
 * @returns {HTMLElement}
 */
function createMediaPreview(mediaItem, onRemove) {
    const container = document.createElement('div');
    container.className = 'relative inline-block m-1 group';
    container.dataset.mediaId = mediaItem.id;

    if (mediaItem.type === 'image') {
        const img = document.createElement('img');
        img.src = mediaItem.dataUrl;
        img.className = 'w-20 h-20 object-cover rounded-lg border border-gray-300 dark:border-gray-700 shadow-sm transition-transform hover:scale-105 cursor-pointer';
        container.appendChild(img);

        img.addEventListener('click', () => {
            openImagePreview(mediaItem.dataUrl);
        });
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-md';
    removeBtn.innerHTML = '×';
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        onRemove(mediaItem.id);
        container.remove();
    };
    container.appendChild(removeBtn);

    return container;
}

/**
 * 准备多模态请求的 content 数组
 * @param {Array} mediaItems - 媒体项列表
 * @param {string} text - 文本内容
 * @returns {Array} - 符合 API 要求的 content 数组
 */
function prepareMultimodalContent(mediaItems, text) {
    const content = [];

    for (const item of mediaItems) {
        if (item.type === 'image') {
            content.push({
                type: 'image_url',
                image_url: { url: item.dataUrl }
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
 * @param {Array} mediaItems - 媒体项列表
 * @returns {boolean}
 */
function hasMediaItems(mediaItems) {
    return mediaItems && mediaItems.length > 0;
}

/**
 * 获取视觉模型名称
 * @returns {string}
 */
function getVisionModelName() {
    return 'qwen-vl-max';
}

// ==========================================
// 第三部分：核心应用逻辑
// ==========================================

// --- 农业病害诊断系统提示词 ---
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

注意：如果图片不清晰或信息不足，请诚实告知用户，不要猜测诊断结果。`;

// --- 核心配置与状态 ---
// 配置获取优先级：URL参数 > localStorage > 硬编码默认值
const urlParams = new URLSearchParams(window.location.search);
const urlApiKey = urlParams.get('api_key');
const urlModel = urlParams.get('model');

// 硬编码默认配置（用户可自行修改）
const DEFAULT_API_KEY = 'sk-e48518e2c71b49be96cef42e0f2dc8bb'; // 请替换为您的API Key
const DEFAULT_MODEL = 'qwen-vl-max';

const BAILIAN_API_KEY = urlApiKey || localStorage.getItem('BAI_LIAN_API_KEY') || DEFAULT_API_KEY;
const MODEL_NAME = urlModel || localStorage.getItem('MODEL_NAME') || DEFAULT_MODEL;

const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

let apiKey = BAILIAN_API_KEY;
let chatHistory = [];
let currentAbortController = null;
let mediaItems = [];

// --- 对话历史管理配置 ---
const MAX_MESSAGES = 20;
const CHAT_HISTORY_KEY = 'nongzhi-chat-history';
const THEME_KEY = 'nongzhi-theme-mode';

// --- DOM 元素引用 ---
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const uploadBtn = document.getElementById('upload-btn');
const chatScrollArea = document.getElementById('chat-scroll-area');
const homeView = document.getElementById('home-view');
const chatView = document.getElementById('chat-view');
const imageInput = document.getElementById('image-input');
const mediaPreview = document.getElementById('media-preview');
const themeToggleBottomBtn = document.getElementById('theme-toggle-bottom');
const stopBtn = document.getElementById('stop-btn');

// --- 发送按钮状态管理 ---
function updateSendButtonState() {
    const hasContent = messageInput.value.trim() || hasMediaItems(mediaItems);
    if (hasContent) {
        sendBtn.disabled = false;
        sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        sendBtn.disabled = true;
        sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

// --- 辅助函数：安全转义 HTML ---
function escapeHtml(unsafe) {
    const str = typeof unsafe === 'string' ? unsafe : String(unsafe || '');
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- 自定义 Markdown 渲染器 ---
const renderer = new marked.Renderer();

renderer.code = function(codeOrToken, defaultLang) {
    let code = '';
    let rawLang = '';

    if (typeof codeOrToken === 'object' && codeOrToken !== null) {
        code = codeOrToken.text || '';
        rawLang = codeOrToken.lang || '';
    } else {
        code = codeOrToken || '';
        rawLang = defaultLang || '';
    }

    const language = rawLang.split(/[\s:]+/)[0].trim().toLowerCase();

    let validLanguage = language || 'plaintext';
    let highlightedCode = '';

    const hljsObj = window.hljs || (typeof hljs !== 'undefined' ? hljs : null);

    if (hljsObj) {
        try {
            if (language && hljsObj.getLanguage(language)) {
                validLanguage = language;
                highlightedCode = hljsObj.highlight(code, { language: validLanguage }).value;
            } else {
                const auto = hljsObj.highlightAuto(code);
                validLanguage = auto.language || 'plaintext';
                highlightedCode = auto.value;
            }
        } catch (error) {
            console.warn('代码高亮失败，降级为普通文本:', error);
            highlightedCode = escapeHtml(code);
        }
    } else {
        highlightedCode = escapeHtml(code);
    }

    const escapedRawCode = escapeHtml(code);

    return `
        <div class="code-block-wrapper relative my-4 rounded-xl bg-[#1a2e1a] border border-[#2d4a2d] shadow-sm overflow-hidden w-full">
            <div class="code-header flex justify-between items-center px-4 py-2 bg-[#1e3d1e] text-[#a8d5a8] text-xs font-sans select-none border-b border-[#2d4a2d]">
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#4ade80]"></span>
                    <span class="w-2.5 h-2.5 rounded-full bg-[#86efac]"></span>
                    <span class="w-2.5 h-2.5 rounded-full bg-[#22c55e]"></span>
                    <span class="ml-2 uppercase font-bold tracking-wider text-[#4ade80]">${validLanguage}</span>
                </div>
                <button class="copy-code-btn flex items-center gap-1.5 hover:text-white transition-colors" data-code="${escapedRawCode}">
                    <i class="far fa-copy"></i>
                    <span class="copy-text">复制</span>
                </button>
            </div>
            <div class="code-content p-4 overflow-x-auto text-sm font-mono text-[#d4e8d4] leading-relaxed">
                <pre class="m-0 p-0"><code class="hljs ${validLanguage} !p-0 !bg-transparent">${highlightedCode}</code></pre>
            </div>
        </div>
    `;
};

if (typeof marked !== 'undefined') {
    marked.setOptions({
        renderer: renderer,
        breaks: true
    });
}

// --- 全局监听代码复制功能 ---
document.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.copy-code-btn');
    if (!copyBtn) return;

    e.preventDefault();

    let rawCode = copyBtn.getAttribute('data-code');

    rawCode = rawCode
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');

    try {
        await navigator.clipboard.writeText(rawCode);

        const icon = copyBtn.querySelector('i');
        const text = copyBtn.querySelector('.copy-text');

        icon.className = 'fas fa-check text-green-400';
        text.textContent = '已复制';
        text.classList.add('text-green-400');

        setTimeout(() => {
            icon.className = 'far fa-copy';
            text.textContent = '复制';
            text.classList.remove('text-green-400');
        }, 2000);

    } catch (err) {
        console.error('复制失败:', err);
        alert('剪贴板访问失败，请手动框选复制。');
    }
});

// --- 输入框自动增高 & 状态控制 ---
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    updateSendButtonState();
});

// --- 快捷键处理 ---
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const hasContent = messageInput.value.trim() || hasMediaItems(mediaItems);
        if (hasContent) {
            handleSend();
        }
    }
});

// --- 文件上传处理 ---
uploadBtn.addEventListener('click', () => {
    imageInput.click();
});

// --- 图片文件选择处理 ---
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const mediaItem = await handleImageUpload(file);
        mediaItems.push(mediaItem);

        const previewEl = createMediaPreview(mediaItem, (id) => {
            mediaItems = mediaItems.filter(item => item.id !== id);
            updateSendButtonState();
        });
        mediaPreview.appendChild(previewEl);

        updateSendButtonState();

    } catch (error) {
        console.error('图片上传失败:', error);
        alert(error.message);
    } finally {
        imageInput.value = '';
    }
});

// --- 快捷建议卡片 ---
document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
        const text = card.querySelector('p').textContent;
        messageInput.value = text;
        messageInput.dispatchEvent(new Event('input'));
        handleSend();
    });
});

// --- 核心对话逻辑 ---

function showChatView() {
    if (homeView.classList.contains('hidden')) return;
    homeView.classList.add('hidden');
    chatView.classList.remove('hidden');
    chatView.classList.add('flex');
}

function createMessageElement(role, content, imageBase64 = null) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (role === 'user') {
        avatar.innerHTML = '<i class="fas fa-user"></i>';
    } else {
        avatar.innerHTML = '<i class="fas fa-leaf"></i>';
    }

    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = role === 'user'
        ? 'message-bubble markdown-body'
        : 'message-bubble markdown-body w-full';

    if (imageBase64) {
        const img = document.createElement('img');
        img.src = imageBase64;
        img.className = 'max-w-xs md:max-w-sm rounded-lg mb-2 object-contain cursor-pointer hover:opacity-90 transition-opacity';
        img.title = '点击查看大图';
        img.addEventListener('click', () => {
            openImagePreview(imageBase64);
        });
        bubble.appendChild(img);
    }

    const contentDiv = document.createElement('div');
    if (role === 'user') {
        contentDiv.style.whiteSpace = 'pre-wrap';
        contentDiv.textContent = content;
    } else {
        contentDiv.innerHTML = marked.parse(content) || '<span class="cursor-blink"></span>';
    }
    bubble.appendChild(contentDiv);

    bubbleWrapper.appendChild(bubble);
    wrapper.appendChild(avatar);
    wrapper.appendChild(bubbleWrapper);

    chatView.appendChild(wrapper);
    scrollToBottom();

    return { wrapper, contentDiv };
}

function scrollToBottom() {
    chatScrollArea.scrollTo({
        top: chatScrollArea.scrollHeight,
        behavior: 'smooth'
    });
}

function showError(contentDiv, error) {
    if (error.message.includes('API Key 无效')) {
        contentDiv.innerHTML = `
            <div class="text-red-400">
                <i class="fas fa-exclamation-triangle mr-1"></i> ${error.message}
            </div>
            <button onclick="window.location.href='config.html'"
                    class="mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors">
                <i class="fas fa-cog mr-1"></i> 前往配置页面
            </button>
        `;
    } else {
        contentDiv.innerHTML = `
            <span class="text-red-400">
                <i class="fas fa-exclamation-triangle mr-1"></i> 请求出错: ${error.message}
            </span>
        `;
    }
}

function optimizeChatHistory() {
    if (chatHistory.length > MAX_MESSAGES * 2) {
        const messagesToRemove = chatHistory.length - MAX_MESSAGES * 2;
        chatHistory = chatHistory.slice(messagesToRemove);
        console.log('已优化对话历史，保留最近 ' + MAX_MESSAGES + ' 条消息');
    }
}

function saveChatHistory() {
    try {
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
    } catch (error) {
        console.warn('保存对话历史失败:', error);
    }
}

function loadChatHistory() {
    try {
        const saved = localStorage.getItem(CHAT_HISTORY_KEY);
        if (saved) {
            chatHistory = JSON.parse(saved);
            return true;
        }
    } catch (error) {
        console.warn('加载对话历史失败:', error);
    }
    return false;
}

function clearChatHistoryStorage() {
    try {
        localStorage.removeItem(CHAT_HISTORY_KEY);
    } catch (error) {
        console.warn('清除对话历史存储失败:', error);
    }
}

function clearMediaItems() {
    mediaItems = [];
    mediaPreview.innerHTML = '';
}

async function handleSend() {
    const text = messageInput.value.trim();
    const hasContent = text || hasMediaItems(mediaItems);

    if (!hasContent) return;

    if (currentAbortController) {
        currentAbortController.abort();
    }

    messageInput.value = '';
    messageInput.style.height = 'auto';
    showChatView();

    const userMediaDataUrls = mediaItems.filter(item => item.type === 'image').map(item => item.dataUrl);
    const firstImage = userMediaDataUrls[0] || null;
    createMessageElement('user', text, firstImage);

    let requestContent;
    let currentModelName;

    const messagesWithSystem = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chatHistory
    ];

    if (hasMediaItems(mediaItems)) {
        requestContent = prepareMultimodalContent(mediaItems, text);
        currentModelName = getVisionModelName();
    } else {
        requestContent = text;
        currentModelName = MODEL_NAME;
    }

    chatHistory.push({
        role: 'user',
        content: requestContent
    });

    messagesWithSystem.push({
        role: 'user',
        content: requestContent
    });

    optimizeChatHistory();
    clearMediaItems();
    updateSendButtonState();

    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    sendBtn.classList.add('hidden');
    if (stopBtn) stopBtn.classList.remove('hidden');

    const { contentDiv } = createMessageElement('assistant', '');
    let fullResponse = '';
    let isAborted = false;

    function resetButtons() {
        if (stopBtn) stopBtn.classList.add('hidden');
        sendBtn.classList.remove('hidden');
        currentAbortController = null;
        updateSendButtonState();
    }

    const callbacks = {
        onText: (text) => {
            if (isAborted) return;
            fullResponse = text;
            contentDiv.innerHTML = formatTextForDisplay(text, false);
            scrollToBottom();
        },
        onError: (error) => {
            if (isAborted) return;
            console.error('SSE 请求失败:', error);
            showError(contentDiv, error);
            resetButtons();
        },
        onComplete: (tokens) => {
            if (isAborted) return;
            let finalHtml = parseTextToMarkdown(fullResponse);

            if (tokens) {
                finalHtml += `
                    <div class="mt-3 flex items-center justify-end">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 dark:bg-green-900/30 text-xs font-medium text-green-600 dark:text-green-400 border border-green-100 dark:border-green-800/50">
                            <i class="fas fa-leaf text-[10px]"></i>
                            精准计费: ${tokens} Tokens
                        </span>
                    </div>`;
            }

            contentDiv.innerHTML = finalHtml;
            chatHistory.push({ role: 'assistant', content: fullResponse });
            saveChatHistory();
            resetButtons();
        },
        onAbort: () => {
            if (isAborted) return;
            isAborted = true;
            let finalHtml = parseTextToMarkdown(fullResponse);

            const generatedTokens = Math.ceil(fullResponse.length * 1.2);

            finalHtml += `
                <div class="mt-3 flex items-center justify-end">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/30 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                        <i class="fas fa-hand-paper text-[10px]"></i>
                        已手动停止 - 结算约 ${generatedTokens} Tokens
                    </span>
                </div>`;

            contentDiv.innerHTML = finalHtml;
            chatHistory.push({ role: 'assistant', content: fullResponse });
            saveChatHistory();
            resetButtons();
        }
    };

    await sendMessageStream(
        API_URL,
        apiKey,
        currentModelName,
        messagesWithSystem,
        callbacks,
        signal
    );
}

sendBtn.addEventListener('click', handleSend);

// --- 停止按钮事件监听 ---
if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        if (currentAbortController) {
            currentAbortController.abort();
        }
    });
} else {
    console.warn('警告：未找到 stop-btn 元素，请检查 HTML 结构');
}

// --- 底栏主题切换逻辑 ---
function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const htmlEl = document.documentElement;

    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlEl.classList.add('dark');
    } else {
        htmlEl.classList.remove('dark');
    }
}

if (themeToggleBottomBtn) {
    themeToggleBottomBtn.addEventListener('click', () => {
        const htmlEl = document.documentElement;
        htmlEl.classList.toggle('dark');
        const isDark = htmlEl.classList.contains('dark');
        localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    });
}

initTheme();

// --- 清除全部对话按钮 ---
const clearChatBtn = document.getElementById('clear-chat-btn');

if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
        if (currentAbortController) {
            currentAbortController.abort();
        }

        chatHistory = [];
        clearChatHistoryStorage();
        chatView.innerHTML = '';

        chatView.classList.add('hidden');
        chatView.classList.remove('flex');
        homeView.classList.remove('hidden');

        messageInput.value = '';
        messageInput.style.height = 'auto';
        clearMediaItems();

        updateSendButtonState();
    });
}

// --- 页面加载时恢复对话历史 ---
function restoreChatHistory() {
    if (loadChatHistory() && chatHistory.length > 0) {
        showChatView();

        for (const msg of chatHistory) {
            if (msg.role === 'user') {
                let text = '';
                let imageBase64 = null;

                if (typeof msg.content === 'string') {
                    text = msg.content;
                } else if (Array.isArray(msg.content)) {
                    for (const item of msg.content) {
                        if (item.type === 'text') {
                            text = item.text;
                        } else if (item.type === 'image_url' && item.image_url?.url) {
                            imageBase64 = item.image_url.url;
                        }
                    }
                }
                createMessageElement('user', text, imageBase64);
            } else if (msg.role === 'assistant') {
                createMessageElement('assistant', msg.content);
            }
        }
    }
}

restoreChatHistory();
