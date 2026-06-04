/**
 * 农智 AI 病害诊断助手 - 核心应用逻辑
 * 模块化版本，依赖 sse.js 和 image.js
 */

// --- 导入 SSE 模块 ---
import { sendMessageStream, formatTextForDisplay, parseTextToMarkdown } from './sse.js';
// --- 导入图像识别模块 ---
import { handleImageUpload, createMediaPreview, prepareMultimodalContent, hasMediaItems, getVisionModelName, openImagePreview } from './image.js';

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
// 检查是否有配置，没有则跳转
const BAILIAN_API_KEY = localStorage.getItem('BAI_LIAN_API_KEY');
if (!BAILIAN_API_KEY) {
    // 如果没有配置过，强制跳转到配置页
    window.location.href = 'config.html';
    // 阻止后续代码执行
    throw new Error("缺少配置，已跳转");
}

// 如果有配置，继续初始化
const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
// 注意：这里填你在百炼平台创建的模型名称
const MODEL_NAME = 'deepseek-v3.2';

let apiKey = BAILIAN_API_KEY;
let chatHistory = [];
// 中断控制器 - 用于停止正在生成的响应
let currentAbortController = null;

// --- 媒体项管理 ---
let mediaItems = [];

// --- 对话历史管理配置 ---
const MAX_MESSAGES = 20; // 最大保留对话轮数
const CHAT_HISTORY_KEY = 'nongzhi-chat-history'; // localStorage 存储键名
const THEME_KEY = 'nongzhi-theme-mode'; // 主题存储键名

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
        // 解除禁用，移除置灰和禁止点击的 CSS
        sendBtn.disabled = false;
        sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        // 开启禁用，加上置灰和禁止点击的 CSS
        sendBtn.disabled = true;
        sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

// --- 辅助函数：安全转义 HTML ---
function escapeHtml(unsafe) {
    // 强制转换为字符串，防止传入 token 对象导致崩溃
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

// 兼容 marked.js 最新版 (v13+) 的 token 对象，以及老版本的字符串参数
renderer.code = function(codeOrToken, defaultLang) {
    let code = '';
    let rawLang = '';

    // 判断传入的是否为最新版 marked 的 token 对象
    if (typeof codeOrToken === 'object' && codeOrToken !== null) {
        code = codeOrToken.text || '';
        rawLang = codeOrToken.lang || '';
    } else {
        // 兼容老版本
        code = codeOrToken || '';
        rawLang = defaultLang || '';
    }

    // 提取纯净的语言名称，去除多余的空格或特殊标记
    const language = rawLang.split(/[\s:]+/)[0].trim().toLowerCase();

    let validLanguage = language || 'plaintext';
    let highlightedCode = '';

    // 安全获取全局 highlight.js 对象
    const hljsObj = window.hljs || (typeof hljs !== 'undefined' ? hljs : null);

    if (hljsObj) {
        try {
            // 如果能够精确匹配到对应的语言，直接高亮
            if (language && hljsObj.getLanguage(language)) {
                validLanguage = language;
                highlightedCode = hljsObj.highlight(code, { language: validLanguage }).value;
            } else {
                // 如果没有写语言，或者是不认识的语言，让它【自动推断】并高亮
                const auto = hljsObj.highlightAuto(code);
                validLanguage = auto.language || 'plaintext'; // 显示推断出的语言
                highlightedCode = auto.value;
            }
        } catch (error) {
            console.warn('代码高亮失败，降级为普通文本:', error);
            highlightedCode = escapeHtml(code);
        }
    } else {
        // 如果网络原因 highlight.js 没加载出来
        highlightedCode = escapeHtml(code);
    }

    // 将原始代码转义，存放在按钮的 data-code 属性中，供完美复制使用
    const escapedRawCode = escapeHtml(code);

    // 绿色农业主题配色 - VS Code 沉浸式风格
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

// 应用配置
if (typeof marked !== 'undefined') {
    marked.setOptions({
        renderer: renderer,
        breaks: true // 允许 Markdown 中的回车换行
    });
}

// --- 全局监听代码复制功能 ---
document.addEventListener('click', async (e) => {
    // 寻找被点击的最近的 .copy-code-btn 元素
    const copyBtn = e.target.closest('.copy-code-btn');
    if (!copyBtn) return;

    e.preventDefault();

    // 1. 获取转义后的原始代码
    let rawCode = copyBtn.getAttribute('data-code');

    // 2. 将转义的 HTML 实体还原为真实的字符
    rawCode = rawCode
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');

    try {
        // 3. 写入系统剪贴板
        await navigator.clipboard.writeText(rawCode);

        // 4. UI 视觉反馈：变为绿色的"已复制"
        const icon = copyBtn.querySelector('i');
        const text = copyBtn.querySelector('.copy-text');

        icon.className = 'fas fa-check text-green-400';
        text.textContent = '已复制';
        text.classList.add('text-green-400');

        // 5. 2秒后恢复原状
        setTimeout(() => {
            icon.className = 'far fa-copy';
            text.textContent = '复制';
            text.classList.remove('text-green-400');
        }, 2000);

    } catch (err) {
        console.error('复制失败:', err);
        // 如果浏览器由于安全限制拒绝访问剪贴板，提供降级提示
        alert('剪贴板访问失败，请手动框选复制。');
    }
});

// --- 输入框自动增高 & 状态控制 ---
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';

    // 替换为统一的状态管理函数
    updateSendButtonState();
});

