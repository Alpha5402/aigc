# Model_Service 部署速查（AutoDL GPU 服务器）

> 路径 1 部署：GPU 服务器**只跑 Python 推理服务**；backend 保留在 ysngj.cn。
>
> 完整版 runbook 见 `MIGRATION.md`。

## 0. 前置确认

在 AutoDL 控制台：

1. 登录控制台 → 实例 → 找到这台 GPU 实例
2. 点击 **自定义服务**，新增一条端口映射：
   - 容器内端口：`8000`
   - 协议：`http`
   - 备注：`agricloud-forecast`
3. 记下 AutoDL 给的"自定义域名"（形如 `https://u123-xxx.connect.nmb2.seetacloud.com`）—— 这是从公网/ysngj.cn 调用本服务的入口

## 1. 系统环境（首次安装）

容器自带 Python，但版本可能是 3.10。Phase 1 设计要求 ≥3.11；先确认：

```bash
python3 --version
which python3
```

如果是 3.11+ 直接进 §2。否则：

```bash
# AutoDL 通常自带 conda，新建 3.11 环境最稳
conda create -n forecast python=3.11 -y
conda activate forecast
```

> 整篇剩余指令都默认你已经 `conda activate forecast` 或者系统 Python 就是 3.11。

## 2. 部署目录

AutoDL 容器中只有 `/root/autodl-tmp/` 是持久存储；其他路径在停机后可能重置。

```bash
mkdir -p /root/autodl-tmp/agricloud-forecast
cd /root/autodl-tmp/agricloud-forecast
```

把上传的 tar.gz 解压到这里（具体命令见对话里的 §C 步骤）。

## 3. 安装 Python 依赖

```bash
cd /root/autodl-tmp/agricloud-forecast/model-service
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
```

注意点：

- `prophet` 在某些环境下编译耗时较长（~5 min），若失败可加 `--no-build-isolation`
- `torch>=2.4` 默认会装 CUDA 版（自动检测）；如果你想锁 CPU 版省空间，先 `pip install torch --index-url https://download.pytorch.org/whl/cpu`

## 4. 配置 `.env`

```bash
cd /root/autodl-tmp/agricloud-forecast/model-service
cp .env.example .env
nano .env   # 或 vim
```

必改字段：

```ini
# 与 backend 那台 (ysngj.cn) 的 MODEL_SERVICE_SHARED_SECRET 必须一致
FORECAST_SHARED_SECRET=<生成 32 字节随机十六进制>

FORECAST_NONCE_TTL_SECONDS=300
MODEL_INFERENCE_CONCURRENCY=4
MODEL_ARTIFACT_DIR=/root/autodl-tmp/agricloud-forecast/artifacts
LOG_LEVEL=INFO
HOST=0.0.0.0          # AutoDL 自定义服务要 0.0.0.0，不是 127.0.0.1
PORT=8000
```

生成共享密钥：

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

把输出值写入 `.env` 的 `FORECAST_SHARED_SECRET`，**同时**记下来稍后写到 ysngj.cn 那边的 `backend/.env` 里。

## 5. 健康检查（前台运行确认能起来）

```bash
cd /root/autodl-tmp/agricloud-forecast/model-service
source .venv/bin/activate
uvicorn agricloud_forecast.main:app --host 0.0.0.0 --port 8000
```

新开一个终端测试：

```bash
curl http://127.0.0.1:8000/health
# 期望：{"status":"ok","version":"0.1.0","log_level":"INFO","loaded_families":["arima","holt_winters","lstm","prophet","sarima"]}
```

外网用 AutoDL 的自定义域名：

```bash
# 本地 PowerShell：
curl https://u123-xxx.connect.nmb2.seetacloud.com/health
```

如果都 200 且 `loaded_families` 列出 5 个家族，**M3 实测通过 ✅**。

按 `Ctrl+C` 关闭前台进程，进 §6。

## 6. systemd 守护（让服务后台常驻）

> AutoDL 容器通常以 root 运行，systemd 可能不可用。两条路径：

### 路径 A：systemd 可用（少数镜像）

```bash
sudo cat > /etc/systemd/system/agricloud-forecast.service <<'EOF'
[Unit]
Description=AgriCloud Forecast Model Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/autodl-tmp/agricloud-forecast/model-service
EnvironmentFile=/root/autodl-tmp/agricloud-forecast/model-service/.env
ExecStart=/root/autodl-tmp/agricloud-forecast/model-service/.venv/bin/uvicorn agricloud_forecast.main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now agricloud-forecast
systemctl status agricloud-forecast
```

### 路径 B：systemd 不可用（AutoDL 多数镜像）

用 `nohup` 或 `tmux`，把日志重定向：

```bash
cd /root/autodl-tmp/agricloud-forecast/model-service
source .venv/bin/activate
nohup uvicorn agricloud_forecast.main:app --host 0.0.0.0 --port 8000 \
  >/root/autodl-tmp/agricloud-forecast/forecast.out.log \
  2>/root/autodl-tmp/agricloud-forecast/forecast.err.log &
echo $! > /root/autodl-tmp/agricloud-forecast/forecast.pid
```

停止：

```bash
kill $(cat /root/autodl-tmp/agricloud-forecast/forecast.pid)
```

## 7. 跑测试

```bash
cd /root/autodl-tmp/agricloud-forecast/model-service
source .venv/bin/activate
pytest -v
```

至少 `test_health.py` 应当全过。

## 8. 与 ysngj.cn 那台 backend 联调

在 ysngj.cn 那台机器上修改 `backend/.env`：

```ini
MODEL_SERVICE_BASE_URL=https://u123-xxx.connect.nmb2.seetacloud.com
MODEL_SERVICE_SHARED_SECRET=<与 GPU 上的 FORECAST_SHARED_SECRET 完全一致>
MODEL_SERVICE_TIMEOUT_MS=30000
```

重启 backend：

```bash
pm2 restart agricloud-api --update-env
```

调一次手动预测验证：

```bash
node -e "require('./backend/lib/scheduler').triggerForecastDailyAll({horizons:[7]}).then(console.log)"
```

如果 `summary.success >= 1` 或者至少不再全是 `degraded`，**全链路打通 ✅**。

## 常见问题

### Q：`pip install` 卡在 prophet
prophet 编译要 5-15 分钟，耐心等。卡死了用 `pip install prophet --no-build-isolation`。

### Q：torch 占了几 GB
默认装 CUDA 版正常。如果你这台 GPU 不打算训练只推理，CPU 版小很多：
```bash
pip uninstall torch -y
pip install torch --index-url https://download.pytorch.org/whl/cpu
```
但 LSTM 适配器在 CPU 推理会慢一些。

### Q：HMAC 签名 `expired` 错误
两端时钟差 > 5 分钟。在 GPU 主机：
```bash
date
# 如果不准：
ntpdate -u pool.ntp.org   # 或 chronyd
```

### Q：prophet / lstm 适配器 `ModelAdapterError`
日志会标识具体原因（依赖未装、history 太短、收敛失败）。Phase 1 接受单家族失败：response 里 `status='failed'` 不影响其他家族。

### Q：怎么看正在运行
```bash
# systemd
journalctl -u agricloud-forecast -f

# nohup
tail -f /root/autodl-tmp/agricloud-forecast/forecast.err.log
```
