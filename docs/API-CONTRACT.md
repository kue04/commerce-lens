# 本地后端联调契约 v1.2.0

唯一运行时契约：packages/contracts/src/http.ts，复用 index.ts 的 QuerySpec。可直接使用导出的 TypeScript DTO 类型和 TypeBox schemas；无 TypeBox 工程可使用 packages/contracts/examples/schemas.json。真实 PostgreSQL 生成且经过 schema 校验的样例：packages/contracts/examples/payment-flow.json。前端无需改页面结构，HttpApi adapter 对齐本契约即可。

本版本新增数据概况 DatasetProfileSchema 和连续演示数据集 portfolio-90d-v1，继续开放 paid_amount / refund_amount / sold_units。QuerySpec、run/report/evidence 字段保持兼容；provenance 接受 1.0.0、1.1.0、1.2.0。服务模式由后端启动配置决定：deterministic 执行真实 SQL、明确未执行 Agent；agent 使用 Pi + DeepSeek 实现。本轮验证禁止真实外部模型调用。

## 当前可运行接口

本表中的路由已在 apps/api/src/app.ts 实现；`npm run api:dev` 启动 http://127.0.0.1:3000，自动启动独立的本地 PostgreSQL 18，在版本不存在时发布 acceptance-v1、signals-v1、portfolio-90d-v1，默认选择 portfolio-90d-v1，保留已有版本与报告。启动模式仍须显式使用 `ANALYSIS_MODE=deterministic` 避免继承本机 Agent 配置。`npm run verify:api` 自动使用空闲端口验证真实 HTTP/SSE 并保存 evals/results/backend-api-smoke.json。

支付金额首条链路：POST session → POST run（可只传“昨天华东支付金额为什么下降？”）→ GET events → GET report/evidence。已支持 scope 确认、历史报告、JSON/Markdown 导出、取消、幂等和事件重放。确定性解析只覆盖文档中有限表达，无法解释的输入返回澄清；完整自然语言解析只在 agent 模式调用模型。

只部署一个本地 API 进程；数据库 lease 阻止相同身份的第二实例启动。服务重启将遗留 queued/running 标记 interrupted，不自动重复执行。新增 30 天保留清理（启动时执行）、删除本人会话及关联数据、反馈和历史报告 cursor 分页；仍不提供公网访问。API 成功不等于真实模型验收或完整 P0 验收。

## 路由与字段

| 路由 | 请求 | 响应 schema |
|---|---|---|
| GET /api/catalog | 无 | CatalogSchema，兼容前端 Dataset 字段 version/storeName/synthetic/businessClock/updatedAt/timezone；增加 executionMode、supportedMetrics、datasets |
| GET /api/datasets/:version/profile | 已授权版本；无 query/body | DatasetProfileSchema，实际数量、日期、覆盖检查、三指标定义、筛选字典 |
| POST /api/datasets/:version/overview | OverviewRequestSchema（原QuerySpec）；无额外query | OverviewSchema：三指标比较、30天趋势、贡献、最多5条规则提示与可用性 |
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

## 数据概况与第一切片

真实 HTTP/PostgreSQL 样例为 `packages/contracts/examples/dataset-profile.json`，使用 `npm run contracts:examples` 在独立临时数据库重新生成并按 schema 校验。样例中的数量来自数据库，不是目标常量：当前生成器为 100000 订单、200000 订单行、4795 成功退款事件、259200 小时库存记录、1080 日流量记录、2 个活动、30 SKU、3 渠道、4 大区。`counts.orders` 包含失败订单，`refundEvents` 包含全部状态的事件，不等于支付/成功退款指标的事件数；`trafficDays` 是渠道×大区×日期行数，不是自然日数。其他版本或店铺始终重新统计，不能套用上述规模。

