# AgriCloudManager 服务器部署说明

## 一键部署文件

- Nginx 模板：[nginx.conf](./nginx.conf)
- 自动部署脚本：[deploy.sh](./deploy.sh)
- 前端生产环境文件：[../.env.production](../.env.production)

## 自动部署脚本说明

`deploy.sh` 现在会完成这些动作：

1. 校验本地 `.env.production`
2. 渲染最终 Nginx 配置到 `deploy/.rendered/nginx.conf`
3. 本地执行 `npm run build:h5`
4. 上传 `.env.production`
5. 上传前端 H5 产物到 `/opt/agricloud/frontend`
6. 上传后端代码到 `/opt/agricloud/backend`
7. 上传本地 `backend/.env`
8. 上传 LightRAG 配置、`rag/` 和 `scripts/`
9. 上传渲染后的 Nginx 配置
10. 远端安装 LightRAG Python 依赖
11. 远端通过 PM2 启动或重启 `agricloud-rag`
12. 将行情知识库文档同步进 LightRAG
13. 远端执行 `nginx -t`
14. 远端执行 `systemctl reload nginx`
15. 远端执行 `npm ci --omit=dev`
16. 远端通过 PM2 启动或重启 `agricloud-api`

### 本地仅验证，不连接服务器

```bash
RUN_REMOTE=0 bash deploy/deploy.sh
```

### 默认一键发布到 `123.58.210.188`

```bash
bash deploy/deploy.sh
```

### 如果远端不是 root

```bash
REMOTE_HOST=ubuntu@123.58.210.188 REMOTE_USER_IS_ROOT=0 bash deploy/deploy.sh
```

### 自定义域名或别名

```bash
DOMAIN_NAME=ysngj.cn DOMAIN_ALIASES="www.ysngj.cn 123.58.210.188" bash deploy/deploy.sh
```

## 服务器上线执行清单

以下步骤按顺序执行，目标服务器为 `123.58.210.188`，域名为 `ysngj.cn`。

### 1. DNS 检查

在本地检查解析是否生效：

```bash
nslookup ysngj.cn
nslookup www.ysngj.cn
nslookup img.ysngj.cn
```

期望解析到：

```text
123.58.210.188
```

以及：

```text
www.ysngj.cn -> 123.58.210.188
```

以及：

```text
img.ysngj.cn -> oss-cn-hongkong.aliyuncs.com
```

### 2. 登录服务器

```bash
ssh root@123.58.210.188
```

### 3. 安装运行环境

```bash
apt update
apt install -y nginx sqlite3 curl rsync python3 python3-venv python3-pip
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
```

### 4. 创建部署目录

```bash
mkdir -p /opt/agricloud/frontend
mkdir -p /opt/agricloud/backend/data
mkdir -p /opt/agricloud/backend/deploy
mkdir -p /opt/agricloud/scripts
mkdir -p /opt/agricloud/rag/inputs
mkdir -p /opt/agricloud/rag/rag_storage
```

### 5. 防火墙和端口

如果启用了防火墙，放行 `80` 和 `443`：

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload
```

### 6. 首次推送代码

在你的本地项目根目录执行：

```bash
cd "D:\qq\AgriCloudManager1.1 (1)\AgriCloudManager"
bash deploy/deploy.sh
```

如果你在 Windows PowerShell 里执行，推荐用 WSL：

```powershell
wsl sh -lc "cd '/mnt/d/qq/AgriCloudManager1.1 (1)/AgriCloudManager' && bash deploy/deploy.sh"
```

### 7. 本地确认后端 `.env`

部署脚本现在会自动上传本地 [backend/.env](../backend/.env)。

部署前至少确认这些项：

```env
JWT_SECRET=换成强随机字符串
DASHSCOPE_API_KEY=你的百炼Key
LIGHTRAG_ENABLED=true
LIGHTRAG_BASE_URL=http://127.0.0.1:9621
LIGHTRAG_API_KEY=强随机字符串
OSS_ENDPOINT=oss-cn-hongkong.aliyuncs.com
OSS_PUBLIC_HOST=img.ysngj.cn
OSS_BUCKET=test-spiong
OSS_ACCESS_KEY_ID=你的AK
OSS_ACCESS_KEY_SECRET=你的SK
```

如果你在本地修改了 `backend/.env`，重新执行部署脚本即可自动同步到服务器。

如果已经在服务器上部署完成，只需重启后端：

```bash
cd /opt/agricloud/backend
pm2 restart agricloud-api --update-env
pm2 save
```

LightRAG 独立配置会由部署脚本渲染到 `/opt/agricloud/rag/.env`。它默认复用本地 `backend/.env` 里的 `DASHSCOPE_API_KEY`，文本模型使用 `qwen3.6-flash`，Embedding 使用 `text-embedding-v4`。

### 8. 验证 Nginx 与后端

```bash
nginx -t
systemctl status nginx --no-pager
pm2 status
curl http://127.0.0.1:3000/api/health
curl http://ysngj.cn/api/health
curl http://127.0.0.1:9621/health
curl http://ysngj.cn/api/market/kb/status
```

### 8.1 LightRAG 行情知识库重建

部署脚本会自动同步一次文档。需要手动重建时：

```bash
cd /opt/agricloud
node scripts/init-market-kb.js
set -a && . /opt/agricloud/backend/deploy/backend-lightrag.env && set +a
LIGHTRAG_BASE_URL=http://127.0.0.1:9621 node scripts/sync-lightrag-market.js --limit 120
pm2 restart agricloud-api --update-env
```

查看 LightRAG 日志：

```bash
pm2 logs agricloud-rag --lines 100
```

### 9. 配置 HTTPS

确认域名解析已经稳定后：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d ysngj.cn -d www.ysngj.cn
```

证书成功后验证：

```bash
curl -I https://ysngj.cn
curl -I https://www.ysngj.cn
curl https://ysngj.cn/api/health
```

### 10. OSS 侧检查

Bucket `test-spiong` 需要满足：

- Bucket 权限：公共读
- RAM 权限包含：
  - `oss:PutObject`
  - `oss:PutObjectAcl`
- CORS 允许来源：
  - `https://ysngj.cn`
  - `https://img.ysngj.cn`
  - 演示期如需 HTTP：
    - `http://ysngj.cn`
    - `http://img.ysngj.cn`

### 11. 演示验收

按这个顺序走一遍：

1. 打开 `https://ysngj.cn`
2. 登录演示账号
3. 添加作物
4. 上传图片到 OSS
5. 进行文本问诊
6. 进行图像问诊
7. 生成广告文案
8. 刷新页面确认历史仍在

## 常用运维命令

查看后端日志：

```bash
pm2 logs agricloud-api --lines 100
```

重启后端：

```bash
pm2 restart agricloud-api --update-env
```

重新部署：

```bash
cd "D:\qq\AgriCloudManager1.1 (1)\AgriCloudManager"
bash deploy/deploy.sh
```
