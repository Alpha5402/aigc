# Requirements Document

## Introduction

农产品价格预测功能（market-price-forecast）为 AgriCloudManager（云上农管家）新增基于真实历史价格数据的多模型时间序列预测能力。该功能从公开来源（中国农业农村信息网、农业农村部市场监测、商务部商务预报、全国农产品批发市场价格信息系统等）采集历史价格，按"产地·品种·规格·单位"四元组建立日频时间序列，调用独立部署的 GPU 模型服务运行经典统计、机器学习与深度学习模型集成，输出含点估计、置信区间与模型来源标识的 7 天与 30 天预测，并通过 LLM 生成自然语言解读、驱动价格预警、替换前端 `pages/market/index.vue` 中基于 `Math.random` 的 mock 折线。

价值主张：

- 用真实采集数据与可解释的模型预测取代客户端 mock，让农户决策可信
- 与现有 RAG 知识库（`market_documents` / `market_chunks`）和 DashScope 报告联动，把数值预测翻译成行情语言
- 用预测结果驱动 `notifications` 表中的价格预警，替换现有 mock 预警
- 遵循"离线优先 + 优雅降级"哲学：GPU 服务不可用回落统计方法，统计方法不可用回落 RAG 定性报告

与既有功能的关系：

- 复用 `market_items` 主表作为关注品种入口，但 `market_items.prediction` TEXT 字段不再由人工/mock 填写，而是由 LLM 报告快照填入
- 复用 `market_documents` / `market_chunks` / `market_chunks_fts` RAG 检索作为可解释性报告的证据来源
- 复用现有 `/api/market/*` 命名空间，新增 `/api/market/forecast/*` 与 `/api/market/admin/*` 子路由
- 复用 `notifications` 表与现有通知中心 UI 作为预警出口

## Glossary

- **Forecast_System**：本规格描述的农产品价格预测整体系统，包含数据采集、模型推理、预警与报告流程
- **Collector**：负责从公开来源抓取并清洗历史与日度行情数据的子模块
- **Public_Data_Source**：公开行情数据来源，限定为中国农业农村信息网、农业农村部市场监测、商务部商务预报、全国农产品批发市场价格信息系统等不收费来源
- **Master_Data_Service**：管理产地、品种、规格、单位主数据与白名单的子模块
- **Model_Service**：独立部署在 GPU 服务器上的 Python 推理与训练服务，对外暴露 HTTP REST 接口
- **Forecast_Engine**：Node.js backend 中的预测调度与编排子模块，负责调用 Model_Service、降级与结果落库
- **Fallback_Engine**：Node.js backend 中的轻量统计预测降级模块，运行移动平均、指数平滑、Holt-Winters 等无 GPU 依赖算法
- **Explanation_Service**：调用 DashScope（通义千问）等 LLM 并结合 RAG 检索生成自然语言解读的子模块
- **Alert_Service**：基于预测结果生成价格预警并写入 `notifications` 表的子模块
- **Frontend_Chart**：前端 `pages/market/index.vue` 与 `components/PriceChart.vue` 中展示历史段、预测段、置信区间的可视化组件
- **Admin_Console**：运营管理员使用的品种/产地/规格白名单与采集状态管理界面
- **Scheduler**：定时调度器，触发采集、训练、推理、回测任务
- **SPU_Tuple**：(产地, 品种, 规格, 单位) 四元组，是 Forecast_System 中预测对象的最小单位
- **产地（Origin）**：行政区划层级到县/市级的产地标识，例如"山东烟台栖霞"
- **品种（Variety）**：作物品种标识，例如"红富士苹果"
- **规格（Grade）**：商品规格标识，例如"一级 80mm 以上"
- **单位（Unit）**：计量与计价单位，例如"元/公斤"
- **Price_History**：以日为粒度、按 SPU_Tuple 索引的历史成交价时间序列
- **点估计（Point_Estimate）**：模型对未来某一日的单点预测价格
- **置信区间（Confidence_Interval）**：以 80% 与 95% 两档分位数表示的预测不确定性区间
- **Forecast_Horizon**：预测时长，本规格限定为 7 天（短期）与 30 天（中期）两档
- **Forecast_Run**：一次完整的预测产出记录，包含 SPU_Tuple、预测起算日、Forecast_Horizon、模型集合、点估计、置信区间、生成时间
- **MAPE**：平均绝对百分比误差（Mean Absolute Percentage Error），回测核心指标
- **RMSE**：均方根误差（Root Mean Squared Error），回测辅助指标
- **方向准确率（Directional_Accuracy）**：预测涨跌方向与真实涨跌方向一致的样本占比
- **回测（Backtest）**：在历史数据上以滚动窗口方式重放预测流程并计算误差指标的过程
- **影子模式（Shadow_Mode）**：新模型与生产模型并行运行但不对外输出的灰度阶段
- **冷启动（Cold_Start）**：用户首次关注一个 SPU_Tuple 且 Price_History 不足以训练完整模型的状态
- **关注（Watch）**：用户在 `market_items` 中将某个 SPU_Tuple 加入个人关注列表的动作
- **运营管理员（Operator）**：拥有管理后台访问权限的内部角色
- **农户用户（Farmer_User）**：使用前端应用查看价格、关注品种、接收预警的最终用户

