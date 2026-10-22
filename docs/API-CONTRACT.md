# 本地后端联调契约 v1.1.0

唯一运行时契约：packages/contracts/src/http.ts，复用 index.ts 的 QuerySpec。可直接使用导出的 TypeScript DTO 类型和 TypeBox schemas；无 TypeBox 工程可使用 packages/contracts/examples/schemas.json。真实 PostgreSQL 生成且经过 schema 校验的样例：packages/contracts/examples/payment-flow.json。前端无需改页面结构，HttpApi adapter 对齐本契约即可。

本版本开放 paid_amount / refund_amount / sold_units。结构沿用 v1.0.0，新增 units 单位、signal 结构化证据和 signal 类型事实模板；provenance 可读取旧版 1.0.0 报告。服务模式由后端启动配置决定：deterministic 执行真实 SQL、明确未执行 Agent；agent 使用 Pi + DeepSeek 实现，本轮不调用外部模型。不会因模型失败自动切换模式。

## 当前可运行接口

本表中的路由已在 apps/api/src/app.ts 实现；默认 `npm run api:dev` 启动 http://127.0.0.1:3000，自动启动独立的本地 PostgreSQL 18 并发布 acceptance-v1 与 signals-v1，默认 signals-v1 包含辅助观测。无需 API Key 的 deterministic 模式实际执行 SQL。`npm run verify:api` 自动使用空闲端口验证真实 HTTP/SSE 并保存 evals/results/backend-api-smoke.json。

支付金额首条链路：POST session → POST run（可只传“昨天华东支付金额为什么下降？”）→ GET events → GET report/evidence。已支持 scope 确认、历史报告、JSON/Markdown 导出、取消、幂等和事件重放。确定性解析只覆盖文档中有限表达，无法解释的输入返回澄清；完整自然语言解析只在 agent 模式调用模型。

只部署一个本地 API 进程；数据库 lease 阻止相同身份的第二实例启动。服务重启将遗留 queued/running 标记 interrupted，不自动重复执行。新增 30 天保留清理（启动时执行）、删除本人会话及关联数据、反馈和历史报告 cursor 分页；仍不提供公网访问。API 成功不等于真实模型验收或完整 P0 验收。

## 路由与字段

| 路由 | 请求 | 响应 schema |
|---|---|---|
| GET /api/catalog | 无 | CatalogSchema，兼容前端 Dataset 字段 version/storeName/synthetic/businessClock/updatedAt/timezone；增加 executionMode、supportedMetrics、datasets |
| POST /api/sessions | SessionRequestSchema，datasetVersion 可选 | 201 SessionResponseSchema，sessionId/datasetVersion |
| GET /api/sessions?limit=30&cursor=... | limit 1—50，opaque cursor 可选 | HistorySchema 数组；X-Next-Cursor 指示下一页；当前返回已有报告的历史 |
| DELETE /api/sessions/:id | 无 body | 204；先取消活动任务，再事务删除本人会话及关联报告/证据/事件/反馈 |
| POST /api/reports/:id/feedback | FeedbackRequestSchema：rating 1—5、issueType、comment≤1000 | 201 FeedbackResponseSchema：feedbackId |
| POST /api/sessions/:id/runs | AnalysisRequestSchema，question/confirmedIntent?/parentRunId?；必需 Idempotency-Key | 202 StartRunResponseSchema，runId/status/eventsUrl |
| GET /api/runs/:id | 无 | RunSchema |
| POST /api/runs/:id/cancel | 空对象 | RunSchema；终态不反转 |
| GET /api/runs/:id/events | Last-Event-ID 为整数序号，首次可为 0 | text/event-stream；RunEventSchema，支持已保存事件重放 |
| GET /api/reports/:id | 无 | ReportSchema |
| GET /api/evidences/:id | 无 | EvidenceSchema |
| GET /api/reports/:id/export?format=md/json | format 白名单 | Markdown 或 ReportSchema JSON 下载 |

错误统一 ErrorSchema：code/message/retryable/traceId，details 可选。禁止原始 SQL、堆栈、连接串和 Key 进入响应。

导出行为：JSON 返回保存的完整 ReportSchema，不重新查数或渲染报告。Markdown 从同一保存报告生成，显示 completed/partial、单位、口径、总量/贡献、事实引用、假设支持/反证/缺失信息、unknown、建议、限制与执行记录；每条证据附完整 JSON，包含其自身 QuerySpec、两期窗口/筛选、列名、原始 rows、覆盖率、signal、note 和 hash。子范围证据不能按报告总范围解读；null 不补零，分/件与未舍入比例保持原值。旧 1.0.0 报告可读取导出，不覆写已保存文本或补造缺失字段。Markdown 文案与布局不是机器解析契约，结构化消费继续使用 JSON。

## 与现有前端适配模型的关系

