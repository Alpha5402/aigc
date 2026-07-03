# Render 免费版部署说明

这份说明用于把 AgriCloud 后端部署到 Render 免费 Web Service，拿到一个公网 HTTPS API 地址，供 H5 或 Android APK 调用。

## 1. 当前项目已准备好的内容

- `render.yaml`：Render Blueprint 配置。
- `backend/package.json`：后端运行依赖。
- `backend/package-lock.json`：Render 使用 `npm ci` 安装依赖。
- 后端入口：`backend/server.js`。
- 健康检查：`/api/health`。

Render 会在 `backend/` 目录执行：

```bash
npm ci
npm start
```

Render 使用 Node.js `24.15.0`，因为后端依赖 Node 内置的 `node:sqlite`。

## 2. 推送到 GitHub

Render 免费 Web Service 通常从 GitHub/GitLab 拉代码部署，所以需要先把当前项目推到一个 GitHub 仓库。

如果本地还没有远程仓库，先在 GitHub 创建一个仓库，然后在项目根目录执行：

```bash
git remote add origin https://github.com/你的用户名/你的仓库名.git
git add render.yaml backend/package.json backend/package-lock.json deploy/README-render.md
git commit -m "Add Render deployment config"
git push -u origin main
```

如果当前分支不是 `main`，把命令里的 `main` 换成你的实际分支名。

注意：不要提交 `backend/.env`，里面有密钥。

## 3. 在 Render 创建服务

推荐使用 Blueprint：

1. 打开 Render Dashboard。
2. 点击 `New`。
3. 选择 `Blueprint`。
4. 连接 GitHub 仓库。
5. 选择当前项目仓库。
6. Render 会读取根目录的 `render.yaml`。
7. 按页面提示填写 `sync: false` 的密钥环境变量。
8. 点击 `Apply` 或 `Deploy`。

如果不用 Blueprint，也可以手动创建 Web Service：

- Runtime：`Node`
- Root Directory：`backend`
- Build Command：`npm ci`
- Start Command：`npm start`
- Health Check Path：`/api/health`
- Plan：`Free`

## 4. 必填环境变量

Render 页面里需要手动填写这些密钥：

```env
JWT_SECRET=换成一串强随机字符串
VIVO_APP_ID=你的vivo应用ID
VIVO_APP_KEY=你的vivo应用Key
```

如果要启用图片上传到 OSS，再填写：

```env
OSS_ACCESS_KEY_ID=你的OSS AK
OSS_ACCESS_KEY_SECRET=你的OSS SK
```

如果暂时不演示图片上传，OSS 两项可以先留空。

## 5. 推荐环境变量

这些已经写进 `render.yaml`，一般不用手填：

```env
SQLITE_PATH=./data/agricloud.sqlite
DEMO_PHONE=13800138000
DEMO_PASSWORD=123456
AI_PROVIDER=vivo-xuanji
LIGHTRAG_ENABLED=false
SCHEDULER_ENABLED=false
```

说明：

- 免费版 Render 文件系统不是稳定持久化存储，SQLite 数据适合演示，不适合长期生产。
- `SCHEDULER_ENABLED=false` 是为了避免免费服务后台定时任务占用资源。
- `LIGHTRAG_ENABLED=false` 是为了先保证主后端能稳定跑起来。

## 6. 验证部署

部署成功后，Render 会给一个 HTTPS 域名，例如：

```text
https://agricloud-api.onrender.com
```

打开健康检查：

```text
https://agricloud-api.onrender.com/api/health
```

能看到返回结果后，API 基地址就是：

```text
https://agricloud-api.onrender.com/api
```

APK 或 H5 生产环境应配置：

```env
VITE_API_BASE_URL=https://agricloud-api.onrender.com/api
VITE_UPLOAD_URL=https://agricloud-api.onrender.com/api/oss/sign
```

## 7. 免费版限制

- 免费 Web Service 闲置一段时间会休眠，首次访问会慢一些。
- 免费服务的本地文件系统可能随重启、重新部署而丢失，所以 SQLite 数据和本地上传文件不能当长期生产数据。
- 正式上线建议迁移到有持久化磁盘/数据库的服务器，或改用 Postgres/Object Storage。

## 8. 常见问题

### 部署失败，提示找不到 sharp

确认 `backend/package.json` 里有：

```json
"sharp": "^0.34.5"
```

然后重新推送。

### APK 请求失败

确认 APK 使用的是 Render 的完整 HTTPS API 地址，而不是：

```text
/api
127.0.0.1
localhost
```

### AI 咨询失败

确认 Render 环境变量里已经填写：

```env
VIVO_APP_ID=...
VIVO_APP_KEY=...
```

修改环境变量后，在 Render Dashboard 里重新部署或重启服务。