## Requirements

### Requirement 1: 公开数据采集与历史价格存储

**User Story:** 作为 Forecast_System，我需要从公开来源采集真实历史价格并按 SPU_Tuple 持久化，以便预测模型有可信的训练数据。

#### Acceptance Criteria

1. THE Collector SHALL 仅从 Public_Data_Source 采集价格数据，且配置文件中列出的源站 URL SHALL 仅包含中国农业农村信息网、农业农村部市场监测、商务部商务预报、全国农产品批发市场价格信息系统四类来源
2. WHEN Collector 向任一 Public_Data_Source 发起请求，THE Collector SHALL 在发起请求前读取并遵守该来源的 robots.txt 中针对目标路径的访问声明
3. WHEN Collector 连续向同一 Public_Data_Source 主机发起请求，THE Collector SHALL 在相邻两次请求之间保持不少于 2000 毫秒的间隔
4. WHEN Collector 成功解析一条原始价格记录，THE Collector SHALL 在 `price_history` 表中写入一行包含 SPU_Tuple、采集日期、成交价、来源标识、来源 URL、采集时间戳的记录
5. IF 同一 SPU_Tuple 在同一采集日期已存在记录，THEN THE Collector SHALL 以来源优先级（农业农村部 > 全国批发市场 > 商务部商务预报 > 中国农业农村信息网）合并并更新该记录，且 SHALL 保留该记录原有的来源标识、来源 URL 与采集时间戳等审计字段
6. IF Collector 解析得到的成交价为非数值、小于等于 0 元/公斤、或大于 1000000 元/公斤，THEN THE Collector SHALL 拒绝写入 `price_history` 并在 `collection_logs` 表中记录拒绝原因、原始来源 URL 与原始价格文本
7. THE Forecast_System SHALL 不得在 `price_history` 表中写入任何由模型生成、人工估算或随机生成的虚拟价格
8. WHEN Scheduler 触发日度采集任务，THE Collector SHALL 为 Master_Data_Service 中所有处于 active 状态的 SPU_Tuple 各执行一次采集尝试，且任一 SPU_Tuple 的采集异常 SHALL 不中断对其余 SPU_Tuple 的采集
9. IF 任一 Public_Data_Source 在 24 小时窗口内连续 3 次返回 5xx 或网络超时，THEN THE Collector SHALL 暂停对该来源的访问 1 小时并在 `collection_logs` 中记录熔断事件、来源标识与触发时间
10. IF 某 Public_Data_Source 的 robots.txt 对目标路径声明 Disallow，或 robots.txt 在 5000 毫秒内未返回响应，THEN THE Collector SHALL 放弃该次请求并在 `collection_logs` 表中记录跳过原因、来源标识与目标 URL
11. WHEN Collector 向任一 Public_Data_Source 发起单次 HTTP 请求，THE Collector SHALL 在 30000 毫秒内未收到完整响应时中止该请求并将本次结果计为网络超时

### Requirement 2: 产地·品种·规格主数据管理

**User Story:** 作为 Operator，我需要维护产地、品种、规格、单位的白名单与映射关系，以便采集与预测有统一的 SPU_Tuple 标识。

#### Acceptance Criteria

1. THE Master_Data_Service SHALL 在 `origins`、`varieties`、`grades`、`units`、`spu_tuples` 五张表中分别管理产地、品种、规格、单位与四元组组合，且每张表的每条记录 SHALL 具有取值为 active 或 inactive 的 status 字段，新建记录的默认 status 为 active
2. WHEN Operator 通过 Admin_Console 创建一条 SPU_Tuple 记录，THE Master_Data_Service SHALL 为该记录分配一个在 `spu_tuples` 表中全局唯一且创建后不可修改的 `spu_id`
3. WHEN Operator 通过 Admin_Console 新增一个 SPU_Tuple，THE Master_Data_Service SHALL 校验产地、品种、规格、单位四个外键字段均已在各自主数据表中存在且 status 为 active；IF 任一字段不存在或 status 非 active，THEN THE Master_Data_Service SHALL 拒绝写入并返回错误信息，错误信息中 SHALL 指明未通过校验的字段名称
4. IF Operator 提交的 SPU_Tuple 与已存在的任意 SPU_Tuple（无论 status 为 active 或 inactive）在产地、品种、规格、单位四字段上完全一致，THEN THE Master_Data_Service SHALL 拒绝写入并返回冲突错误，错误信息中 SHALL 包含已存在记录的 `spu_id` 与其当前 status
5. WHEN Operator 在 Admin_Console 将一个 SPU_Tuple 的 status 切换为 inactive，THE Master_Data_Service SHALL 在状态变更事务提交完成后阻止 Scheduler 对该 SPU_Tuple 触发任何新的采集任务与预测任务
6. WHILE 一个 SPU_Tuple 的 status 为 inactive，THE Master_Data_Service SHALL 保留其关联的 Price_History 与 Forecast_Run 历史记录，且 SHALL 不删除、不修改、不覆盖这些历史记录
7. THE Forecast_System SHALL 在所有数据库表、API 路径与 API 响应字段中以 `spu_id` 作为 SPU_Tuple 的唯一关联键，且 SHALL 在每个返回 SPU 信息的 API 响应及前端展示中同时提供产地、品种、规格、单位四字段的可读名称
8. WHEN Farmer_User 通过前端关注一个 status 为 active 的 SPU_Tuple，THE Master_Data_Service SHALL 在 `market_items` 表中创建一条以该 SPU_Tuple 的 `spu_id` 作为外键的关注记录
9. IF Operator 尝试删除一条 origins、varieties、grades 或 units 记录，或将其 status 切换为 inactive，且存在至少一条 status 为 active 的 SPU_Tuple 引用该记录，THEN THE Master_Data_Service SHALL 拒绝该操作并返回错误信息，错误信息中 SHALL 包含引用方 SPU_Tuple 的 `spu_id` 列表