- `dataset.businessClock=2026-10-22` 是固定演示时钟；`publishedAt` 是实际发布时间。旧 `dataset.updatedAt` 保持为发布时间的兼容别名，不代表同步成功。
- 顶层 `coverageStart/completeThrough` 表示三个主指标依赖源的共同连续覆盖范围，右端为排他边界；截止遇到第一个已声明缺失分区，`lastCompleteDate` 为对应最后完整日。缺少任一核心源或没有完整区间时，完整截至字段为 null。新版本为 2026-07-24 至 2026-10-22（不含），即完整到 2026-10-21。
- `sources` 固定六项，分别返回实际 `rowCount`、实际记录日期 `actualStartDate/actualEndDate`、源声明的 `coverageStart/completeThrough`、`missingPartitions`、发布时检查的 `checkedAt`。源 `completeThrough` 是水位，须同时读取缺分区；源 `lastCompleteDate` 从 coverageStart 连续计算，遇到缺分区即停止。实际日期是记录的最小/最大上海日期；订单行使用所属订单支付时间，活动结束为记录的排他生效边界，不能当成交易发生日。
- `available` 表示已发布覆盖检查、水位达到业务时钟且未声明缺分区；`partial` 表示水位落后或声明缺分区；`missing` 表示没有该源的覆盖检查，`checkedAt/coverageStart/completeThrough` 为 null。数量为 0 且源 available 可以是真实零；数量为 0 且 missing 不能当作业务零值。记录日期之间的无交易日不自动视为缺分区；旧版本覆盖声明保留，不根据实际最小日期改写。库存/流量的细粒度覆盖仍由已有 SignalService 独立核查。
- `metrics` 仅包含三个主指标，与现有指标目录共用版本、依赖源和时间字段；金额为整数分、件数为整数件。`filters` 的 SKU/渠道/大区来自当前授权版本与店铺的实际表，值可直接用于原 QuerySpec。依然保留每个筛选数组最多20值的既有边界，选择全部30 SKU应省略 skuId。
- 路由先验证版本可供当前店铺访问，再构造只读服务端上下文；用户不能传入 storeId、ownerId 或 SQL。源统计采用固定 SQL 与绑定参数，读取在 repeatable-read 事务内并受 RLS 保护。概况不创建 run、不写报告，也不调用模型。

数据生成入口为 `npm run db:seed -- portfolio-90d-v1`（连接已迁移数据库），固定 seed=20261022；重复发布同版本报错，不能覆盖。订单按日流量和转化权重分配，折扣、商品偏好、库存时段和退款延迟改变业务明细；库存为 SKU×大区共享池×小时，流量为渠道×大区×日期，活动为独立生效范围；不向业务表写入报表答案或场景标签。旧生成器、数据集、冻结案例/标签、不可变报告均保留。

经营概览已在第二切片实现，契约与实际样例见下节；模型工具参数没有增加权限或版本字段。

前端同步清单（本轮改动尚未提交，不自动合并到 main）：`packages/contracts/src/http.ts`、`packages/contracts/examples/schemas.json`、`packages/contracts/examples/dataset-profile.json`、`packages/contracts/examples/payment-flow.json`、`docs/API-CONTRACT.md`。`packages/contracts/src/index.ts` 无改动。前端只同步契约文件无法获得新后端路由，应连接本分支运行的 API；本轮没有修改前端页面、前端进度或前端依赖。

## 经营概览与第二切片

`OverviewRequestSchema`直接复用原`QuerySpecSchema`，不是新的时间/权限请求协议。`metricId`仅支持paid_amount/refund_amount/sold_units；`filters/groupBy/topN`沿用原边界。服务端校验已授权版本后构造store/version上下文。概览无模型、无run、无证据/报告落库；即使API配置为agent，概览响应仍固定executionMode=deterministic、agentExecuted=false。

输入实际窗口必须符合下表；不匹配返回422 INVALID_WINDOW，不静默改写。支持完整历史窗口，截止不得超过固定业务时钟。以时钟2026-10-22为例：

| 选择 | currentWindow（右端不含） | baselineWindow（右端不含） | 趋势偏移 |
|---|---|---|---|
| 昨天 | 2026-10-21→2026-10-22 | 2026-10-14→2026-10-15 | 7天 |
| 近7天 | 2026-10-15→2026-10-22 | 2026-10-08→2026-10-15 | 7天 |
| 近30天 | 2026-09-22→2026-10-22 | 2026-08-23→2026-09-22 | 30天 |

