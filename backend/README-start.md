# AgriCloud 后端本地启动说明

这份说明用于本地演示、H5 联调、Android 真机或模拟器联调。正式服务器部署请看 `deploy/README-server.md`。

## 1. 环境要求

- Node.js 24 或更高版本
- npm
- 项目依赖已安装

检查版本：

```bash
node -v
npm -v
```

如果还没有安装依赖，在项目根目录执行：

```bash
npm install
```

## 2. 配置后端环境变量

后端会读取 `backend/.env`。如果没有这个文件，先复制示例：

```bash
cp backend/.env.example backend/.env
```

本地演示最少确认这些配置：

```env
PORT=3000
SQLITE_PATH=./data/agricloud.sqlite
JWT_SECRET=please-change-this-demo-secret
DEMO_PHONE=13800138000
DEMO_PASSWORD=123456
AI_PROVIDER=vivo-xuanji
VIVO_APP_ID=你的vivo应用ID
VIVO_APP_KEY=你的vivo应用Key
VIVO_ASR_ENGINE_ID=shortasrinput
VIVO_ASR_WS_URL=wss://api-ai.vivo.com.cn/asr/v2
```

说明：

- `PORT=3000` 表示后端启动在 `http://127.0.0.1:3000`。
- `DEMO_PHONE` / `DEMO_PASSWORD` 是演示账号。
- AI 咨询和 App 语音识别功能需要配置 `VIVO_APP_ID` 和 `VIVO_APP_KEY`；语音识别默认使用 vivo 实时短语音 `shortasrinput` 能力。
- `VIVO_ASR_ENGINE_ID` / `VIVO_ASR_WS_URL` 通常不用改，只有 vivo 控制台分配了不同能力 ID 或接口地址时才需要覆盖。
- OSS、天气、行情预测等能力如果不配置，相关功能可能降级或不可用，但基础登录、页面数据和本地演示可以先跑起来。

## 3. 启动后端

在项目根目录执行：

```bash
npm run start:api
```

看到类似输出即表示启动成功：

```text
AgriCloud API listening on http://127.0.0.1:3000
```

验证健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

## 4. H5 本地联调

H5 本地开发时，前端通常使用 `.env` 里的地址：

```env
VITE_API_BASE_URL=http://127.0.0.1:3000/api
VITE_UPLOAD_URL=http://127.0.0.1:3000/api/oss/sign
```

启动 H5：

```bash
npm run dev:h5
```

此时浏览器里的 `127.0.0.1` 指的是当前电脑，所以可以访问本机后端。

## 5. Android 模拟器联调

Android 模拟器里的 `127.0.0.1` 指的是模拟器自己，不是 Mac/Windows 主机。

Android 官方模拟器访问电脑主机要用：

```text
http://10.0.2.2:3000/api
```

所以模拟器版 App 应使用：

```env
VITE_API_BASE_URL=http://10.0.2.2:3000/api
VITE_UPLOAD_URL=http://10.0.2.2:3000/api/oss/sign
```

如果 App 报网络错误，先在模拟器浏览器里打开：

```text
http://10.0.2.2:3000/api/health
```

能看到健康检查结果，再安装 APK 演示。

## 6. Android 真机联调

真机里的 `127.0.0.1` 指的是手机自己，也不能访问电脑后端。

真机联调需要：

1. 手机和电脑连接同一个 Wi-Fi。
2. 查电脑局域网 IP，例如 `192.168.1.23`。
3. App API 地址改成：

```env
VITE_API_BASE_URL=http://192.168.1.23:3000/api
VITE_UPLOAD_URL=http://192.168.1.23:3000/api/oss/sign
```

4. 电脑防火墙允许手机访问 `3000` 端口。
5. 在手机浏览器访问：

```text
http://192.168.1.23:3000/api/health
```

能访问后，再安装真机调试 APK。

## 7. 正式 APK 注意事项

正式 APK 不应使用：

```text
127.0.0.1
localhost
10.0.2.2
192.168.x.x
```

正式版应该使用公网 HTTPS API，例如：

```text
https://api.example.com/api
```

要求：

- HTTPS 证书有效，Android 能信任。
- 证书域名和 API 域名一致。
- `/api/health`、`/api/auth/login`、`/api/ai/diagnose` 等接口不能跳转到别的网站。

如果 H5 能跑但 APK 报 `Expected URL scheme 'http' or 'https' but was 'file'`，通常是因为 APK 里还在使用 `/api` 这种相对路径。App 端必须使用完整的 `http://` 或 `https://` 地址。

## 8. 常用排查

### 端口是否启动

```bash
curl http://127.0.0.1:3000/api/health
```

### 登录账号

默认演示账号来自 `backend/.env`：

```env
DEMO_PHONE=13800138000
DEMO_PASSWORD=123456
```

### App 访问失败

按运行环境检查 API 地址：

- H5 本机：`http://127.0.0.1:3000/api`
- Android 模拟器：`http://10.0.2.2:3000/api`
- Android 真机：`http://电脑局域网IP:3000/api`
- 正式 APK：`https://公网API域名/api`

### AI 咨询失败

检查 `backend/.env`：

```env
AI_PROVIDER=vivo-xuanji
VIVO_APP_ID=你的vivo应用ID
VIVO_APP_KEY=你的vivo应用Key
```

修改 `.env` 后需要重启后端。