### Requirement 3: 多模型预测引擎与独立模型服务对接

**User Story:** 作为 Forecast_System，我需要调用独立部署的 GPU Model_Service 运行多种算法并自动选择，以便每个 SPU_Tuple 获得最适合其数据特征的预测。

#### Acceptance Criteria

1. THE Forecast_Engine SHALL 通过 HTTP REST 协议调用 Model_Service，且请求与响应 SHALL 使用 JSON 编码；连接建立超时 SHALL 不超过 5 秒，单次请求体大小 SHALL 不超过 50 MB
2. THE Forecast_Engine SHALL 在请求中提供 `spu_id`、Price_History 时间序列（长度 1 到 1825 个数据点）、Forecast_Horizon（取值 1 到 90 天）、请求的模型族列表（长度 1 到 13 个）、回调地址五项字段
3. THE Model_Service SHALL 至少支持以下模型族之一并在响应中标识所用模型：移动平均、指数平滑、Holt-Winters、ARIMA/SARIMA、Prophet、XGBoost、随机森林、LSTM、GRU、Transformer、TimeMixer、N-BEATS、DLinear
4. WHEN Forecast_Engine 提交一次预测请求，THE Model_Service SHALL 在响应中返回长度等于 Forecast_Horizon 的点估计序列、80% 置信区间、95% 置信区间、所选模型标识、模型版本号、推理耗时（单位毫秒）
5. IF 一个 SPU_Tuple 的 Price_History 长度小于 60 天，THEN THE Forecast_Engine SHALL 请求 Model_Service 仅使用统计模型族（移动平均、指数平滑、Holt-Winters、ARIMA/SARIMA）
6. IF 一个 SPU_Tuple 的 Price_History 长度大于等于 365 天，THEN THE Forecast_Engine SHALL 请求 Model_Service 同时运行至少一种深度学习模型族与一种统计模型族
7. WHEN Model_Service 返回多个模型的预测结果，THE Forecast_Engine SHALL 在 `forecast_runs` 表中保存每个模型的独立结果以及融合后的最终结果
8. IF Model_Service 在 30 秒内未返回响应或返回 5xx 状态码，THEN THE Forecast_Engine SHALL 将该次请求标记为 `degraded`，对外响应使用最近一次成功的 Forecast_Run，并在响应中携带降级状态指示
9. THE Forecast_Engine SHALL 在每次预测请求与响应中记录长度为 16 到 64 字符的 `request_id`，并在 `forecast_runs` 表中以 `request_id` 关联 Model_Service 端的训练或推理日志
10. WHEN Scheduler 触发日度预测任务，THE Forecast_Engine SHALL 在单次调度批次内为 Master_Data_Service 中所有 active SPU_Tuple 同时生成 7 天与 30 天两档 Forecast_Horizon 的 Forecast_Run
11. WHERE 一个 SPU_Tuple 的 Price_History 长度处于 60 至 364 天之间，THE Forecast_Engine SHALL 请求 Model_Service 同时运行至少两种统计模型族，并基于最近 90 天的回测 MAPE 倒数归一化为权重进行结果融合
12. IF 预测请求的字段缺失、字段值越界或 JSON 解析失败，THEN THE Forecast_Engine SHALL 拒绝该请求、不调用 Model_Service，并在响应中返回失败状态和具体校验错误指示

### Requirement 4: 预测产出结构与置信度

**User Story:** 作为 Farmer_User，我需要看到带置信区间和模型来源的预测结果，以便理解预测不确定性而非把预测当作确定值。

#### Acceptance Criteria

