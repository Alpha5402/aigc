# market-price-forecast — Migration & Operations Runbook

> Phase 1 — 数据层 + 算法层 + 调度层。
>
> Spec：`.kiro/specs/market-price-forecast/{requirements,design,tasks}.md`

## Pre-flight Checklist

部署前确认：

- [ ] backend 主机 Node.js ≥ 18（设计要求 18+；当前实测 24.x 通过）
- [ ] GPU 主机 Python 3.11，互联网或镜像源可达 PyPI
- [ ] backend 与 GPU 主机内网/VPN 互通；GPU 主机不暴露公网
- [ ] `MODEL_SERVICE_SHARED_SECRET` 已生成（≥32 字节随机十六进制），两端配置一致
- [ ] `FORECAST_CONTACT_EMAIL` 设置为可联系邮箱（合规要求 Requirement 12.1）
- [ ] backend 主机能访问 `agri.cn`、`scs.moa.gov.cn`、`pfsc.agri.cn`、`cif.mofcom.gov.cn`（采集所需）
- [ ] DashScope API Key 已配置（如启用 LLM 报告，Phase 2 范围）

---

## 上线步骤（首次部署）

### 1. 拉取代码 + 安装依赖

```bash
# backend 主机
cd /opt/agricloud
git pull
cd backend && npm ci --omit=dev
cd ..
```

### 2. 配置 `.env`

```bash
# backend/.env
cp backend/.env.example backend/.env
# 编辑 backend/.env：
#   - JWT_SECRET 必须改
#   - MODEL_SERVICE_SHARED_SECRET 改为 32+ 字节随机
#   - FORECAST_CONTACT_EMAIL 改为运营邮箱
#   - MODEL_SERVICE_BASE_URL 改为 GPU 主机内网地址，例如 http://model.internal.ysngj.cn:8000
```

### 3. 数据库迁移

```bash
# backend 主机
cd /opt/agricloud
npm run market:seed
# 期望输出：3 条 SPU（苹果/大豆/玉米），spu_id 以 spu_ 开头
```

如果输出显示 SPU 已存在但 `marketItemUpdated: false`，说明 `market_items` 中名为
"苹果/大豆/玉米" 的行已被早期种子写入；执行：

```sql
-- 手动回填 market_items.spu_id
UPDATE market_items SET spu_id = (SELECT spu_id FROM spu_tuples WHERE display_name LIKE '%红富士苹果%' LIMIT 1) WHERE name = '苹果' AND (spu_id IS NULL OR spu_id = '');
UPDATE market_items SET spu_id = (SELECT spu_id FROM spu_tuples WHERE display_name LIKE '%黄大豆%' LIMIT 1) WHERE name = '大豆' AND (spu_id IS NULL OR spu_id = '');
UPDATE market_items SET spu_id = (SELECT spu_id FROM spu_tuples WHERE display_name LIKE '%黄玉米%' LIMIT 1) WHERE name = '玉米' AND (spu_id IS NULL OR spu_id = '');
```

### 4. 启动 backend（PM2）

```bash
cd /opt/agricloud/backend
pm2 start server.js --name agricloud-api --update-env
pm2 logs agricloud-api --lines 50
# 期望日志包含：
#   AgriCloud API listening on http://127.0.0.1:3000
#   [scheduler] {ts} started {tasks:[...]}
```

### 5. 启动 Model_Service（GPU 主机）

