# Android APK 打包清单

项目使用 uni-app Vue 3。`npm run build:app` 只生成 `dist/build/app` 原生资源，
最终 APK 需要通过 HBuilderX 云打包或配置 Android 离线打包环境。

## 已完成的工程配置

- 正式 APP 构建使用公网 HTTPS 地址，不再写死开发机局域网地址。
- 已启用 Camera、Geolocation、Speech 模块。
- Android 权限已精简为网络、相机、麦克风和定位。
- 定位使用系统 WGS-84 坐标，并在客户端转换为 GCJ-02，不依赖高德定位 SDK。
- App 端图片压缩无法读取 Base64 时会使用 `uni.uploadFile` 文件直传。

## 打包前必须由项目负责人完成

### 1. 修复公网服务

以下地址必须在普通手机网络中正常返回可信 HTTPS 响应：

```text
https://ysngj.cn/
https://ysngj.cn/api/health
```

证书必须包含 `ysngj.cn`，Nginx 的 `/api/` 必须代理到 Node.js 后端。
修复后再执行：

```powershell
npm run build:app
```

### 2. 申请百度语音识别参数

在百度智能云语音技术控制台创建应用，取得：

- App ID
- API Key
- Secret Key

不要将密钥提交到 Git。使用 HBuilderX 打开 `src/manifest.json` 的可视化界面：

1. App 模块配置 -> Speech（语音输入）。
2. 勾选百度语音识别。
3. 填入 App ID、API Key、Secret Key。
4. 保存后制作自定义调试基座。

### 3. 配置 Android 包名和签名

建议包名：

```text
com.agricloud.manager
```

在 HBuilderX 的“发行 -> 原生 App-云打包”中配置正式包名和签名证书。
签名文件、别名和密码必须离线备份；后续升级必须继续使用同一证书。

### 4. 制作并使用自定义基座

1. 发行 -> 原生 App-云打包 -> 制作自定义调试基座。
2. Android 包含 Speech、Camera、Geolocation。
3. 删除 vivo 手机上的旧标准基座。
4. 运行 -> 运行到手机或模拟器 -> 勾选“使用自定义基座”。
5. 在 vivo 手机上允许麦克风、相机和位置权限。

### 5. 正式验收

至少完整验证：

1. 注册和登录。
2. 新增作物。
3. 获取当前位置。
4. 相机拍照、相册选图和 OSS 上传。
5. 图片 AI 问诊。
6. 语音输入并回填文字。
7. 行情图表和价格预测。
8. 销路匹配。
9. AI 营销文案。
10. 退出后重新进入，确认登录状态和数据仍存在。

正式 APK 不包含 Node.js 后端、模型服务和 RAG 服务，这些服务必须保持公网在线。