1. THE Forecast_System SHALL 在 `forecast_runs` 表中为每次 Forecast_Run 保存以下字段：`spu_id`、预测起算日（以 Asia/Shanghai 时区当日 0 点为基准的日期）、Forecast_Horizon（取值仅限 7 或 30，单位为天）、模型族列表（非空字符串数组）、点估计逐日序列、80% 置信区间逐日上下界序列、95% 置信区间逐日上下界序列、生成时间（UTC 时间戳，毫秒精度）、`request_id`、状态字段（取值仅限 `active`、`superseded`、`degraded`、`cold_start`、`clipped`、`qualitative-only` 之一）
2. THE Forecast_System SHALL 在 `/api/market/forecast/:spu_id` 响应中包含以下六类字段：历史段（最近 90 个自然日的逐日实际价）、预测段（长度等于 Forecast_Horizon 的逐日点估计序列）、80% 置信区间逐日上下界、95% 置信区间逐日上下界、模型族标识列表、生成时间，且所有价格字段单位统一为人民币元/公斤并保留 2 位小数
3. WHEN Forecast_Engine 写入一条 Forecast_Run，THE Forecast_Engine SHALL 对预测段每一日校验 95% 置信区间下界 ≤ 80% 置信区间下界 ≤ 点估计 ≤ 80% 置信区间上界 ≤ 95% 置信区间上界
4. IF 单调性校验未通过（任一日不满足上述大小关系），THEN THE Forecast_Engine SHALL 拒绝将该 Forecast_Run 标记为 `active`，将其状态置为 `degraded`，并保留原始数值用于回测但不对外输出
5. IF 某一日点估计或任一置信区间界值小于 0 元/公斤，THEN THE Forecast_Engine SHALL 将该值截断为 0（即所有低于 0 的数值整体裁到 0），并将该 Forecast_Run 的状态字段标记为 `clipped`
6. WHERE 未来某一日因数据缺失或模型不收敛而不可预测，THE Forecast_System SHALL 在该日点估计与所有置信区间界值字段返回显式 null，且 SHALL 不使用 0 或前一日值替代
7. THE Forecast_System SHALL 为同一 SPU_Tuple 在同一预测起算日同一 Forecast_Horizon 仅将 `generated_at` 最大且状态不为 `degraded` 的一条 Forecast_Run 作为对外输出（状态置为 `active`），其余同键 Forecast_Run 状态置为 `superseded` 并保留所有历史版本用于回测
8. THE Forecast_System SHALL 不得对外暴露模型族列表为空或缺失的预测结果，对此类记录 API SHALL 返回错误响应指示预测尚不可用

### Requirement 5: LLM 可解释性报告

**User Story:** 作为 Farmer_User，我需要把预测数值翻译成包含原因分析的自然语言报告，以便理解"为什么会涨跌"。

#### Acceptance Criteria

1. WHEN Forecast_Engine 完成一次 Forecast_Run，THE Explanation_Service SHALL 在 30 秒内基于该 Forecast_Run 的点估计、置信区间、模型族标识与 RAG 检索到的近 14 天内不超过 10 条 `market_chunks` 生成一段自然语言报告
2. THE Explanation_Service SHALL 通过 DashScope（通义千问）API 生成报告，单次请求 token 预算上限 SHALL 不超过 8000，DashScope 调用超时 SHALL 不超过 25 秒
3. THE Explanation_Service SHALL 在生成的报告中按"行情概况、影响因素、未来预期、销售建议、风险提示"五段式结构组织内容，正文长度 SHALL 在 300 至 800 个汉字之间，且 SHALL 包含点估计与 80% 置信区间数值以及不少于 2 条引用的 `market_documents` 来源链接
4. WHEN Explanation_Service 准备将报告写入数据库，THE Explanation_Service SHALL 先校验报告中出现的具体价格数值与来源链接均能在该 Forecast_Run 的 Price_History、点估计、置信区间或所引用的 `market_chunks` 中匹配；IF 校验失败，THEN THE Explanation_Service SHALL 丢弃该报告并改用 RAG 模板降级路径
5. WHEN 报告生成与校验通过，THE Explanation_Service SHALL 将完整报告文本写入对应 Forecast_Run 的 `explanation` 字段，并将不超过 80 个汉字的摘要写入对应 `market_items.prediction` 字段
6. IF Explanation_Service 调用 DashScope 失败、超时或校验失败触发降级，THEN THE Explanation_Service SHALL 改用 RAG 模板拼装一段不含 LLM 加工的纯证据列表报告并标注 `template-fallback`
7. WHEN Farmer_User 请求 `/api/market/forecast/:spu_id/report`，THE Explanation_Service SHALL 返回该 SPU_Tuple 最新一次 Forecast_Run 对应的报告
8. IF 请求 `/api/market/forecast/:spu_id/report` 时该 SPU_Tuple 不存在最新 Forecast_Run 或对应 `explanation` 字段为空，THEN THE Explanation_Service SHALL 返回明确指示报告尚未生成的错误响应而 SHALL 不返回空字符串或占位文本
9. WHILE 同一 Forecast_Run 已经存在一次正在进行中的报告生成任务，THE Explanation_Service SHALL 合并新到达的同 Forecast_Run 报告请求至该进行中的任务而 SHALL 不并发发起多次 DashScope 调用
10. WHILE 当前 Explanation_Service 进程对 DashScope 的并发调用数已达到 5，THE Explanation_Service SHALL 将后续报告生成请求按 FIFO 顺序排队等待