- `query`返回规范化的真实比较窗口与筛选；`metrics`固定顺序paid_amount/refund_amount/sold_units，每项比较共享同一范围、金额为整数分、件数为整数件。availability独立计算；退款源缺失不禁用支付/件数。某侧不完整时仅该侧为null，delta/changeRate为null；已覆盖且无事件保留0，基期0的changeRate为null。
- `trend`是截至currentWindow.endDateExclusive之前的连续30个自然日，与卡片选择1/7/30天独立。基期日期=date−offsetDays。返回趋势两期实际范围、每点两侧availability和原格式单日analysisQuery；可用日期直接以该QuerySpec创建分析run。缺分区日期为null并有原因，不用0连接缺失折线。趋势30天与偏移基期可能重叠，只表示逐日配对，不能把整条趋势两窗口作为一个报告查询；每点单日QuerySpec均不重叠。
- 顶层availability对应选中指标的卡片比较范围，不代表所有趋势日期可用。`contributors`仅针对选中指标及groupBy，沿用Top-N/其他、整数与守恒检查；groupBy=none时为空。数据不可用时为空并返回原因。
- `changes`仅为选中指标的规则提示，最多5项：先总量，再按既有绝对变化排序的真实贡献组；排除“其他”，沿用请求topN。支付基期≥10000分且下降≥15%；件数基期≥20且下降≥20%；退款增加≥5000分且增长≥30%。规则由analytics/rules.ts与报告共用，ruleVersion=business-rules-v1，没有第二套阈值。这些是核实入口，不是因果结论或统计显著性。
- 每个变化项带原QuerySpec的analysisQuery。SKU/渠道/大区项缩小对应筛选，点击后分析值与变化项一致；category无对应筛选字段，因此仍返回类目贡献，但不生成无法精确下钻的类目变化项。总量变化项保留原查询。单日点用于分析run，若以其基期偏移调用overview本身，仍须满足概览的1/7/30天窗口规则。
- 日序列通过一个固定payments/refunds分别聚合后UNION的参数化模板取得，最多再执行一个已有分组模板；没有30/60次逐日业务查询。三指标与报告共用指标定义、质量门禁函数、比较/贡献计算、权限上下文及安全整数检查。`queryTemplateIds`仅公开服务端模板标识，无原始SQL。
- `generatedAt`为本次计算时间，dataset.updatedAt仍是发布时间；都不表示外部源同步成功。真实HTTP/PostgreSQL请求+响应样例：`packages/contracts/examples/overview.json`，以`npm run contracts:examples`重建并校验。

### 前端接入时点与顺序

本轮后端验证通过后即可开始接入，不必等待真实模型或新增模块。本轮只交付后端和共享契约，不修改前端页面。同步`packages/contracts/src/http.ts`、`examples/schemas.json`、`examples/overview.json`、`examples/dataset-profile.json`、`examples/payment-flow.json`和本文；`packages/contracts/src/index.ts`无改动，根依赖/lockfile无新增。分支仍为backend/payment-api，修改未提交时按文件同步，不能盲目cherry-pick含他人成果的提交。

1. 运行本分支最新后端并显式设ANALYSIS_MODE=deterministic；发布portfolio-90d-v1后从catalog获取版本。已有进程不会因磁盘改动自动刷新，启动/重启须由正在使用服务的会话协调，保留旧数据库和不可变报告。
2. 数据概况页接GET profile，展示真实数量、发布时间/业务时钟/完整截至日期及源缺失。
3. 概览接POST overview，以表中窗口构造原QuerySpec；三卡、30天趋势和变化项全部来自响应，禁止前端另算口径或补零。切指标/筛选/周期重新请求，防止旧响应覆盖新筛选。
4. 点击变化项/日点，将其analysisQuery作为confirmedIntent，先POST session指定同一datasetVersion，再POST run；现有run/report/evidence/SSE继续复用。缺失日点显示原因，禁用分析按钮，不创建无数据run。
5. 实际浏览器验收昨日/7天/30天、SKU/渠道/大区筛选、切指标、缺源/零基期以及概览→工作台数值一致；API请求、真实PostgreSQL与浏览器都通过后，才称完成前后端结合。当前后端测试通过不能替代这项前端验收。

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

共享 HTTP schema 在原文件兼容升级为 v1.2.0；迁移按 001→004 顺序执行，本次概况/概览无新增迁移，已发布的旧数据集/报告不改写。既有 db:scenarios、db:backup、db:restore、eval:offline 命令保留，无新生产依赖。备份恢复只允许空目标，schema hash 必须一致。根 scripts 变化后更新根工程；前端独立 lockfile 无须覆盖。

运行约束：每分钟最多 60 个创建 run 请求（包括重试；幂等键仍保证不重复执行）；429 为 RATE_LIMITED。原 2 个执行、10 个排队限制保留。相同 QuerySpec 重复工具查询使用缓存，但仍计入 12 次工具尝试。模型 429/500/502/503/504 最多额外重试一次，计入同一预算；当前不调用真实模型，仅 faux transport 验证此行为。
