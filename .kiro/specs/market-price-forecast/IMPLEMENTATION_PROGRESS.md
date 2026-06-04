# 云上农管家 - 价格预测系统实施进度 (Implementation Progress)

> 记录基于 \`professional-design-report.md\` 的落地情况。

## 已完成阶段 (Completed)

### Phase 1: 基础设施打通 (P0)
- [x] **数据模型**：设计并创建了基于 SPU 粒度的 \`spu_tuples\`、\`origins\`、\`varieties\` 等核心底层结构。
- [x] **预测引擎 (Node.js)**：实现了 \`forecast-engine.js\` 和 \`fallback-engine.js\`。
- [x] **API 对接**：在 \`server.js\` 暴露了 \`GET /api/market/forecast/:spu_id\`。
- [x] **前端去 Mock**：修改了 \`src/api/agri.ts\` 和 \`src/pages/market/index.vue\`，将前端图表真实挂载到后端的预测引擎，彻底移除了 \`Math.random\` 假数据。

### Phase 2: 数据底座建设 (P1)
- [x] **爬虫搭建**：完成了 \`model-service/data/scripts/crawl_pfsc.py\`，可抓取全国农产品批发市场每日价格公开 API，并输出 CSV。
- [x] **数据清洗流 (ETL)**：编写了 Node.js 脚本 \`backend/scripts/import-pfsc.js\`，支持将 CSV 映射为标准 SPU，完成合并更新并落库至 \`price_history\`。
- [x] **跑批预测引擎**：通过 \`backend/scripts/run-forecast.js\` 实现了触发 \`forecastDailyAll\` 跑批流程。

## 正在进行 / 下一阶段 (Next Steps)

### Phase 3: 深度学习模型上线 (P1)
- [ ] 启动 Python FastAPI \`Model_Service\`（或将其接入到现有的 Node 体系中）。
- [ ] 实现 LSTM/Prophet 适配器。
- [ ] 测试 Node.js 后端与 Python 服务的 HMAC 鉴权与降级策略。

### Phase 4: 业务闭环与大模型分析 (P2)
- [ ] 上线前端置信区间图表（当前 \`PriceChart.vue\` 已支持数据结构，需要确保数据喂入准确）。
- [ ] 集成 RAG 报告生成机制，实现完整的产品形态。