### Requirement 6: 前端价格走势可视化

**User Story:** 作为 Farmer_User，我需要在行情页看到一条同时包含历史段、预测段与置信区间的折线图，以便直观判断未来走势。

#### Acceptance Criteria

1. THE Frontend_Chart SHALL 在 `pages/market/index.vue` 中调用 `/api/market/forecast/:spu_id` 的真实数据渲染折线图，且 SHALL 在请求未完成时显示骨架屏占位
2. THE Frontend_Chart SHALL 不得使用 `Math.random` 或任何客户端伪随机生成函数构造价格数据点、置信区间边界值或预测起算分隔日期
3. THE Frontend_Chart SHALL 以实线渲染历史段、以虚线渲染预测段、以不透明度介于 0.1 至 0.3 之间的色带渲染 80% 与 95% 置信区间，且 80% 与 95% 色带在色觉缺陷模拟下 SHALL 仍可视觉区分
4. THE Frontend_Chart SHALL 在折线图上以与坐标轴及背景色不同的颜色标注预测起算日的分隔线
5. THE Frontend_Chart SHALL 提供 7 天与 30 天两档 Forecast_Horizon 切换控件，且默认选中 7 天
6. WHEN Farmer_User 切换 Forecast_Horizon 控件，THE Frontend_Chart SHALL 在 500 毫秒内更新折线、置信区间色带与预测起算分隔线，且 SHALL 不触发整页重新加载
7. THE Frontend_Chart SHALL 在图例或卡片上展示当前预测使用的模型族标识与精度到分钟的生成时间
8. WHERE `/api/market/forecast/:spu_id` 返回状态为 `degraded`，THE Frontend_Chart SHALL 在折线图上方展示包含降级原因说明的提示文案，且 SHALL 不阻塞主图渲染
9. IF `/api/market/forecast/:spu_id` 请求失败或返回非 2xx 状态码，THEN THE Frontend_Chart SHALL 显示错误提示文案与重试入口，而 SHALL 不渲染任何价格折线
10. WHERE `/api/market/forecast/:spu_id` 返回的历史段或预测段为空，THE Frontend_Chart SHALL 在该段位置显示对应的空数据态文案
11. WHEN Farmer_User 在折线图任一数据点位置触发 hover 或 tap，THE Frontend_Chart SHALL 在 200 毫秒内显示包含日期、价格、段类型（历史 / 预测）、80% 与 95% 置信区间上下界的 tooltip

### Requirement 7: 价格预警与通知联动

**User Story:** 作为 Farmer_User，我需要在预测显示价格异常波动时收到预警，以便提前安排上市或采购。

#### Acceptance Criteria

1. WHEN Forecast_Engine 完成一次状态为 `active` 的 Forecast_Run 且对应 SPU_Tuple 至少被一名 Farmer_User 关注，THE Alert_Service SHALL 在该 Forecast_Run 完成后 60 秒内评估该 Forecast_Run 是否触发预警规则
2. THE Alert_Service SHALL 至少支持以下规则类型：未来 7 天点估计相对最近 7 天历史均价上涨百分比超过用户阈值、未来 7 天点估计相对最近 7 天历史均价下跌百分比超过用户阈值、未来 30 天 95% 置信区间宽度超过历史均价的 50%
3. THE Alert_Service SHALL 为涨跌阈值类规则提供默认值 5%，且 SHALL 仅接受用户阈值在 1% 至 50% 闭区间内的取值
4. WHEN 某条预警规则被触发，THE Alert_Service SHALL 在 `notifications` 表中以 `type=price_alert` 写入一条记录，且 SHALL 包含 `spu_id`、Forecast_Run ID、规则标识、触发数值、对应 Forecast_Run 报告链接五个字段
5. THE Alert_Service SHALL 不得基于 mock 价格、随机数据或状态非 `active` 的 Forecast_Run 生成预警
6. WHERE 一次 Forecast_Run 同时触发多条规则，THE Alert_Service SHALL 仅写入触发数值绝对值最大的一条预警记录
7. THE Alert_Service SHALL 对同一 Farmer_User、同一 SPU_Tuple、同一规则在 24 小时窗口内最多写入一条预警记录
8. WHERE Farmer_User 已对某 SPU_Tuple 设置预警静默，THE Alert_Service SHALL 不为该用户与该 SPU_Tuple 写入任何 `type=price_alert` 通知
9. WHEN Farmer_User 在前端通知中心点击一条 `type=price_alert` 通知，THE Forecast_System SHALL 跳转到对应 SPU_Tuple 的行情详情页并定位到 Forecast_Run 报告

### Requirement 8: 冷启动、数据缺失与降级

**User Story:** 作为 Farmer_User，我需要在新关注一个作物或数据不全时仍能看到合理的预测或友好提示，以便不被空白页面阻塞。

#### Acceptance Criteria

