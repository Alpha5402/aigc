# AgriCloud Forecast — Model Service

独立部署的 Python 价格预测推理服务。属于 AgriCloudManager 的 `market-price-forecast` Spec（Phase 1）的算法层后端。

## 架构定位

```
Node.js Backend (ysngj.cn:3000)
    │  HTTP REST + HMAC-SHA256
    │  连接 5s / 总 30s 超时
    ▼
Model_Service (本服务，独立 GPU 服务器)
    │  FastAPI + Uvicorn
    │  ARIMA / Holt-Winters / Prophet / LSTM / ...
```

详见：
- 需求：`.kiro/specs/market-price-forecast/requirements.md`
- 设计：`.kiro/specs/market-price-forecast/design.md` §8
- 任务：`.kiro/specs/market-price-forecast/tasks.md` §3

## 快速启动（本地开发）

### 1. 安装依赖

推荐使用 [uv](https://docs.astral.sh/uv/)；如果用 pip：

```bash
python3.11 -m venv .venv
source .venv/bin/activate           # Linux/macOS
# 或 .venv\Scripts\Activate.ps1      Windows
pip install -e ".[dev]"
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env：FORECAST_SHARED_SECRET 与 backend/.env 中的 MODEL_SERVICE_SHARED_SECRET 必须一致
```

### 3. 启动服务

```bash
uvicorn agricloud_forecast.main:app --host 127.0.0.1 --port 8000
```

### 4. 健康检查

```bash
curl http://127.0.0.1:8000/health
```

## 与 Node.js Backend 的对接

### HMAC 共享密钥

请求头：

| Header | 含义 |
|---|---|
| `X-Forecast-Signature` | HMAC-SHA256 签名（hex） |
| `X-Forecast-Nonce` | 16 字节随机十六进制（5 分钟内唯一） |
| `X-Forecast-Timestamp` | 毫秒级时间戳（与服务端偏差 ≤5 分钟） |
| `X-Forecast-Request-Id` | 16-64 字符跨服务追踪 ID |

签名算法：

```
canonical = METHOD + '\n' + PATH + '\n' + sha256(body) + '\n' + nonce + '\n' + timestamp
signature = HMAC-SHA256(SHARED_SECRET, canonical)
```

Node.js 端实现见 `backend/lib/forecast-signer.js`。两端实现必须对得上才能联调。

### 接口契约

- `POST /forecast` — 单 SPU 推理
- `POST /forecast/batch` — 批量推理（单批 ≤50）
- `GET /health` — 健康检查（不需要签名）

字段与 schema 详见 `src/agricloud_forecast/schemas.py`。

## 部署

### systemd 单元（推荐）

```ini
# /etc/systemd/system/agricloud-forecast.service
[Unit]
Description=AgriCloud Forecast Model Service
After=network.target

[Service]
Type=simple
User=agricloud
WorkingDirectory=/opt/agricloud-forecast
EnvironmentFile=/opt/agricloud-forecast/.env
ExecStart=/opt/agricloud-forecast/.venv/bin/uvicorn agricloud_forecast.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 安全约束

- **不监听公网**：服务仅绑定 `127.0.0.1` 或内网地址
- **HMAC 共享密钥**：32+ 字节随机字符串，与 backend 通过受控渠道分发
- **GPU 资源**：默认 `MODEL_INFERENCE_CONCURRENCY=4` 防 OOM
- **模型权重**：放在 `MODEL_ARTIFACT_DIR`，不进 git

## 测试

```bash
pytest -v
```

## 范围

本服务为 Phase 1，仅承接**推理**：

- ✅ 4 个家族最小可推理实现：ARIMA、Holt-Winters、Prophet、LSTM
- ✅ HMAC 签名校验中间件
- ✅ 简易 LRU 模型缓存
- ✅ 推理并发限制（asyncio.Semaphore）
- ❌ 训练 pipeline（后续 Phase）
- ❌ 模型注册管理 UI（Backend 侧 Admin Console）
- ❌ 影子模式 / canary 流量切分（在 Backend 侧实现）
