# AGENTS.md

## Project

This project is 云上农管家 / AgriCloudManager, a uni-app + Vue3 + SCSS smart agriculture app.

The app is primarily for mobile App usage, with H5 as a secondary platform.

## Global UI Redesign Rules

1. App端优先，H5端兼容。
2. 允许重构页面整体结构、信息层级、组件组织和交互方式。
3. 可以把普通列表、表格、表单重构成更有 App 质感的看板、卡片、工具流、底部抽屉或结果页。
4. 不允许删除、弱化或破坏原有应有的功能模块。
5. 不允许破坏原有接口、路由、Pinia/状态管理、权限判断和业务逻辑。
6. 不允许伪造关键业务数据。
7. 可以在农业主题范围内更炫酷一些，追求“眼前一亮”的视觉效果。
8. 严禁 AI 模板风、蓝紫霓虹、赛博网格、机器人、芯片、电路、AI 大脑、宇宙科技背景。
9. 严禁偏离智慧农业主题。
10. 严禁做成传统后台、土味农业网站、廉价促销页、通用 SaaS 工具、金融行情 App 或游戏化种田 App。
11. 可以使用网上公开资源提升质感，但必须许可清晰、本地化存储、压缩，并记录到 ASSET_CREDITS.md。
12. 不要生成图片，不要使用版权不明素材，不要热链远程图片。
13. 允许合理使用 canvas，但 canvas 只能用于局部视觉增强，不能替代表单、按钮、列表和正文内容。
14. canvas 必须有降级方案，不能遮挡点击、滚动、输入、上传、路由和底部导航。
15. 如果需要搜索代码，优先使用 rg / ripgrep；如果不可用，再用 PowerShell 或 Python fallback。
16. 不要直接长篇输出 prompt 原文，只需总结理解到的任务目标、修改范围和限制，然后执行。

## Prompt Files

The staged prompts are located at:

- docs/codex-prompts/00-visual-direction.md
- docs/codex-prompts/01-design-system-my-field.md
- docs/codex-prompts/02-full-ui-redesign.md

Read prompt files as UTF-8.

When using PowerShell, prefer:

Get-Content -LiteralPath "docs/codex-prompts/00-visual-direction.md" -Encoding UTF8 -Raw

Do not print the whole prompt file back to the terminal.