1. WHEN Farmer_User 关注一个之前未被任何用户关注过的 SPU_Tuple，THE Forecast_System SHALL 在 5 分钟内将一次针对该 SPU_Tuple 的历史数据补采任务加入采集队列，补采的历史窗口 SHALL 覆盖最近 365 天
2. IF 一个 SPU_Tuple 的 Price_History 长度小于 14 天，THEN THE Forecast_Engine SHALL 在 Forecast_Run 上标记 `cold_start` 并使用 Fallback_Engine 中的移动平均方法产出 7 天预测
3. IF Model_Service 在 30 秒内不可达，THEN THE Forecast_Engine SHALL 调用 Fallback_Engine 在 Node.js 进程内运行指数平滑或 Holt-Winters 方法产出预测，Fallback_Engine SHALL 不引入任何超过 1 MB 安装体积的新 npm 依赖
4. IF Fallback_Engine 也无法产出预测（Price_History 为空或算法不收敛），THEN THE Forecast_System SHALL 通过 Explanation_Service 仅基于 RAG 检索生成定性报告并将 Forecast_Run 状态标记为 `qualitative-only`
5. WHEN 某个交易日的 Price_History 缺失，THE Collector SHALL 在 `price_history` 表中以 `null` 价格与 `missing_reason` 字段（取值仅限 `holiday`、`market_closed`、`collection_failed`、`unknown` 四种之一）标记该日
6. WHEN Forecast_Engine 准备将 Price_History 送入 Model_Service 或 Fallback_Engine，THE Forecast_Engine SHALL 同时携带前向填充后的数值序列与对应的缺失指示位向量
7. THE Forecast_System SHALL 在所有降级路径下保证前端 `/api/market/forecast/:spu_id` 返回 200 状态码，且响应中 `degraded` 字段取值 SHALL 限定为 `none`、`cold_start`、`fallback_engine`、`qualitative_only` 四种之一以标识降级层级
8. WHILE 一个 SPU_Tuple 的补采任务在排队或执行中，THE Forecast_System SHALL 允许 Forecast_Engine 使用同品种其他 active 产地的近 30 天历史均价作为 Cold_Start 借数输入，且 SHALL 在 Forecast_Run 上额外标记 `borrowed_history` 来源
9. IF Farmer_User 对同一 SPU_Tuple 的 `/api/market/forecast/:spu_id` 在 60 秒内主动刷新超过 5 次，THEN THE Forecast_System SHALL 拒绝额外刷新请求并返回限流状态指示，但 SHALL 不影响后台已排队的补采任务
10. IF 一个 SPU_Tuple 的补采任务在加入队列后 60 分钟内未完成，THEN THE Forecast_Engine SHALL 立即针对该 SPU_Tuple 触发一次 Fallback_Engine 产出预测，且 SHALL 不再等待该补采任务完成

### Requirement 9: 模型评估与回测

**User Story:** 作为 Operator，我需要看到每个 SPU_Tuple 与每个模型族的回测准确度，以便决定哪种模型上线或下线。

#### Acceptance Criteria

1. WHEN Scheduler 在每周一 02:00 触发周度回测任务，THE Forecast_Engine SHALL 为每个 active SPU_Tuple（最近 90 天内至少有过 1 次有效预测请求的 SPU_Tuple）对每个候选模型族运行滚动窗口回测，回测窗口步长 SHALL 为 7 天，每个回测窗口的训练集 SHALL 使用截至该窗口起点之前不少于 180 天的历史数据，测试集 SHALL 为该窗口起点之后的 7 天
2. THE Forecast_Engine SHALL 在 `backtest_results` 表中保存 `spu_id`、模型族、Forecast_Horizon、MAPE、RMSE、Directional_Accuracy、回测时间七个字段
3. THE Forecast_Engine SHALL 在 Admin_Console 中提供按 SPU_Tuple 与模型族筛选的回测结果查询接口，查询响应时间 SHALL 不超过 3 秒，单次返回记录数 SHALL 不超过 1000 条
4. IF 一个模型族在某 SPU_Tuple 上连续 4 个回测窗口（4 周）的 MAPE 均高于 30%，THEN THE Forecast_Engine SHALL 自动将该模型族在该 SPU_Tuple 上的权重置为 0，并在 `backtest_results` 中将该模型族在该 SPU_Tuple 上的状态标记为 `auto-disabled`
5. THE Forecast_System SHALL 不得在任一回测窗口中使用该回测窗口测试集起点之后产生或获取的任何数据用于训练集或测试集
6. WHERE 某模型族在某 SPU_Tuple 上已被标记为 `auto-disabled`，IF 后续连续 2 个回测窗口的 MAPE 均不高于 25%，THEN THE Forecast_Engine SHALL 取消该 `auto-disabled` 标记，并将该模型族在该 SPU_Tuple 上的权重恢复为默认初始值
7. IF 某 active SPU_Tuple 的可用历史数据少于训练集最小要求（180 天），THEN THE Forecast_Engine SHALL 跳过该 SPU_Tuple 当次回测，并在 `backtest_results` 中以 `insufficient-data` 状态记录跳过事由，且 SHALL 不触发 `auto-disabled` 判定
8. IF 某次回测任务因数据源不可用或单次回测计算耗时超过 30 分钟而失败，THEN THE Forecast_Engine SHALL 在 `backtest_results` 中以 `failed` 状态记录该次回测，并保留该 SPU_Tuple 与该模型族上一次成功的回测结果不被覆盖

