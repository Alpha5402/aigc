# Implementation Plan — market-price-forecast (Phase 1: Data + Algorithm)

## Overview

> 关联文档：`.kiro/specs/market-price-forecast/requirements.md` 与 `.kiro/specs/market-price-forecast/design.md`

本任务清单只覆盖 **Phase 1：数据层 + 算法层 + 最小可演示通路**，目标是把"价格预测"从前端 `Math.random` 替换为：

1. 真实公开数据采集落库
2. Node.js Forecast_Engine 编排 + 与独立 Python Model_Service 的 HMAC 通信
3. 4 个家族（ARIMA / Holt-Winters / Prophet / LSTM）跑通最小推理
4. e2e 烟囱测试一次性串通 seed → 采集 → 预测 → forecast_runs 落库

前端 UI 改造、LLM 报告、价格预警、Admin Console、影子模式、回测自动停用、合规删除、数据归档等均归后续阶段，见文末"下一阶段任务清单（占位）"。

## Milestones

- **M1 数据层完成**：SQLite schema 已迁移、master_data seed 完成、Collector 能从 mock Public_Data_Source 采到 price_history、http-fetch 工具与熔断器有单测覆盖
- **M2 Fallback_Engine 跑通**：纯 Node.js 的 MA/SES/HW + 残差 CI 通过 PBT，可独立产出 7d/30d 预测
- **M3 Model_Service 单 SPU 推理跑通**：Python FastAPI 服务在本地起来，4 个家族 ARIMA/HW/Prophet/LSTM 均能完成单 SPU 7d/30d 推理，HMAC 中间件通过单测
- **M4 e2e 烟囱通过**：`npm run e2e:forecast` 一次性串通 seed → mock 采集 → mock Model_Service → forecast_runs 落库 → 取最新 active 读出来

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "description": "无前置依赖：数据库 schema、纯工具库、Python 仓库骨架。这一波都可以并行起步。",
      "tasks": [
        "1.1.1", "1.1.2",
        "1.3.1",
        "1.4.1",
        "2.1.1", "2.1.2",
        "2.2.1", "2.2.2",
        "2.3.1", "2.3.2",
        "3.1.1", "3.1.2",
        "4.2.1",
        "6.1.1"
      ]
    },
    {
      "wave": 2,
      "description": "依赖 wave 1：seed 主数据、robots/熔断、各源 extractor、Python schemas/main、scheduler-lock。",
      "tasks": [
        "1.2.1", "1.2.2",
        "1.3.2", "1.3.3",
        "1.4.2", "1.4.3", "1.4.4", "1.4.5",
        "1.8.5",
        "2.4.1", "2.4.2",
        "3.2.1", "3.2.2",
        "3.4.1",
        "4.1.1", "4.1.2",
        "6.1.2"
      ]
    },
    {
      "wave": 3,
      "description": "依赖 wave 2：master-alias、Python HMAC 中间件与各家族适配器。",
      "tasks": [
        "1.5.1",
        "1.8.4",
        "3.3.1", "3.3.2",
        "3.4.2", "3.4.3", "3.4.4", "3.4.5"
      ]
    },
    {
      "wave": 4,
      "description": "依赖 wave 3：Collector 编排、forecast-engine、Python /forecast 与 LRU、模型适配器单测。",
      "tasks": [
        "1.6.1",
        "2.5.1",
        "3.4.6",
        "3.5.1", "3.5.2",
        "3.6.1", "3.6.2"
      ]
    },
    {
      "wave": 5,
      "description": "依赖 wave 4：数据层与算法层的所有细粒度测试、历史回填脚本、Python 集成测试、cron 任务、mock servers。",
      "tasks": [
        "1.7.1", "1.7.2",
        "1.8.1", "1.8.2", "1.8.3", "1.8.6",
        "2.5.2", "2.5.3", "2.5.4", "2.5.5",
        "3.7.1",
        "4.2.2", "4.2.3",
        "5.1.1", "5.1.2",
        "6.2.1", "6.2.2"
      ]
    },
    {
      "wave": 6,
      "description": "依赖 wave 5：e2e 脚本、e2e 跑通、Migration runbook（终点波次）。",
      "tasks": [
        "5.2.1", "5.2.2",
        "5.3.1",
        "6.3.1"
      ]
    }
  ],
  "milestones": {
    "M1": {
      "description": "数据层完成：schema 已迁移、master_data seed 完成、Collector 能从 mock PDS 采到 price_history",
      "completes_after_wave": 5,
      "validating_tasks": ["1.1.2", "1.8.1", "1.8.2", "1.8.3", "1.8.6"]
    },
    "M2": {
      "description": "Fallback_Engine 跑通：纯 Node.js MA/SES/HW + 残差 CI 通过 PBT",
      "completes_after_wave": 5,
      "validating_tasks": ["2.3.2", "2.5.5"]
    },
    "M3": {
      "description": "Model_Service 单 SPU 推理跑通：FastAPI 服务可起，4 家族均能完成 7d/30d 推理",
      "completes_after_wave": 5,
      "validating_tasks": ["3.3.2", "3.4.6", "3.7.1"]
    },
    "M4": {
      "description": "e2e 烟囱通过：seed → 采集 → 预测 → forecast_runs 落库 → 读路径返回",
      "completes_after_wave": 6,
      "validating_tasks": ["5.3.1"]
    }
  }
}
```

并行机会简述：

- Wave 1 内所有任务都没有前置，纯工具库（http-fetch、signer、validators、fallback-engine）与 Python 仓库骨架可并行起步
- Wave 4 的 1.6（Collector）、2.5（forecast-engine）、3.5（Python /forecast）三大主干可由 3 个并行小组同步推进
- 关键路径：1.1.1 → 1.6.1 → 2.5.1 → 5.2.1 → 5.3.1（数据 → Engine → e2e）

## Tasks

---

## 1. 数据层（Data Layer）

### 1.1 SQLite schema 迁移（含钩子）

- [ ] 1.1.1 在 `backend/lib/db.js` 中新增 `initForecastDb()` 函数并由 `initDb()` 末尾调用
  - 新建表（按 design §3 schema）：
    - 主数据：`origins`、`varieties`、`variety_aliases`、`grades`、`units`、`spu_tuples`
    - 价格与采集：`price_history`、`collection_logs`、`robots_cache`、`source_circuit_breaker`
    - 预测：`forecast_runs`、`forecast_run_models`
    - 调度辅助：`scheduler_locks`
  - **本阶段不建** 但写好建表 SQL 注释占位（hooks）：`backtest_results`、`model_registry`、`alert_rules`、`alert_silences`、`audit_logs`、`cold_start_jobs`
  - 在 `market_items` 上 `ALTER TABLE ADD COLUMN spu_id TEXT REFERENCES spu_tuples(spu_id)` + `CREATE INDEX idx_market_items_spu`
  - 全部 SQL 用 `CREATE TABLE IF NOT EXISTS` 与 `ensureColumn` 实现幂等
  - **路径**：`backend/lib/db.js`
  - **Validates**：Requirement 1.4, 2.1, 2.2, 4.1
  - **工时**：1d
  - **Prerequisite**：无

- [ ] 1.1.2 编写 schema 单元测试
  - 启动后建表无错误、`PRAGMA table_info` 字段名与 design 一致、CHECK 约束有效（写入非法 status 应抛错）
  - **路径**：`backend/test/forecast/db-schema.test.js`
  - **Validates**：Requirement 1.4, 2.1, 4.1
  - **工时**：0.5d
  - **Prerequisite**：1.1.1

### 1.2 Seed master_data 脚本

- [ ] 1.2.1 新建 `backend/scripts/seed-master-data.js`
  - 写入 origins（首批 3 条：370613 山东烟台栖霞、410882 河南灵宝、150400 内蒙古赤峰）
  - 写入 varieties（apple-red-fuji、soybean-yellow、corn-yellow） + 别名（moa/agri-cn/mofcom/pfsc 各源对应别名 ≥1 条）
  - 写入 grades（fruit-grade-1、grain-grade-standard）
  - 写入 units（CNY/kg、CNY/jin）
  - 写入 spu_tuples 3 条（design §4.5）：分配 KSUID 作为 spu_id
  - 把现有 `market_items` 中名为"苹果"/"大豆"/"玉米"的 3 行 `spu_id` 回填到 seed 出的 SPU
  - 幂等：检查存在则跳过
  - **Validates**：Requirement 2.1, 2.2, 2.3
  - **工时**：0.5d
  - **Prerequisite**：1.1.1

- [ ] 1.2.2 在 `package.json`（root）增加脚本 `"market:seed": "node backend/scripts/seed-master-data.js"`
  - **工时**：0.1d
  - **Prerequisite**：1.2.1

### 1.3 http-fetch.js（robots / 限流 / UA / 编码）

- [ ] 1.3.1 新建 `backend/lib/http-fetch.js`
  - 从 `backend/lib/market-rag.js` 抽出：`fetchHtml`、`sleepPolitely`、`stripTags`、`decodeBuffer`、`detectEncoding`、`decodeHtmlEntities`、`normalizeText`
  - 新增 `fetchWithBudget(url, { timeoutMs, headers })`，强制 `User-Agent` 含项目标识与联系邮箱（design §15.6）
  - 新增 `sleepPolitely` 强制下限 ≥ 2000ms（Requirement 1.3）
  - 单请求 30000ms 超时（Requirement 1.11）
  - 域名级并发上限 1（per-host Promise queue）
  - **路径**：`backend/lib/http-fetch.js`
  - **保留**：`backend/lib/market-rag.js` 内仍可继续 import 同名函数，但实现迁移到 http-fetch
  - **Validates**：Requirement 1.3, 1.11, 12.1
  - **Properties**：23
  - **工时**：1d
  - **Prerequisite**：无

- [ ] 1.3.2 新建 `backend/lib/robots-cache.js`
  - `isAllowed(host, path, ua)` → `{ allowed, reason }`
  - 24 小时缓存（写入 `robots_cache` 表）
  - robots.txt 5000ms 超时（Requirement 1.10）
  - 引入 `robots-parser` npm 依赖（< 50KB，符合 Fallback 1MB 限制以外的范围；明确写入 backend/package.json dependencies）
  - **Validates**：Requirement 1.2, 1.10
  - **工时**：0.5d
  - **Prerequisite**：1.1.1, 1.3.1

- [ ] 1.3.3 新建 `backend/lib/source-circuit-breaker.js`
  - `record(sourceName, outcome: 'success' | 'failure', timestampMs)`
  - `isPaused(sourceName)` → bool
  - 24 小时滚动窗口连续 3 次 failure → `paused_until = now + 1h`（Requirement 1.9）
  - 状态持久化到 `source_circuit_breaker` 表
  - **Validates**：Requirement 1.9
  - **Properties**：6
  - **工时**：0.5d
  - **Prerequisite**：1.1.1

### 1.4 price-extractor 系列

- [ ] 1.4.1 新建 `backend/lib/price-extractors/index.js` 注册中心
  - 暴露 `getExtractor(sourceName)` 选择器
  - 统一接口：`extract(html, spu, sourceUrl)` → `{ price: number, observed_date: string, raw_text: string } | null`
  - **工时**：0.3d
  - **Prerequisite**：1.1.1

- [ ] 1.4.2 新建 `backend/lib/price-extractors/extractor.moa.js`
  - 从农业农村部周报/月报中正则匹配品种 + ±100 字符窗口内的价格段落
  - 解析 `数值 + 元/(公斤|斤)`，归一化到 元/公斤
  - 提取发布日期（先 H1/title，再正文）
  - **Validates**：Requirement 1.4
  - **工时**：1d
  - **Prerequisite**：1.4.1

- [ ] 1.4.3 新建 `backend/lib/price-extractors/extractor.pfsc.js`
  - 从全国农产品批发市场价格信息系统的日度表格提取（DOM 表格行）
  - **工时**：1d
  - **Prerequisite**：1.4.1

- [ ] 1.4.4 新建 `backend/lib/price-extractors/extractor.mofcom.js`
  - 商务部商务预报周度指数与文章价格抽取
  - **工时**：1d
  - **Prerequisite**：1.4.1

- [ ] 1.4.5 新建 `backend/lib/price-extractors/extractor.agri-cn.js`
  - 中国农业农村信息网月度评论文章价格抽取（最难，价格散落正文）
  - **工时**：1.5d
  - **Prerequisite**：1.4.1

### 1.5 master-alias.js 别名归一化

- [ ] 1.5.1 新建 `backend/lib/master-alias.js`
  - `resolveSpuFromExternalRecord({ sourceName, externalVariety, externalGrade?, externalOriginText? })` → `spu_id | null`
  - 步骤：variety 别名查表 → grade 默认"统货" → origin 文本匹配 origins.display_name → unit 默认 CNY/kg → 反查 spu_tuples（status='active'）
  - 找不到时返回 null（让调用方写 `collection_logs.reason='unknown_alias'`）
  - **Validates**：Requirement 2.1
  - **工时**：1d
  - **Prerequisite**：1.1.1, 1.2.1

### 1.6 price-collector.js 采集编排 + 熔断器

- [ ] 1.6.1 新建 `backend/lib/price-collector.js`
  - 入口 `collectDaily({ requestId, manual = false, spuIds? })`
  - 流程：取 active SPU → 对每个 SPU 选 source list → 对每条 (spu, source) 走 robots → fetch → extractor → 校验价格 → 入 price_history（按来源优先级合并）→ 写 collection_logs
  - 价格合法性：非数值 / ≤0 / >1_000_000 全部拒绝（Requirement 1.6）
  - 单 SPU 失败不阻塞其他 SPU（Requirement 1.8）
  - 熔断器集成：调用 1.3.3 的 `isPaused`
  - 礼貌限流：调用 1.3.1 的 `sleepPolitely`（≥2000ms）
  - 缺失日：写入 `price_history(price=NULL, missing_reason='collection_failed')`（Requirement 8.5）
  - 来源优先级合并：实现 `mergePrice(existing, candidate)`，保留原审计字段（Requirement 1.5）
  - **Validates**：Requirement 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
  - **Properties**：2, 3, 4, 5
  - **工时**：2d
  - **Prerequisite**：1.3.1, 1.3.2, 1.3.3, 1.4.*, 1.5.1

### 1.7 历史价格回填脚本

- [ ] 1.7.1 新建 `backend/scripts/backfill-price-history.js`
  - 命令行参数：`--days=365`（默认 365）`--spu-ids=...`（可选）
  - 走与 collectDaily 相同的提取链路，但目标 URL 来自 `market-rag.js` 中的 `TARGETED_ARTICLE_SOURCES` 与 `SEED_SOURCES` 历史快照
  - 跑完打印汇总：成功/失败/跳过/熔断各源数量
  - **Validates**：Requirement 1.4
  - **工时**：1d
  - **Prerequisite**：1.6.1

- [ ] 1.7.2 在 root `package.json` 增加 `"market:backfill": "node backend/scripts/backfill-price-history.js"`
  - **工时**：0.1d
  - **Prerequisite**：1.7.1

### 1.8 数据层单元测试 + PBT

- [ ] 1.8.1 单测：`backend/test/forecast/price-validate.test.js`
  - 覆盖价格合法性：非数值 / 负数 / 0 / >1e6 / 极端字符串均被拒绝
  - **Validates**：Requirement 1.6
  - **Properties**：4
  - **工时**：0.3d
  - **Prerequisite**：1.6.1

- [ ] 1.8.2 单测：`backend/test/forecast/merge-price.test.js`
  - 覆盖来源优先级合并：高优替换低优；同优先级保留原；保留 existing.collected_at / source_url 审计
  - **Validates**：Requirement 1.5
  - **Properties**：3
  - **工时**：0.5d
  - **Prerequisite**：1.6.1

- [ ] 1.8.3 PBT：`backend/test/forecast/circuit-breaker.test.js`（fast-check ≥200 iter）
  - 随机生成 (timestamp, outcome) 序列，断言 24h 内连续 3 失败后 1 小时 paused
  - **Validates**：Requirement 1.9
  - **Properties**：6
  - **工时**：0.5d
  - **Prerequisite**：1.3.3

- [ ] 1.8.4 单测：`backend/test/forecast/master-alias.test.js`
  - 给 (sourceName, externalVariety, externalOrigin) → 返回正确 spu_id 或 null
  - **Validates**：Requirement 2.1
  - **工时**：0.5d
  - **Prerequisite**：1.5.1

- [ ] 1.8.5 单测：`backend/test/forecast/http-fetch.test.js`
  - User-Agent 正则匹配 `^[A-Za-z0-9\-./]{1,64}\s+\(\+contact:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\)$`
  - sleepPolitely 间隔 ≥2000ms（取 50 次中位数）
  - **Validates**：Requirement 1.3, 12.1
  - **Properties**：23
  - **工时**：0.3d
  - **Prerequisite**：1.3.1

- [ ] 1.8.6 集成测试：`backend/test/forecast/collector-batch.test.js`
  - 用 mock Public_Data_Source（in-process http server 返回固定 HTML），验证：5 个 SPU 中 1 个故障，其他 4 个仍成功；故障 SPU 在 `collection_logs` 有一条
  - **Validates**：Requirement 1.8
  - **Properties**：5
  - **工时**：0.5d
  - **Prerequisite**：1.6.1

**M1 Milestone 验收**：以上全部 1.x 任务完成，`npm run market:seed` 与 `npm run market:backfill` 可在干净的 SQLite 上跑通；`node --test backend/test/forecast/*.test.js` 全部通过。

---

## 2. 算法层 — Node.js（Forecast_Engine 编排）

### 2.1 forecast-signer.js（HMAC + nonce + timestamp）

- [ ] 2.1.1 新建 `backend/lib/forecast-signer.js`
  - 函数 `sign(method, path, body, nonce, ts)` → 64 字符十六进制 HMAC-SHA256
  - 函数 `verify(headers, body, expectedSecret)` → bool；同时校验 timestamp 偏差 ≤300_000ms 与 nonce 不重放
  - 函数 `generateNonce()` 返回 16 字节随机十六进制
  - nonce 缓存：内存 LRU（5 分钟 TTL，本阶段不接 Redis）
  - **路径**：`backend/lib/forecast-signer.js`
  - **Validates**：Requirement 3.1
  - **Properties**：20
  - **工时**：0.5d
  - **Prerequisite**：无

- [ ] 2.1.2 单测：`backend/test/forecast/signer.test.js`（PBT ≥200 iter）
  - 同密钥同输入恒等；任一字段改变 verify 失败；同 nonce 二次失败；timestamp 偏差超 5 分钟失败
  - **Properties**：20
  - **工时**：0.3d
  - **Prerequisite**：2.1.1

### 2.2 forecast-validators.js（单调性 + 0 截断）

- [ ] 2.2.1 新建 `backend/lib/forecast-validators.js`
  - `validateAndClip({ point, ci80Lower, ci80Upper, ci95Lower, ci95Upper })` → `{ ok, clipped, point, ci80Lower, ci80Upper, ci95Lower, ci95Upper, status: 'active'|'clipped'|'degraded' }`
  - `validateForecastRequest(req)` → `{ ok, errors: string[] }`：字段类型 / horizon ∈ {7,30} / families 长度 1-13 / history 长度 1-1825
  - **Validates**：Requirement 3.2, 4.3, 4.4, 4.5, 4.6
  - **Properties**：10, 12
  - **工时**：0.5d
  - **Prerequisite**：无

- [ ] 2.2.2 PBT：`backend/test/forecast/validate-and-clip.test.js`（fast-check ≥200 iter）
  - Property 10：单调性 + 0 截断；任意 active/clipped 输出严格单调；clipped 时 point/CI 下界为 0、上界保留
  - Property 12：null 不被替代
  - **Properties**：10, 12
  - **工时**：0.5d
  - **Prerequisite**：2.2.1

### 2.3 fallback-engine.js（纯 Node.js MA / SES / HW）

- [ ] 2.3.1 新建 `backend/lib/fallback-engine.js`
  - `movingAverage(series, window)`
  - `simpleExponentialSmoothing(series, alpha)` + 自动搜索 α ∈ {0.1, 0.3, 0.5} 最小 MSE
  - `holtWinters(series, alpha, beta, gamma, seasonLen=7)`：加性季节
  - `residualBasedCI(point, residualStd, level)`：z=1.282/1.96
  - 入口 `fallbackForecast({ history, horizonDays, missingMask })` → `{ point, ci80Lower, ci80Upper, ci95Lower, ci95Upper, family }`：按 historyLen 自动选算法（design §9.2）
  - **限制**：不引入超过 1MB 安装体积的新 npm 依赖（Requirement 8.3）
  - **Validates**：Requirement 8.3, 8.4
  - **工时**：2d
  - **Prerequisite**：无

- [ ] 2.3.2 PBT + 收敛性测试：`backend/test/forecast/fallback-engine.test.js`
  - 在合成正弦 + 趋势 + 噪声序列上跑 HW，断言 RMSE < baseline（baseline = naive 平推）
  - SES α 自动搜索后 MSE 单调下降
  - **工时**：1d
  - **Prerequisite**：2.3.1

### 2.4 borrowed-history.js（同品种跨产地借数）

- [ ] 2.4.1 新建 `backend/lib/borrowed-history.js`
  - `tryBorrowedHistory(spu_id)` → `{ values: number[], originIds: string[] } | null`
  - 取同品种、不同产地的近 30 天 active SPU；按日期对齐 → 取均值
  - **Validates**：Requirement 8.8
  - **工时**：0.5d
  - **Prerequisite**：1.1.1, 1.2.1

- [ ] 2.4.2 单测：`backend/test/forecast/borrowed-history.test.js`
  - **工时**：0.3d
  - **Prerequisite**：2.4.1

### 2.5 forecast-engine.js（编排 + 状态机 + 融合）

- [ ] 2.5.1 新建 `backend/lib/forecast-engine.js`
  - `selectFamilies(historyLen, registry)` 实现分档（design §7.3）
  - `callModelService(req)` HTTP 调用 + 30s 超时 + HMAC 签名
  - `fuseForecasts(perModel, backtests)` MAPE 倒数加权（**本阶段缺 backtest_results，先用统一权重 1/N**，留 TODO 钩子等回测表上线后切换）
  - `forecastOne({ spuId, horizonDays })`：
    1. 取 history（90 天历史 + missing_mask + forward_fill）
    2. cold_start 判定（< 14 天 → 走 fallback 直接出 cold_start）
    3. selectFamilies → callModelService
    4. 失败/超时 → fallback-engine（status=degraded）
    5. 成功 → fuse → validateAndClip → 写 forecast_runs + forecast_run_models
    6. 同 (spu_id, origin_date, horizon) 旧 active 改 superseded
  - `forecastDailyAll(horizons=[7, 30])`：遍历所有 active SPU
  - **Validates**：Requirement 3.5, 3.6, 3.8, 3.10, 3.11, 4.1, 4.7, 8.2, 8.3
  - **Properties**：8, 9, 10, 11, 13
  - **工时**：3d
  - **Prerequisite**：2.1.1, 2.2.1, 2.3.1, 2.4.1, 1.1.1

- [ ] 2.5.2 单测：`backend/test/forecast/select-families.test.js`（PBT ≥200 iter）
  - historyLen ∈ [0, 1825] 随机化，断言分档逻辑（Property 8）
  - **Properties**：8
  - **工时**：0.3d
  - **Prerequisite**：2.5.1

- [ ] 2.5.3 单测：`backend/test/forecast/fuse-weights.test.js`（PBT ≥100 iter）
  - 给定一组 MAPE，断言 Σwᵢ=1（容差 1e-9），mᵢ<mⱼ ↔ wᵢ>wⱼ
  - **Properties**：9
  - **工时**：0.3d
  - **Prerequisite**：2.5.1

- [ ] 2.5.4 单测：`backend/test/forecast/forecast-runs-active.test.js`
  - 同 (spu_id, origin_date, horizon) 多次写入：仅 1 个 active；最新 active = 最大 generated_at 且非 degraded
  - **Properties**：11
  - **工时**：0.5d
  - **Prerequisite**：2.5.1

- [ ] 2.5.5 集成测试：`backend/test/forecast/engine-degrade.test.js`
  - 启动 mock Model_Service：返回 5xx → 断言 status=degraded
  - 启动 mock Model_Service：30s 超时（用 sleep）→ 断言 status=degraded
  - 启动 mock Model_Service：返回 NaN → 断言 status=degraded（单调性失败路径）
  - **Validates**：Requirement 3.8, 4.4
  - **Properties**：10
  - **工时**：0.5d
  - **Prerequisite**：2.5.1

**M2 Milestone 验收**：fallback-engine 可独立产出 7d/30d 预测且 PBT 通过；forecast-engine 在 mock Model_Service 下能完成完整状态机流转。

---

## 3. 算法层 — Python Model_Service（独立 GPU 服务）

### 3.1 仓库结构与依赖

- [ ] 3.1.1 在 repo 根目录新建 `model-service/` 目录
  - 目录结构：

    ```
    model-service/
      pyproject.toml          # 依赖声明
      README.md
      Dockerfile              # 可选，本阶段建好骨架但不必构建
      src/
        agricloud_forecast/
          __init__.py
          config.py           # 环境变量加载
          main.py             # FastAPI 入口
          schemas.py          # Pydantic 模型
          security.py         # HMAC 中间件
          registry.py         # 模型 registry 抽象
          cache.py            # LRU 缓存
          adapters/
            __init__.py
            base.py           # ModelAdapter 抽象基类
            arima.py
            holt_winters.py
            prophet_adapter.py
            lstm.py
          routes/
            forecast.py
            health.py
        tests/
          test_signature.py
          test_arima.py
          test_lstm.py
          test_routes.py
    ```

  - `pyproject.toml` 依赖：`fastapi>=0.115`、`uvicorn[standard]>=0.30`、`pydantic>=2.7`、`statsmodels>=0.14`、`prophet>=1.1`、`torch>=2.4`、`numpy>=1.26`、`pandas>=2.2`、`python-dotenv>=1.0`、`pytest>=8`、`hypothesis>=6`
  - **工时**：0.5d
  - **Prerequisite**：无

- [ ] 3.1.2 编写 `model-service/README.md`
  - 启动方法：`uvicorn agricloud_forecast.main:app --host 127.0.0.1 --port 8000`
  - 环境变量列表
  - 与 Node.js backend 的对接说明（HMAC 共享密钥）
  - **工时**：0.3d
  - **Prerequisite**：3.1.1

### 3.2 FastAPI 骨架 + Pydantic schema

- [ ] 3.2.1 实现 `src/agricloud_forecast/schemas.py`
  - Pydantic v2 模型：`ForecastRequest`、`ForecastResponse`、`ModelOutput`、`HistoryPayload`、`HealthResponse`
  - 字段约束：`horizon_days ∈ {7, 30}`、`families` 长度 1-13、`history.values` 长度 1-1825、`request_id` 长度 16-64
  - **Validates**：Requirement 3.2, 3.4
  - **工时**：0.5d
  - **Prerequisite**：3.1.1

- [ ] 3.2.2 实现 `src/agricloud_forecast/main.py`
  - 创建 FastAPI app
  - 注册中间件（HMAC）
  - 注册路由（/forecast、/forecast/batch、/health）
  - 启动事件：预热 production 模型（本阶段 placeholder）
  - **工时**：0.5d
  - **Prerequisite**：3.2.1

### 3.3 HMAC 中间件

- [ ] 3.3.1 实现 `src/agricloud_forecast/security.py`
  - `verify_signature(request)` 中间件：
    1. 校验 `X-Forecast-Signature`、`X-Forecast-Nonce`、`X-Forecast-Timestamp` 三个 header 存在
    2. 计算 expected = HMAC-SHA256(secret, method + '\n' + path + '\n' + sha256(body) + '\n' + nonce + '\n' + ts)
    3. 比较 sig（hmac.compare_digest）
    4. timestamp 偏差 > 5 分钟拒绝
    5. nonce 5 分钟内重复拒绝（in-memory dict + TTL）
  - 失败统一返回 401 + `{"error": "invalid_signature"|"expired"|"replay"}`
  - **Validates**：Requirement 3.1
  - **Properties**：20
  - **工时**：0.5d
  - **Prerequisite**：3.2.2

- [ ] 3.3.2 单测：`tests/test_signature.py`（hypothesis ≥100 iter）
  - 与 Node.js 端 forecast-signer 的签名互通：编写一段 fixture（用 Python 端 secret 计算的 hash）作为契约测试
  - **Properties**：20
  - **工时**：0.3d
  - **Prerequisite**：3.3.1

### 3.4 模型适配层

- [ ] 3.4.1 实现 `adapters/base.py`：`ModelAdapter` 抽象基类
  - 接口：`fit(series, missing_mask) -> None`、`predict(horizon) -> ModelOutput`、`family: str`、`version: str`
  - **工时**：0.3d
  - **Prerequisite**：3.2.1

- [ ] 3.4.2 实现 `adapters/arima.py`
  - 用 statsmodels SARIMAX；自动搜索 (p, d, q) ∈ ([0,1,2], [0,1], [0,1,2])（小网格）
  - 置信区间：用 `get_forecast(horizon).conf_int(alpha=0.20 / 0.05)` 取 80% / 95%
  - **工时**：1d
  - **Prerequisite**：3.4.1

- [ ] 3.4.3 实现 `adapters/holt_winters.py`
  - 用 statsmodels ExponentialSmoothing（加性、季节长度 7）
  - 置信区间：基于残差标准差 + z 分数（与 Fallback_Engine 同思路，保持一致）
  - **工时**：0.5d
  - **Prerequisite**：3.4.1

- [ ] 3.4.4 实现 `adapters/prophet_adapter.py`
  - 用 prophet 包；启用默认季节性
  - 置信区间：`yhat_lower` / `yhat_upper`（Prophet 默认 80%）+ 取 95% 用 `interval_width=0.95` 重跑或基于 sigma 推算
  - **工时**：1d
  - **Prerequisite**：3.4.1

- [ ] 3.4.5 实现 `adapters/lstm.py`
  - PyTorch 自实现：`nn.LSTM(input=1, hidden=64, layers=2)` + `nn.Linear(64, horizon)`
  - 训练：单 SPU 内训（CPU 也能跑通；GPU available 时用 cuda）
  - 输入：标准化后的滑窗（窗口长 28）
  - 输出：horizon 长度直接预测；CI 用蒙特卡洛 dropout（30 次采样取 10/90 与 2.5/97.5 分位）
  - **本阶段**：跑通即可，CPU 训练单 SPU < 30s
  - **工时**：2d
  - **Prerequisite**：3.4.1

- [ ] 3.4.6 单测：`tests/test_arima.py`、`tests/test_lstm.py`
  - 给一段已知合成序列，断言模型能跑通且输出形状正确（horizon 长度 + CI 顺序：95L ≤ 80L ≤ point ≤ 80U ≤ 95U）
  - **工时**：0.5d
  - **Prerequisite**：3.4.2, 3.4.5

### 3.5 /forecast 与 /forecast/batch 接口

- [ ] 3.5.1 实现 `routes/forecast.py`
  - `POST /forecast`：
    1. 经 HMAC 中间件
    2. 解析 ForecastRequest
    3. 对每个 family 调对应 adapter 的 fit + predict
    4. 收集每个家族的输出 + 推理耗时 + status
    5. 单家族失败：在该家族 entry 上标 `status='failed' + error_message`，**不**让整请求失败
    6. 返回 ForecastResponse（含 total_inference_ms）
  - `POST /forecast/batch`：批量版本（max 50 个 SPU/批）；内部循环调单 SPU 接口
  - **Validates**：Requirement 3.1, 3.2, 3.3, 3.4, 3.7
  - **工时**：1d
  - **Prerequisite**：3.4.*

- [ ] 3.5.2 实现 `routes/health.py`
  - `GET /health` 不需 HMAC（仅内网）
  - 返回：`{"status": "ok", "loaded_families": [...], "memory_mb": ..., "gpu_available": bool}`
  - **工时**：0.3d
  - **Prerequisite**：3.2.2

### 3.6 LRU 缓存 + 并发限制

- [ ] 3.6.1 实现 `cache.py`
  - `LRUCache(capacity=1000)`：key=(family, version, spu_id) → fitted_model
  - 进入 `/forecast` 时先查缓存；miss 则 fit 并写入
  - **工时**：0.5d
  - **Prerequisite**：3.4.1

- [ ] 3.6.2 在 `main.py` 中加全局推理信号量
  - `INFERENCE_SEM = asyncio.Semaphore(int(os.getenv("MODEL_INFERENCE_CONCURRENCY", "4")))`
  - 在 /forecast 处理前 `async with INFERENCE_SEM:`
  - **工时**：0.3d
  - **Prerequisite**：3.5.1

### 3.7 Python 端集成测试

- [ ] 3.7.1 实现 `tests/test_routes.py`
  - 用 FastAPI TestClient + 已知签名 fixture 调 /forecast，断言响应结构（含 4 个家族中至少 2 个 success）
  - 调 /forecast 不带签名 → 401
  - 调 /forecast/batch（10 个 SPU）→ 全部完成 < 60s
  - **工时**：1d
  - **Prerequisite**：3.5.1, 3.3.1

**M3 Milestone 验收**：在 GPU/CPU 任一环境下 `uvicorn agricloud_forecast.main:app --port 8000` 起服务，curl 一次签名请求能拿到 4 个家族的预测结果。

---

## 4. 调度与编排（Scheduler）

### 4.1 scheduler-lock.js

- [ ] 4.1.1 新建 `backend/lib/scheduler-lock.js`
  - `acquireLock(taskName, ttlSeconds)` → bool（design §14.2）
  - 用 `scheduler_locks` 表 + UNIQUE 约束 + TTL 比较实现分布式锁
  - `releaseLock(taskName)` 主动释放
  - **工时**：0.5d
  - **Prerequisite**：1.1.1

- [ ] 4.1.2 单测：`backend/test/forecast/scheduler-lock.test.js`
  - **工时**：0.3d
  - **Prerequisite**：4.1.1

### 4.2 引入 node-cron

- [ ] 4.2.1 在 `backend/package.json` 增加 `node-cron` 依赖（< 50KB）
  - **工时**：0.1d
  - **Prerequisite**：无

- [ ] 4.2.2 新建 `backend/lib/scheduler.js`
  - `bootstrap()` 在 server.js 启动时调用一次
  - 注册以下两条 cron（本阶段仅这两条）：
    - `0 3 * * *` Asia/Shanghai → 调 `priceCollector.collectDaily(...)`
    - `0 4 * * *` Asia/Shanghai → 调 `forecastEngine.forecastDailyAll([7, 30])`
  - 每条 cron 入口先 `acquireLock(taskName, ttl)`，失败直接返回
  - **预留** 钩子：`enableTask(name)` 接口允许后续阶段加新 cron
  - **Validates**：Requirement 1.8, 3.10
  - **工时**：1d
  - **Prerequisite**：4.1.1, 1.6.1, 2.5.1

- [ ] 4.2.3 在 `backend/server.js` 启动末尾调用 `scheduler.bootstrap()`
  - 添加环境变量 `SCHEDULER_ENABLED`（默认 'true'，便于测试关闭）
  - **工时**：0.2d
  - **Prerequisite**：4.2.2

---

## 5. 集成与 e2e

### 5.1 mock Public_Data_Source 与 mock Model_Service

- [ ] 5.1.1 新建 `backend/test/forecast/mock-pds-server.js`
  - 用 `node:http.createServer` 起 HTTP server，监听随机端口
  - 暴露固定 HTML 路径：每个 source（moa/pfsc/mofcom/agri-cn）一个固定 fixture（按品种返回不同价格）
  - 暴露 robots.txt：默认全允许
  - **工时**：0.5d
  - **Prerequisite**：1.6.1

- [ ] 5.1.2 新建 `backend/test/forecast/mock-model-service.js`
  - 用 `node:http.createServer` 起 HTTP server
  - 校验 HMAC 签名；返回固定的 ForecastResponse（4 个家族，单调有效）
  - 支持环境变量 `MOCK_MS_MODE` ∈ `'ok' | 'timeout' | '5xx' | 'invalid_monotonic'`
  - **工时**：0.5d
  - **Prerequisite**：2.5.1

### 5.2 e2e:forecast 脚本

- [ ] 5.2.1 新建 `backend/scripts/e2e-forecast.js`
  - 流程：
    1. 启动 in-memory SQLite（`new DatabaseSync(':memory:')`） + 跑 initDb + initForecastDb
    2. 启动 mock-pds-server（5.1.1） + mock-model-service（5.1.2）
    3. 设置环境变量指向 mock：`MODEL_SERVICE_BASE_URL`、`PUBLIC_DATA_SOURCE_OVERRIDES`
    4. 调 seed-master-data（3 个 SPU）
    5. 调 priceCollector.collectDaily：断言每个 SPU 在 price_history 各有 1 行
    6. 调 forecastEngine.forecastDailyAll([7, 30])：断言每个 SPU × horizon 各有 1 行 forecast_runs status='active'
    7. 调 `getForecast(spu_id, 7)`（直接函数调用，不走 HTTP）：断言响应结构合规
    8. 关掉所有 mock server
  - 脚本结束时 process.exit(0/1)
  - **工时**：1.5d
  - **Prerequisite**：5.1.1, 5.1.2, 1.2.1, 1.6.1, 2.5.1

- [ ] 5.2.2 root `package.json` 增加 `"e2e:forecast": "node backend/scripts/e2e-forecast.js"`
  - **工时**：0.1d
  - **Prerequisite**：5.2.1

### 5.3 跑通验证

- [ ] 5.3.1 在 CI / 本地跑 `npm run e2e:forecast`
  - 必须 0 错误 0 异常退出
  - **Validates**：M4 milestone
  - **工时**：0.5d
  - **Prerequisite**：5.2.2

**M4 Milestone 验收**：`npm run e2e:forecast` 一次性串通 seed → mock 采集 → mock Model_Service → forecast_runs 落库 → 取最新 active 读出来。

---

## 6. 配置与文档

### 6.1 .env.example 增加项

- [ ] 6.1.1 在 `backend/.env.example` 末尾追加：

  ```
  # === market-price-forecast ===
  MODEL_SERVICE_BASE_URL=http://127.0.0.1:8000
  MODEL_SERVICE_SHARED_SECRET=
  MODEL_SERVICE_TIMEOUT_MS=30000
  MODEL_SERVICE_CONCURRENCY=8
  FORECAST_CONTACT_EMAIL=ops@ysngj.cn
  SCHEDULER_ENABLED=true
  FORECAST_FEATURE_SPUS=
  ```

  - **工时**：0.1d
  - **Prerequisite**：无

- [ ] 6.1.2 在 `model-service/.env.example` 新建：

  ```
  FORECAST_SHARED_SECRET=
  FORECAST_NONCE_TTL_SECONDS=300
  MODEL_INFERENCE_CONCURRENCY=4
  MODEL_ARTIFACT_DIR=/var/agricloud/models
  ```

  - **工时**：0.1d
  - **Prerequisite**：3.1.1

### 6.2 部署文档

- [ ] 6.2.1 新建 `model-service/README.md`（同 3.1.2，二者合并即可）
  - 启动方法、依赖安装、环境变量、健康检查、与 backend 联调步骤

- [ ] 6.2.2 在 `deploy/README-server.md` 末尾追加 "Model_Service 部署说明" 章节
  - 跨机部署：内网域名解析、HMAC 共享密钥分发、systemd unit 模板
  - **工时**：0.3d
  - **Prerequisite**：3.1.2

### 6.3 Migration runbook

- [ ] 6.3.1 新建 `.kiro/specs/market-price-forecast/runbooks/migration.md`
  - 上线步骤：拉代码 → npm install → 跑 initDb → npm run market:seed → 启动 backend → 启动 model-service → npm run market:backfill --days=90 → 触发一次手动 collectDaily → 触发一次 forecastDailyAll → 验证 forecast_runs 落库
  - 回滚步骤：禁用 SCHEDULER_ENABLED → 删除新建表 → 删除 market_items.spu_id 列（实际操作建议 sqlite_master 检查后再执行）
  - **工时**：0.5d
  - **Prerequisite**：所有上述任务完成

---

## 工时汇总

| 模块 | 工时 |
|---|---|
| 1. 数据层 | ≈ 14.4d |
| 2. 算法层 - Node.js | ≈ 9.6d |
| 3. 算法层 - Python Model_Service | ≈ 8.4d |
| 4. 调度与编排 | ≈ 2.1d |
| 5. 集成与 e2e | ≈ 3.1d |
| 6. 配置与文档 | ≈ 1.1d |
| **总计** | **≈ 38.7d**（单人估算；2 人并行约 22-25d） |

---

## 下一阶段任务清单（占位，本阶段不做）

以下条目在数据层 + 算法层稳定运行 1-2 周后启动后续 spec 迭代：

### Phase 2 — LLM 报告 + 预警
- Explanation_Service 五段式报告生成（Requirement 5）
- 报告写入前幻觉校验（Property 14, 15）
- DashScope 并发限流 + FIFO 队列（Property 16）
- Alert_Service 规则评估流水线（Requirement 7）
- alert_rules / alert_silences 用户接口（Requirement 7）
- 与 notifications 表 type=price_alert 联动

### Phase 3 — 前端 UI
- pages/market/index.vue 删除 generatePriceData / generateComparisonData / createVirtualCrop
- PriceChart.vue 增强：历史实线 + 预测虚线 + 80%/95% 双 CI 色带 + 分隔线 + tooltip
- SpuPicker 三级联动组件
- Horizon 切换控件 + 降级提示条
- 阈值与静默设置页
- 通知点击跳转报告锚点
- 静态扫描禁止 Math.random（Property 6.2 SMOKE）

### Phase 4 — 运营与治理
- 完整 Admin Console（master 数据 CRUD UI、collection_logs 视图、回测查询）
- Admin Dashboard 首页指标
- model_registry CRUD + 状态切换 UI（Requirement 10）
- 影子模式 / canary 灰度比例配置（Property 18）
- 回测周度任务 + auto-disabled / 自动恢复（Property 19）
- 手动采集 60s 限流（Requirement 11.6）
- 操作审计日志（Requirement 11.7）

### Phase 5 — 合规与可靠性
- 用户主动删除接口（Requirement 12.7）
- 敏感字段脱敏 lib/log-sanitizer.js（Property 21）
- price_history 24 个月归档脚本（Requirement 12.8）
- robots.txt 24h 缓存运营失效入口
- 来源 inactive 立即停采流程（Requirement 12.5）

### Phase 6 — 性能与扩展
- borrowed_history 真实启用（Requirement 8.8）
- 冷启动队列 cold_start_jobs + 5 分钟内补采任务（Requirement 8.1）
- 主动刷新 60s 内 ≤5 次限流（Requirement 8.9）
- SQLite → PostgreSQL 迁移调研（Open Question 3）
- 训练 pipeline（Open Question 1）
- Model_Service mTLS（Open Question 4）
- 模型权重 OSS 备份

## Notes

### 范围与决策

- 本 Phase 1 不引入：DashScope 报告、Alert_Service、前端 UI、Admin Console、影子模式、回测自动停用、用户删除接口、合规审计、归档脚本
- 但保留所有钩子：表结构注释占位、forecast-engine 中 fuse 权重的 TODO（等 backtest_results 上线切换）、scheduler 的 enableTask 钩子
- Fallback_Engine 不引入超过 1MB 的 npm 依赖（Requirement 8.3）
- robots-parser（< 50KB）和 node-cron（< 50KB）的引入不受 Fallback_Engine 限制约束（限制对象仅是 Fallback_Engine 自身）

### 测试策略落地

- 单元测试 + PBT 用 Node.js 内置 `node:test` + `fast-check`，无新依赖
- Python 端用 `pytest` + `hypothesis`
- 集成测试用 in-process mock server（不依赖外部网络）
- e2e 用 in-memory SQLite 跑全流程
- 关键 Property（10 单调性、20 HMAC、6 熔断器）配置 ≥ 200 iter

### 工时与排期

- 单人 ≈ 38.7d，2 人并行 ≈ 22-25d
- 并行边界见上方 Task Dependency Graph
- 关键路径：1.1 → 1.6 → 2.5 → 5.2 → 5.3（数据 → Engine → e2e）

### 跨服务联调注意

- HMAC 共享密钥需要在 backend 与 Model_Service 两侧 .env 同步配置
- Model_Service 默认监听 `127.0.0.1:8000`，生产时改内网域名
- Node.js 与 Python 端的 HMAC 算法要严格一致（method 大写、path 不含 query、body 用 SHA256 hex 摘要、分隔符 `\n`）—— 任务 3.3.2 中的契约测试要覆盖这一点

### 验收顺序

- M1 通过后再启动 M2 / M3（M2 与 M3 可并行）
- M4 是上线前的最后一道闸；M4 之后还需运营至少 1 周稳定，再启动 Phase 2

---

> 本任务清单只覆盖 Phase 1。任何 Phase 1 范围以外的实现请新建 spec 或扩充本 spec 后再做。