// --- 快捷键处理 ---
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // 检查是否有媒体项或文本内容
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

        // 创建预览
        const previewEl = createMediaPreview(mediaItem, (id) => {
            // 删除回调
            mediaItems = mediaItems.filter(item => item.id !== id);
            // 更新发送按钮状态
            updateSendButtonState();
        });
        mediaPreview.appendChild(previewEl);

        // 更新发送按钮状态
        updateSendButtonState();

    } catch (error) {
        console.error('图片上传失败:', error);
        alert(error.message);
    } finally {
        // 清除 input 的值，避免重复选择同一个文件无法触发 change 事件
        imageInput.value = '';
    }
});

// --- 快捷建议卡片 ---
document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
        const text = card.querySelector('p').textContent;
        messageInput.value = text;
        messageInput.dispatchEvent(new Event('input'));
        // 直接发送消息
        handleSend();
    });
});

// --- 核心对话逻辑 ---

// 切换到对话视图
function showChatView() {
    if (homeView.classList.contains('hidden')) return;
    homeView.classList.add('hidden');
    chatView.classList.remove('hidden');
    chatView.classList.add('flex');
}

// 创建消息气泡 DOM
function createMessageElement(role, content, imageBase64 = null) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${role}`;

    // 头像 - 使用绿色农业主题图标
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (role === 'user') {
        avatar.innerHTML = '<i class="fas fa-user"></i>';
    } else {
        // AI 使用叶子图标，体现农业主题
        avatar.innerHTML = '<i class="fas fa-leaf"></i>';
    }

    // 气泡内容区
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = 'message-content';

    // 气泡主体
    const bubble = document.createElement('div');
    // 用户的不需要 w-full，AI 的回复需要 w-full
    bubble.className = role === 'user'
        ? 'message-bubble markdown-body'
        : 'message-bubble markdown-body w-full';

    // 如果有图片（用户上传）
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

    // 文本内容区
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

// 显示错误信息
function showError(contentDiv, error) {
    // 检查是否是 API Key 无效的错误
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

/**
 * 优化消息历史，防止超出 Token 限制
 * 策略：保留最近的 MAX_MESSAGES 条消息
 */
function optimizeChatHistory() {
    if (chatHistory.length > MAX_MESSAGES * 2) {
        // 每条对话包含 user 和 assistant 两条消息
        const messagesToRemove = chatHistory.length - MAX_MESSAGES * 2;
        chatHistory = chatHistory.slice(messagesToRemove);
        console.log('已优化对话历史，保留最近 ' + MAX_MESSAGES + ' 条消息');
    }
}

/**
 * 保存对话历史到 localStorage
 */
function saveChatHistory() {
    try {
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
    } catch (error) {
        console.warn('保存对话历史失败:', error);
    }
}

/**
 * 从 localStorage 加载对话历史
 */
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

/**
 * 清除 localStorage 中的对话历史
 */
function clearChatHistoryStorage() {
    try {
        localStorage.removeItem(CHAT_HISTORY_KEY);
    } catch (error) {
        console.warn('清除对话历史存储失败:', error);
    }
}

/**
 * 清除媒体项和预览
 */
function clearMediaItems() {
    mediaItems = [];
    mediaPreview.innerHTML = '';
}

// 核心发送请求处理 - 使用 sse.js 模块
async function handleSend() {
    const text = messageInput.value.trim();
    const hasContent = text || hasMediaItems(mediaItems);

    if (!hasContent) return;

    // 如果存在进行中的请求，先中断它（防止并发或残留）
    if (currentAbortController) {
        currentAbortController.abort();
    }

    // 1. UI 处理
    messageInput.value = '';
    messageInput.style.height = 'auto';
    showChatView();

    // 2. 渲染用户消息（如果有图片，也显示图片）
    const userMediaDataUrls = mediaItems.filter(item => item.type === 'image').map(item => item.dataUrl);

    // 如果有多个图片，需要创建多个消息元素，或者在一个消息中显示
    // 这里为了简化，我们在一个消息中显示第一个图片（如果有）
    const firstImage = userMediaDataUrls[0] || null;
    createMessageElement('user', text, firstImage);

    // 3. 构建请求 Payload
    let requestContent;
    let currentModelName;

    // 构建消息，包含系统提示词
    const messagesWithSystem = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chatHistory
    ];

    if (hasMediaItems(mediaItems)) {
        // 有媒体项，使用视觉模型和多模态格式
        requestContent = prepareMultimodalContent(mediaItems, text);
        currentModelName = getVisionModelName();
    } else {
        // 纯文本，使用普通模型
        requestContent = text;
        currentModelName = MODEL_NAME;
    }

    // 添加用户消息到历史
    chatHistory.push({
        role: 'user',
        content: requestContent
    });

    // 添加到带系统提示的消息数组
    messagesWithSystem.push({
        role: 'user',
        content: requestContent
    });

    // 4. 优化对话历史，防止 Token 溢出
    optimizeChatHistory();

    // 5. 清除媒体项
    clearMediaItems();
    updateSendButtonState();

    // 6. 初始化 AbortController
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    // 7. 切换按钮状态：隐藏发送，显示停止
    sendBtn.classList.add('hidden');
    if (stopBtn) stopBtn.classList.remove('hidden');

    // 8. 渲染 AI 等待消息
    const { contentDiv } = createMessageElement('assistant', '');
    let fullResponse = '';
    let isAborted = false;

    // 辅助函数：恢复按钮状态
    function resetButtons() {
        if (stopBtn) stopBtn.classList.add('hidden');
        sendBtn.classList.remove('hidden');
        currentAbortController = null;

        // 替换为统一的状态管理函数
        updateSendButtonState();
    }

    // 定义回调函数
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
        // 正常完成时：显示绿色的精确 Token 消耗
        onComplete: (tokens) => {
            if (isAborted) return;
            let finalHtml = parseTextToMarkdown(fullResponse);

            // 构建漂亮的绿色农业主题计费角标
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
            saveChatHistory(); // 保存到 localStorage
            resetButtons();
        },
        // 被打断时：显示橘黄色的警告与"节约估算"
        onAbort: () => {
            // 防止重复调用
            if (isAborted) return;
            isAborted = true;
            let finalHtml = parseTextToMarkdown(fullResponse);

            // 中断时 API 不返回 usage，我们做个前端估算 (1个中文字符约等于 1.2 个 Token)
            const generatedTokens = Math.ceil(fullResponse.length * 1.2);

            finalHtml += `
                <div class="mt-3 flex items-center justify-end">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/30 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                        <i class="fas fa-hand-paper text-[10px]"></i>
                        已手动停止 - 结算约 ${generatedTokens} Tokens
                    </span>
                </div>`;

            contentDiv.innerHTML = finalHtml;
            // 将已生成的部分存入历史，保证上下文不断档
            chatHistory.push({ role: 'assistant', content: fullResponse });
            saveChatHistory(); // 保存到 localStorage
            resetButtons();
        }
    };

    // 调用 sse.js 模块处理流式响应
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

// ==========================================
// 停止按钮事件监听
// ==========================================
if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        if (currentAbortController) {
            currentAbortController.abort();
        }
    });
} else {
    console.warn('警告：未找到 stop-btn 元素，请检查 HTML 结构');
}

// ==========================================
// 底栏主题切换逻辑 (白天/黑夜模式)
// ==========================================

// 1. 初始化时检查本地存储的主题状态
function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const htmlEl = document.documentElement;

    // 如果用户之前选了黑夜，或者系统默认是黑夜且用户没选过
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlEl.classList.add('dark');
    } else {
        htmlEl.classList.remove('dark');
    }
}

// 2. 绑定底栏按钮点击事件
if (themeToggleBottomBtn) {
    themeToggleBottomBtn.addEventListener('click', () => {
        const htmlEl = document.documentElement;

        // 切换 HTML 标签上的 dark 类名
        htmlEl.classList.toggle('dark');

        // 判断当前是否是深色模式
        const isDark = htmlEl.classList.contains('dark');

        // 保存用户的偏好到本地，下次刷新还在
        localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    });
}

// 执行初始化
initTheme();

// ==========================================
// 清除全部对话按钮
// ==========================================
const clearChatBtn = document.getElementById('clear-chat-btn');

if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
        // 如果正在进行对话，先中断
        if (currentAbortController) {
            currentAbortController.abort();
        }

        // 清空对话历史
        chatHistory = [];

        // 清除 localStorage 中的对话历史
        clearChatHistoryStorage();

        // 清空聊天视图
        chatView.innerHTML = '';

        // 切换回首页
        chatView.classList.add('hidden');
        chatView.classList.remove('flex');
        homeView.classList.remove('hidden');

        // 清空输入框和媒体项
        messageInput.value = '';
        messageInput.style.height = 'auto';
        clearMediaItems();

        // 重置按钮状态
        updateSendButtonState();
    });
}

// ==========================================
// 页面加载时恢复对话历史
// ==========================================
function restoreChatHistory() {
    if (loadChatHistory() && chatHistory.length > 0) {
        // 有历史记录，切换到聊天视图
        showChatView();

        // 遍历历史记录，重新渲染消息
        for (const msg of chatHistory) {
            if (msg.role === 'user') {
                // 用户消息：提取文本内容
                let text = '';
                let imageBase64 = null;

                if (typeof msg.content === 'string') {
                    text = msg.content;
                } else if (Array.isArray(msg.content)) {
                    // 多模态消息格式
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
                // AI 消息
                createMessageElement('assistant', msg.content);
            }
        }
    }
}

// 执行恢复
restoreChatHistory();