### Requirement 10: 新模型上线与影子模式

**User Story:** 作为 Operator，我需要先以影子模式验证新模型再切换到生产，以便降低线上风险。

#### Acceptance Criteria

1. THE Model_Service SHALL 在 `model_registry` 中以 `(model_family, version, status)` 三元组管理模型版本，version 字段长度 SHALL 不超过 64 字符，status 取值 SHALL 限定为 `shadow`、`canary`、`production`、`retired` 四种之一
2. WHEN Operator 在 Admin_Console 将一个新模型版本注册为 `shadow`，THE Forecast_Engine SHALL 在每次生产预测之外并行调用该影子版本但 SHALL 不将其结果对外输出
3. WHILE 一个模型版本的 status 为 `shadow`，THE Forecast_Engine SHALL 将该影子版本的 Forecast_Run 写入 `forecast_runs` 表并参与 `backtest_results` 计算
4. IF 影子版本推理在 5 秒内未返回响应或返回错误，THEN THE Forecast_Engine SHALL 仅记录该次影子推理失败而 SHALL 不影响该次生产预测的结果与对外响应
5. WHEN Operator 将一个 `shadow` 版本切换为 `canary`，THE Forecast_Engine SHALL 按 Operator 配置的灰度比例（默认 10%、合法范围 1% 至 50%）通过对 `spu_id` 执行哈希取模将一部分对外预测流量稳定切到该版本
6. IF Operator 配置的灰度比例不在 1% 至 50% 范围内，THEN THE Forecast_Engine SHALL 拒绝该次配置变更并保留原有灰度配置不变
7. WHEN Operator 将一个 `canary` 版本切换为 `production`，THE Forecast_Engine SHALL 在同一原子操作内将原 `production` 版本切换为 `retired`，IF 该原子操作中任一步骤失败，THEN THE Forecast_Engine SHALL 将所有版本回滚至变更前状态
8. IF 同一 model_family 下存在超过一个 `production` 状态的版本，THEN THE Forecast_Engine SHALL 拒绝该次状态变更并返回冲突错误
9. IF Operator 提交的状态转换不属于 `shadow→canary`、`canary→production`、`production→retired`、`shadow→retired`、`canary→retired` 五种允许路径之一，THEN THE Forecast_Engine SHALL 拒绝该次变更而 SHALL 不修改 `model_registry` 中任何记录的 status

### Requirement 11: 运营管理后台

**User Story:** 作为 Operator，我需要一个后台界面查看采集状态与管理白名单，以便日常运营。

#### Acceptance Criteria

1. THE Admin_Console SHALL 提供 SPU_Tuple 列表页，每行 SHALL 展示 `spu_id`、产地、品种、规格、单位、状态、最近采集时间、最近预测时间八列，且 SHALL 支持分页（默认每页 20 条、单页上限 100 条）以及按 `spu_id`、产地、品种、规格、单位、状态六个维度的搜索
2. THE Admin_Console SHALL 提供 `collection_logs` 查看页，且 SHALL 支持按来源、时间区间、SPU_Tuple、状态四个维度以 AND 关系组合筛选；时间区间起止 SHALL 不超过 90 天且起 ≤ 止；列表 SHALL 支持分页且单页上限 100 条
3. THE Admin_Console SHALL 提供 `model_registry` 管理页，注册新模型版本时 SHALL 至少必填 `model_family`、`version`、`status` 三字段；切换操作 SHALL 仅切换当前生效版本而不删除历史版本
4. IF 当前登录用户角色不为 Operator，THEN THE Admin_Console SHALL 拒绝访问并返回 HTTP 403
5. WHEN Operator 在 Admin_Console 触发一次手动采集任务，THE Collector SHALL 在 60 秒内开始执行并把执行结果（成功/失败、耗时、失败原因摘要）回写到 `collection_logs`
6. IF 同一 Operator 对同一 SPU_Tuple 在 60 秒内连续触发超过 1 次手动采集任务，THEN THE Admin_Console SHALL 拒绝后续请求并向请求方返回限流状态指示
7. WHEN Operator 在 Admin_Console 执行任意写操作（含 SPU_Tuple 主数据变更、模型注册与状态切换、手动触发采集），THE Forecast_System SHALL 记录包含 Operator 标识、操作类型、操作对象、操作时间四字段的审计条目

### Requirement 12: 数据合规与隐私

**User Story:** 作为 Forecast_System，我需要遵守数据来源使用限制与用户位置隐私要求，以便不违反公开数据使用规则与个人信息保护要求。

#### Acceptance Criteria