参见 [Model_Service 部署](#model_service-部署).

### 6. 历史回填（可选）

如需用近期已知文章的价格作为冷启动种子：

```bash
cd /opt/agricloud
node backend/scripts/backfill-price-history.js --max-urls 5
# 期望：每个 SPU × 每个 URL 至少抽到 1-2 条 price_history
# 礼貌间隔 ≥2s，5 URL × 3 SPU × 2 source ≈ 1-2 分钟
```

### 7. 触发一次手动采集 + 预测（验证全链路）

```bash
# backend 主机
node -e "require('./backend/lib/scheduler').triggerCollectDaily(() => null).then(console.log)"
# 因未配置 urlBuilder，所有采集会 skipped；这是预期：运营层补 URL 模板后再触发

node -e "require('./backend/lib/scheduler').triggerForecastDailyAll({horizons:[7]}).then(console.log)"
# 期望：3 个 SPU × 1 horizon = 3 个 forecast_runs；
# 因为 history < 14 天 → 走 cold_start 路径（fallback MA）；borrowed_history 当无同品种跨产地时不可用
```

---

## 日常运维

### Scheduler 任务清单

| Cron | 任务 | 函数 |
|------|------|------|
| `0 3 * * *` Asia/Shanghai | 日度采集 | `scheduler.triggerCollectDaily` |
| `0 4 * * *` Asia/Shanghai | 日度预测（7 + 30 天） | `scheduler.triggerForecastDailyAll` |

后续 Phase 增加：
- `0 2 * * 1` 周度回测
- `30 4 * * *` LLM 报告生成
- `0 5 * * *` 价格预警
- `0 * * * *` 冷启动队列扫描

### 健康检查

```bash
# backend
curl http://127.0.0.1:3000/api/health

# Model_Service
curl http://model.internal.ysngj.cn:8000/health
# 期望：{"status":"ok","loaded_families":["arima","holt_winters","lstm","prophet","sarima"]}
```

### 关键 SQL 查询

```sql
-- 当日采集成功率
SELECT status, COUNT(*) FROM collection_logs
WHERE created_at >= datetime('now','start of day')
GROUP BY status;

-- 各 SPU 最新预测 + 状态
SELECT spu_id, horizon_days, status, generated_at, model_families_json
FROM forecast_runs
WHERE status IN ('active','clipped','cold_start','qualitative-only')
GROUP BY spu_id, horizon_days
ORDER BY generated_at DESC;

-- 7 日内被熔断的来源
SELECT * FROM source_circuit_breaker WHERE paused_until > datetime('now');
```

### 临时关闭采集 / 预测

```bash
# 维护期：临时关掉调度器，运行后台不再自动跑任务
SCHEDULER_ENABLED=false pm2 restart agricloud-api --update-env

# 恢复：
SCHEDULER_ENABLED=true pm2 restart agricloud-api --update-env
```

---

## 回滚步骤

### 部分回滚（仅关闭新功能）

```bash
SCHEDULER_ENABLED=false pm2 restart agricloud-api --update-env
# 这样会保留 schema 与历史数据；所有写入暂停，前端旧路径不受影响。
```

### 完全回滚（删除 Phase 1 表）

> 警告：会丢失 price_history / forecast_runs 全部数据。仅在确认要彻底放弃 Phase 1 时执行。

```bash
sqlite3 /opt/agricloud/backend/data/agricloud.sqlite <<'SQL'
DROP TABLE IF EXISTS forecast_run_models;
DROP TABLE IF EXISTS forecast_runs;
DROP TABLE IF EXISTS price_history;
DROP TABLE IF EXISTS collection_logs;
DROP TABLE IF EXISTS robots_cache;
DROP TABLE IF EXISTS source_circuit_breaker;
DROP TABLE IF EXISTS scheduler_locks;
DROP TABLE IF EXISTS variety_aliases;
DROP TABLE IF EXISTS spu_tuples;
DROP TABLE IF EXISTS units;
DROP TABLE IF EXISTS grades;
DROP TABLE IF EXISTS varieties;
DROP TABLE IF EXISTS origins;
SQL
```

`market_items.spu_id` 列仍保留（SQLite 不支持 DROP COLUMN，需重建表；非必要不动）。

---

## Model_Service 部署

> 独立 Python 服务，部署在 GPU 主机；通过内网与 backend 通信。

### 系统要求

- Ubuntu 22.04 LTS（推荐）或 Debian 12
- Python 3.11
- 至少 4 GB 内存（无 GPU 时 LSTM 适配器在 CPU 跑得下）
- 有 GPU 时：CUDA 12.1+ + 对应 PyTorch wheel

### 安装

```bash
# GPU 主机
sudo useradd --system --shell /bin/bash --home /opt/agricloud-forecast agricloud
sudo mkdir -p /opt/agricloud-forecast
sudo chown agricloud:agricloud /opt/agricloud-forecast

sudo -u agricloud bash <<'EOF'
cd /opt/agricloud-forecast
git clone <repo-url> .
cd model-service
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
EOF
```

### 配置

```bash
# /opt/agricloud-forecast/model-service/.env
FORECAST_SHARED_SECRET=<与 backend 的 MODEL_SERVICE_SHARED_SECRET 一致>
FORECAST_NONCE_TTL_SECONDS=300
MODEL_INFERENCE_CONCURRENCY=4
MODEL_ARTIFACT_DIR=/var/agricloud/models
LOG_LEVEL=INFO
HOST=127.0.0.1
PORT=8000
```

### systemd 单元

```ini
# /etc/systemd/system/agricloud-forecast.service
[Unit]
Description=AgriCloud Forecast Model Service
After=network.target

[Service]
Type=simple
User=agricloud
WorkingDirectory=/opt/agricloud-forecast/model-service
EnvironmentFile=/opt/agricloud-forecast/model-service/.env
ExecStart=/opt/agricloud-forecast/model-service/.venv/bin/uvicorn agricloud_forecast.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now agricloud-forecast
sudo systemctl status agricloud-forecast
```

### 健康检查

```bash
curl http://127.0.0.1:8000/health
# 期望 200 + JSON
```

### 互通验证（在 backend 主机上）

```bash
# backend 主机
node -e "
require('./backend/lib/forecast-signer'); // 加载 secret env
const { signRequest } = require('./backend/lib/forecast-signer');
const body = '';
const sig = signRequest({ method:'GET', path:'/health', body, secret: process.env.MODEL_SERVICE_SHARED_SECRET });
console.log(sig);
"
# 把 headers 复制到 curl 里测一次受保护的端点
```

---

## 常见问题

### Q1：日度采集 0 success，全部 skipped

A：90% 是因为 `urlBuilder` 没有传入 URL 模板。打开 `collection_logs` 看 `reason` 列：

- `no_url_configured`：运营层未补 URL，预期行为
- `robots:disallow`：来源 robots.txt 拒绝，确认是不是抓错路径
- `robots:fetch_error` / `robots:timeout`：网络问题或目标域名不可达
- `circuit_break:source_paused`：来源连续 3 次失败，自动暂停 1h

### Q2：日度预测全部 cold_start

A：`price_history` < 14 天。运行 `npm run market:backfill` 灌入历史。

### Q3：日度预测全部 degraded

A：Model_Service 不可达或返回 5xx。
- 先在 GPU 主机看 `journalctl -u agricloud-forecast -n 100`
- backend 端 `tail -f` 查找 `forecast` 字样的错误
- 确认 `MODEL_SERVICE_SHARED_SECRET` 两端一致

### Q4：HMAC 签名验证总失败

A：常见两个原因：
- 时钟偏差超过 5 分钟 → 两台主机都启用 NTP
- secret 末尾换行 / 空格 → 用 `printf '%s' "$SECRET" | wc -c` 确认两端字节数一致

### Q5：node-cron 没触发任务

A：检查时区。我们写的是 `Asia/Shanghai`，如果 backend 主机时区不是 UTC + 8 也不影响（cron 内部按时区计算），但如果 PM2 进程在 docker 里 `/etc/localtime` 不对，最稳妥的方式是在 .env 里 `TZ=Asia/Shanghai`。
