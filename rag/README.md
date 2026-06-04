# LightRAG 行情知识库服务

本目录用于把现有行情文档接入 LightRAG，作为 `POST /api/market/report/rag` 的优先 RAG 服务。

## 本地启动

```bash
cd rag
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
copy .env.example .env
lightrag-server --host 127.0.0.1 --port 9621 --working-dir ./rag_storage --input-dir ./inputs
```

Windows PowerShell 可以使用：

```powershell
cd rag
..\.venv-lightrag\Scripts\lightrag-server.exe --host 127.0.0.1 --port 9621 --working-dir ./rag_storage --input-dir ./inputs
```

## 同步行情资料

先运行现有采集：

```bash
npm run market:kb:init
```

再把 SQLite 中的行情文档按语义句子切片，同步到 LightRAG：

```bash
npm run market:rag:dry-run
LIGHTRAG_BASE_URL=http://127.0.0.1:9621 LIGHTRAG_API_KEY=你的LightRAGKey npm run market:rag:sync
```

同步脚本会把每个 chunk 包装成带标题、来源、日期、链接、产品标签的文本，便于 LightRAG 返回可解释引用。

## 后端配置

`backend/.env` 中开启：

```env
LIGHTRAG_ENABLED=true
LIGHTRAG_BASE_URL=http://127.0.0.1:9621
LIGHTRAG_API_KEY=你的LightRAGKey
LIGHTRAG_QUERY_MODE=mix
```

后端会优先请求 LightRAG；如果 LightRAG 不可用，会自动回落到 SQLite FTS5 + 规则报告，不影响演示。