1. THE Collector SHALL 在每次发往 Public_Data_Source 的 HTTP 请求 User-Agent 头中包含非空的项目标识字符串（长度 1 到 64 字符）与符合 RFC 5322 格式的联系邮箱地址
2. THE Forecast_System SHALL 在 `/api/market/forecast/:spu_id` 响应与 Explanation_Service 生成的报告中，为每个 Price_History 数据点标注其 Public_Data_Source 名称与精度到日的采集时间戳
3. THE Forecast_System SHALL 拒绝对外公开 Public_Data_Source 原始页面 HTML 或截图内容，且 SHALL 仅公开按 SPU_Tuple 与不小于 1 天时间窗聚合后的 Price_History 数据点
4. WHERE Farmer_User 授权了位置信息，THE Forecast_System SHALL 仅在内存中使用原始经纬度生成 SPU_Tuple 关注推荐，持久化字段 SHALL 仅保留行政区（县级或更粗粒度）信息，且 SHALL 不将原始经纬度写入任何数据库表或应用日志
5. IF 任一 Public_Data_Source 在其官方渠道公开声明禁止抓取或要求商业授权，THEN THE Operator SHALL 在 Admin_Console 中将该来源切换为 inactive，且 Collector SHALL 在该来源被切换为 inactive 后的 5 分钟内停止向该来源发出新的抓取请求
6. THE Forecast_System SHALL 在写入应用日志、审计日志或外部错误上报内容前，对 Farmer_User 手机号、身份证号、原始经纬度等敏感字段执行脱敏处理，仅保留必要的可识别字符，其余以掩码字符替代
7. WHEN Farmer_User 通过客户端发起删除其关注列表与历史推荐记录的请求，THE Forecast_System SHALL 在 30 天内从生产数据库中移除对应记录，且 SHALL 向请求方返回包含处理状态的响应
8. THE Forecast_System SHALL 将原始 Price_History 采集记录的留存期限限制为不超过 24 个月，且 SHALL 对来源状态切换、用户数据删除请求、敏感字段访问行为记录合规审计日志，审计日志留存期不少于 12 个月

## 非功能需求

### 性能

1. THE Forecast_System SHALL 在 95% 的请求中使 `/api/market/forecast/:spu_id` 在 800 毫秒内返回响应
2. THE Forecast_System SHALL 支持每日完成至少 5000 个 SPU_Tuple 的采集与预测任务
3. THE Model_Service SHALL 在 95% 的推理请求中使单个 SPU_Tuple 的 30 天预测在 5 秒内完成

### 可用性

1. THE Forecast_System SHALL 在 GPU Model_Service 单点故障下仍能通过 Fallback_Engine 提供预测产出
2. THE Forecast_System SHALL 在 DashScope API 单点故障下仍能通过模板降级提供报告产出
3. THE Forecast_System 月度可用性 SHALL 不低于 99%

### 可扩展性

1. THE Forecast_System SHALL 支持新增 model_family 而不需要修改 `forecast_runs` 表结构
2. THE Forecast_System SHALL 支持新增 Public_Data_Source 而不需要修改 `price_history` 表结构

### 安全

1. THE Forecast_System SHALL 对 `/api/market/admin/*` 路径下所有接口要求 Operator 角色 JWT
2. THE Forecast_Engine 与 Model_Service 之间的 HTTP 通信 SHALL 使用基于共享密钥的请求签名
3. THE Forecast_System SHALL 不得在日志中输出 JWT、共享密钥、Farmer_User 真实姓名与手机号

### 可观测性

1. THE Forecast_System SHALL 在 `collection_logs`、`forecast_runs`、`backtest_results` 三张表中各自保留至少 90 天历史
2. THE Forecast_System SHALL 在每次 Forecast_Run、采集任务、回测任务中记录 `request_id` 用于跨服务追踪
3. THE Admin_Console SHALL 在首页展示当日采集成功率、当日预测成功率、当日降级比例三个指标

## 假设与依赖

1. 假设 DashScope（通义千问）API 在中国大陆网络环境下可达且账户配额充足
2. 假设独立 GPU 服务器部署 Model_Service 并通过内网或 VPN 与 Node.js backend 互通
3. 假设 Public_Data_Source 在公网可访问且未对项目 IP 做封禁
4. 假设 SQLite 仍是当前阶段的主存储；当 `price_history` 与 `forecast_runs` 数据量超过 SQLite 合理上限时由后续 spec 规划迁移
5. 假设现有 `market_documents` / `market_chunks` / `market_chunks_fts` RAG 知识库继续维护并对 Explanation_Service 可用
6. 假设现有 `notifications` 表与通知中心 UI 继续存在并可承接 `type=price_alert`

## 范围之外

1. 本规格不接入任何付费第三方实时行情 API
2. 本规格不实现农产品撮合交易、买家卖家匹配、订单结算
3. 本规格不实现产地物流时效预测与运费定价
4. 本规格不实现期货价格、期权价格预测
5. 本规格不在 SQLite 之外引入新数据库；如需迁移由后续 spec 决策
6. 本规格不实现模型自动超参数搜索（AutoML），新模型上线由 Operator 手动注册
