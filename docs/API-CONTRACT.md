# 本地后端联调契约 v1.0.0

唯一运行时契约：packages/contracts/src/http.ts，复用 index.ts 的 QuerySpec。可直接使用导出的 TypeScript DTO 类型和 TypeBox schemas；无 TypeBox 工程可使用 packages/contracts/examples/schemas.json。真实 PostgreSQL 生成且经过 schema 校验的样例：packages/contracts/examples/payment-flow.json。前端无需改页面结构，HttpApi adapter 对齐本契约即可。

本版本只开放 paid_amount。退款/件数底层计算存在不表示 HTTP/Agent 已开放。服务模式由后端启动配置决定：deterministic 执行真实 SQL、明确未执行 Agent；agent 使用真实 Pi + DeepSeek。不会因模型失败自动切换模式。

## 当前可运行接口

本表中的路由已在 apps/api/src/app.ts 实现；默认 `npm run api:dev` 启动 http://127.0.0.1:3000，自动启动独立的本地 PostgreSQL 18 并发布 acceptance-v1。无需 API Key 的 deterministic 模式实际执行 SQL。`npm run verify:api` 自动使用空闲端口验证真实 HTTP/SSE 并保存 evals/results/backend-api-smoke.json。

支付金额首条链路：POST session → POST run（可只传“昨天华东支付金额为什么下降？”）→ GET events → GET report/evidence。已支持 scope 确认、历史报告、JSON/Markdown 导出、取消、幂等和事件重放。确定性解析只覆盖文档中有限表达，无法解释的输入返回澄清；完整自然语言解析只在 agent 模式调用模型。

本切片只部署一个本地 API 进程。服务重启将当前身份的遗留 queued/running 标记 interrupted，不自动重复执行；数据库中已完成报告保持可读取。不要对同一库和身份启动第二个 API 进程来做滚动重启。暂不提供公网访问、完整 30 天清理、会话删除、feedback 或 cursor 分页；不能宣称完整 M3/P0 完成。

## 路由与字段

| 路由 | 请求 | 响应 schema |
|---|---|---|
| GET /api/catalog | 无 | CatalogSchema，兼容前端 Dataset 字段 version/storeName/synthetic/businessClock/updatedAt/timezone；增加 executionMode、supportedMetrics、datasets |
| POST /api/sessions | SessionRequestSchema，datasetVersion 可选 | 201 SessionResponseSchema，sessionId/datasetVersion |
| GET /api/sessions?limit=30 | limit 1—50 | HistorySchema 数组；本切片只返回已有报告的历史 |
| POST /api/sessions/:id/runs | AnalysisRequestSchema，question/confirmedIntent?/parentRunId?；必需 Idempotency-Key | 202 StartRunResponseSchema，runId/status/eventsUrl |
| GET /api/runs/:id | 无 | RunSchema |
| POST /api/runs/:id/cancel | 空对象 | RunSchema；终态不反转 |
| GET /api/runs/:id/events | Last-Event-ID 为整数序号，首次可为 0 | text/event-stream；RunEventSchema，支持已保存事件重放 |
| GET /api/reports/:id | 无 | ReportSchema |
| GET /api/evidences/:id | 无 | EvidenceSchema |
| GET /api/reports/:id/export?format=md/json | format 白名单 | Markdown 或 ReportSchema JSON 下载 |

错误统一 ErrorSchema：code/message/retryable/traceId，details 可选。禁止原始 SQL、堆栈、连接串和 Key 进入响应。

## 与现有前端适配模型的关系

- 保留 Run.id、sessionId、question、reportId、status；phase 为 0—7 数字，供现有界面兼容，新增 phaseName 为权威阶段名。前端四阶段展示应将 interpreting/received→0、checking_data/comparing→1、decomposing→2、inspecting/validating/persisting→3；不要用 phase 直接索引长度为 4 的数组。
- Report 保留前端已有 id/runId/sessionId/query/scopeLabel/metricLabel/unit/dataset/comparison/contributors/finding/facts/hypotheses/unknowns/nextActions/limitations/evidences/trace/createdAt。支付金额单位固定 fen。增加 provenance；facts 增加 templateId/valueRefs，text 由服务端证据模板渲染。
- Evidence 保留 id/code/title/kind/status/query/source/metricId/datasetVersion/metricVersion/createdAt/coverage/baselineCoverage/columns/rows/note，新增 runId/resultHash/queryTemplateIds/comparison?/contributors?。rows 金额是数值分，前端表格应按列说明格式化；不能再假定 rows 已经是展示字符串。
- 当前没有库存证据，所以 evidences 只含实际查得的 comparison/contribution；不要硬编码第三条库存证据或三条证据数量。
- 本地数据版本以 catalog 为准；前端 fixture 使用的 web-demo-v1、nuts/oats、mall/live 不属于服务端数据字典。canonical 样例使用 acceptance-v1、A/B/C、douyin、east。confirmedIntent 的筛选必须来自当前版本，未知值返回失败，不能静默替换。
- HTTP 请求不包含前端 scenario。该字段仅用于前端 mock；后端拒绝额外字段。confirmedIntent 是明确结构化查询，仍由服务端验证，不赋予权限。

## SSE

每个事件 `id: seq`、`data: JSON(RunEventDTO)`，空行分隔。事件类型见 RunEventSchema。phase.changed 只表示动作，未经验证的数字不流式推送。report.ready 后取报告；run.finished 才是权威终态。clarification.required 包含 clarification 对象；下一轮携带 parentRunId 新建 run。

状态 queued/running，以及 completed/partial/needs_clarification/insufficient_data/failed/cancelled/timed_out/interrupted 终态。EOF 不等于成功，断开订阅不取消任务。客户端按 seq 去重；不要为本地合成事件消耗服务器 seq。

## 根配置与依赖同步

后端在独立 backend/payment-api 分支与 worktree 开发。公共契约提交可单独合并/cherry-pick；不要直接拷贝整个 apps 目录。契约本身只需要根工程已有 typebox；HTTP 提交增加根 Fastify 5.12.7、api:dev/api:start/verify:api/contracts:examples scripts，tsconfig include apps/api，并新增 APP_DATABASE_URL/ANALYSIS_MODE。合入后在根目录 npm ci；前端当前独立 apps/web/package.json 保留，不在本切片重组 workspace 或前端 lockfile。

共享 HTTP schema 维持 v1.0.0，没有另起一套接口。新的 apps/api、002-app migration 和 packages/agent 随后端提交一起接入。首次启动需执行新版 migration 建立 app schema 和 commerce_app 状态写入角色，已有 001-business.sql 未改写。