- 保留 Run.id、sessionId、question、reportId、status；phase 为 0—7 数字，供现有界面兼容，新增 phaseName 为权威阶段名。前端四阶段展示应将 interpreting/received→0、checking_data/comparing→1、decomposing→2、inspecting/validating/persisting→3；不要用 phase 直接索引长度为 4 的数组。
- Report 保留前端已有字段。支付/退款 unit=fen，件数 unit=units；comparison、contributors 数值均为整数分/件，变化率和份额为比例。facts.templateId 可为 comparison/contribution/signal，text 由服务端证据模板渲染。
- Evidence 保留 id/code/title/kind/status/query/source/metricId/datasetVersion/metricVersion/createdAt/coverage/baselineCoverage/columns/rows/note，新增 runId/resultHash/queryTemplateIds/comparison?/contributors?。rows 金额是数值分，前端表格应按列说明格式化；不能再假定 rows 已经是展示字符串。
- Evidence.signal 按 type 区分 inventory/traffic/promotion/refund_reason。status=missing 时没有 signal，coverage=null，不能当作零库存或零流量。库存小时是 SKU×大区池观测数；流量只有渠道×大区粒度，skuAttributionSupported=false。hypotheses 由已验证信号规则模板生成，最多 3 条，不能确认因果。
- 库存供应约束解释仅适用于被核查的单个下降 SKU，并引用总量、SKU 贡献和库存三类证据；多 SKU 合池保留观测事实，单 SKU 归因进入 unknowns。hypotheses.evidenceIds 数量可变，前端不能假定只有两个引用。退款下降不会生成“销售供应约束”解释；HTTP/QuerySpec schema 仍为原版本。
- 信号查询可合法缩小范围，但解释还须匹配指标证据：库存的渠道/大区选择须匹配 SKU 贡献；流量的渠道/大区选择须匹配总量，SKU 选择只表示背景用途。子范围观测仍进入 facts 并显示实际 SKU/渠道/大区，范围不匹配时进入 unknowns，不输出“同口径”解释。筛选值顺序不影响匹配；覆盖不足或退款下降不生成流量解释。
- 退款原因事实明确“本期”和实际 SKU/渠道/大区，不把子范围事件数当作报告总事件数。活动解释和证据说明明确按 SKU/渠道匹配（包含全范围活动），仅与本期或基期重叠，无大区粒度，不能归因到查询大区或证明活动效果。只变更模板/说明，Signal/Report DTO 不变。
- 本地数据版本以 catalog 为准；前端 fixture 使用的 web-demo-v1、nuts/oats、mall/live 不属于服务端数据字典。canonical 样例使用 acceptance-v1、A/B/C、douyin、east。confirmedIntent 的筛选必须来自当前版本，未知值返回失败，不能静默替换。
- HTTP 请求不包含前端 scenario。该字段仅用于前端 mock；后端拒绝额外字段。confirmedIntent 是明确结构化查询，仍由服务端验证，不赋予权限。

## SSE

每个事件 `id: seq`、`data: JSON(RunEventDTO)`，空行分隔。事件类型见 RunEventSchema。phase.changed 只表示动作，未经验证的数字不流式推送。report.ready 后取报告；run.finished 才是权威终态。clarification.required 包含 clarification 对象；下一轮携带 parentRunId 新建 run。

状态 queued/running，以及 completed/partial/needs_clarification/insufficient_data/failed/cancelled/timed_out/interrupted 终态。EOF 不等于成功，断开订阅不取消任务。客户端按 seq 去重；不要为本地合成事件消耗服务器 seq。

## 根配置与依赖同步

后端在独立 backend/payment-api 分支与 worktree 开发。公共契约提交可单独合并/cherry-pick；不要直接拷贝整个 apps 目录。契约本身只需要根工程已有 typebox；HTTP 提交增加根 Fastify 5.12.7、api:dev/api:start/verify:api/contracts:examples scripts，tsconfig include apps/api，并新增 APP_DATABASE_URL/ANALYSIS_MODE。合入后在根目录 npm ci；前端当前独立 apps/web/package.json 保留，不在本切片重组 workspace 或前端 lockfile。

共享 HTTP schema 在原文件兼容升级为 v1.1.0；迁移按 001→004 顺序执行，已发布的旧数据集/报告不改写。新增 db:scenarios、db:backup、db:restore、eval:offline 命令，无新生产依赖。备份恢复只允许空目标，schema hash 必须一致。根 scripts 变化后更新根工程；前端独立 lockfile 无须覆盖。

运行约束：每分钟最多 60 个创建 run 请求（包括重试；幂等键仍保证不重复执行）；429 为 RATE_LIMITED。原 2 个执行、10 个排队限制保留。相同 QuerySpec 重复工具查询使用缓存，但仍计入 12 次工具尝试。模型 429/500/502/503/504 最多额外重试一次，计入同一预算；当前不调用真实模型，仅 faux transport 验证此行为。
