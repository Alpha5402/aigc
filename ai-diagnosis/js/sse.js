/**
 * SSE (Server-Sent Events) 流式输出处理器
 * 负责解析 SSE 流并将其转换为 Markdown 格式的内容
 */

// --- 类型定义 ---

/**
 * 流式处理回调函数类型
 * @typedef {Object} StreamCallbacks
 * @property {(text: string) => void} onText - 文本更新回调
 * @property {(error: Error) => void} onError - 错误处理回调
 * @property {() => void} onComplete - 完成回调
 * @property {() => void} [onAbort] - 请求中断回调
 */

// --- 导出的 API ---

/**
 * 处理 SSE 流式响应
 * @param {ReadableStream} readableStream - 从 fetch 响应获取的可读流
 * @param {StreamCallbacks} callbacks - 回调函数
 * @returns {Promise<void>}
 */
export async function processSSEStream(readableStream, callbacks) {
    let fullText = '';
    let totalTokens = null;
    const decoder = new TextDecoder('utf-8');
    const reader = readableStream.getReader();

    try {
        while (true) {
            const { done, value } = await reader.read(); // 中断时，这里会抛出 AbortError

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
        // 核心修复点 1：精准拦截读取流时的中断错误
        if (error.name === 'AbortError') {
            console.log('底层数据流已成功切断');

            // 通知 app.js 触发停止生成后的 UI 重置逻辑
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
 * @param {Array<{role: string, content: string|Array}>} messages - 消息历史
 * @param {StreamCallbacks} callbacks - 回调函数
 * @param {AbortSignal} [signal] - 中断信号
 * @returns {Promise<void>}
 */
export async function sendMessageStream(apiUrl, apiKey, modelName, messages, callbacks, signal) {
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
            signal: signal // 传入中断信号
        });

        if (!response.ok) {
            let errorMessage = response.status === 401 ? 'API Key 无效，请检查配置' : `HTTP Error ${response.status}`;
            throw new Error(errorMessage);
        }

        await processSSEStream(response.body, callbacks);

    } catch (error) {
        // 核心修复点 2：精准拦截建立连接时的中断错误
        if (error.name === 'AbortError') {
            console.log('用户主动终止了生成过程');
            // 通知 UI 层触发停止后的渲染逻辑
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
export function parseTextToMarkdown(text) {
    if (typeof window !== 'undefined' && window.marked) {
        try {
            return window.marked.parse(text) || '';
        } catch (e) {
            console.error('Markdown 解析错误:', e);
        }
    }

    // 如果没有 Marked 库，返回原始文本，简单替换换行
    return text.replace(/\n/g, '<br>');
}

/**
 * 创建格式化后的 HTML，包含正在输入的指示器
 * @param {string} text - 完整文本内容
 * @param {boolean} isComplete - 是否完成
 * @returns {string} - 格式化后的 HTML
*/
export function formatTextForDisplay(text, isComplete = false) {
    let html = parseTextForDisplay(text);;
    if (!isComplete) {
        if (html.endsWith('</p>')) {
            html = html.slice(0, -4) + '<span class="cursor-blink"></span></p>';
        } else {
            html += '<span class="cursor-blink"></span>';
        }
    }
    return html;
}
