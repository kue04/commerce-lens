# Commerce Lens 后端交接快照

更新：2026-10-22，Asia/Shanghai。新会话先读根 AGENTS.md；本文保留当前有效状态，历史细节查 Git，不继续追加聊天流水账。

## 本轮执行快照（恢复自 dbffd01）

- 本轮开始分支 backend/payment-api、HEAD dbffd01、工作区干净，worktree 位置已核实。读取 AGENTS.md、本文、PRD 导出/证据要求、API-CONTRACT、ADR 0001/0004 后核对代码，继续导出核查。仅后端，真实模型持续跳过。
- 核查结果与修复详见 docs/EXPORT-REVIEW.md：JSON 与保存报告一致；旧 Markdown 漏掉证据 QuerySpec/列名/覆盖率/signal/note 与报告状态。新增 apps/api/src/report-export.ts，由原 export 路由调用，完整保留报告口径/状态/原始比较贡献/来源/trace，以及每条证据完整 JSON，自身子范围不再依赖报告总范围猜测。导出不重新查数或覆写报告。
- 进一步修复模板自身范围：退款原因事实明确本期、SKU/渠道/大区；活动假设与 SignalService note 明确 SKU/渠道匹配、包含全范围活动、无大区归因、仅本期或基期重叠。JSON/Markdown 共用同一保存的报告，不分别改写语义。
- 当前验证对象 dbffd01 加本次提交差异：npm run typecheck、npm test（75/75，0 跳过，49.08 秒）、npm run build 通过。生产代码未再变动，之后新增的旧版/转义专项单元 1/1 通过，最终 typecheck 再次通过；没有把该新增用例冒称为完整 npm test 的 76/76。tests/integration/report-export.test.ts 真实 PostgreSQL + Pi faux + HTTP：独立 SQL/手工预期确认总退款 350000 分、A 子范围 300000 分/2 事件；验证退款、活动子范围、partial、missing 的 JSON 与落库 DTO、Markdown 代码块与证据 GET 一致。
- 本轮全部修改归本会话，随修复提交：app.ts/report-export.ts、agent/report.ts、analytics/signals.ts、两个导出测试、API-CONTRACT、EXPORT-REVIEW 和本文；未改前端、冻结标签、历史报告，无新增依赖/DTO/迁移。临时数据库均正常停止，收尾以 git status 核实。
- 当前停留点：报告导出内容与证据范围切片完成。未重跑 240 次冻结评测、规模性能、socket smoke、浏览器 Markdown 渲染；真实模型/B/C、人工复核、前后端浏览器验收、视频/全新环境复现仍未完成。后续优先验证现有本地启动/备份恢复说明的实际复现缺口，不扩展 P1。

## 1. 职责、目录、分支和提交

- 负责后端、数据库、指标计算、Pi runtime、API、共享契约与后端验证/交付；不修改前端页面或 docs/progress-frontend.md。
- 工作目录 D:/llm/Commerce Lens-backend，分支 backend/payment-api。主 worktree D:/llm/Commerce Lens 的 main 在 25a18ec，由前端会话使用，未合入最新后端。
- 最近已提交实现 dbffd01（子范围解释与指标匹配）、f5cb3d5（库存解释引用/合池限制），此前 c4885cf 为三指标、信号、生命周期、离线评测、恢复，ec08b13 是支付金额初版，不能作为当前能力上限。
- 本轮开始 HEAD=dbffd01，git status --short 为空；修改范围与本次验证见顶部快照。最终提交自身用 git log -1 查询，不在文件中循环记录自身 hash。
- 用户当前要求：继续非外部真实 API 的后端工作；不等待前端页面。真实模型调用仍被排除，即使日后本机有 Key 也不能自动调用。公网部署不在当前范围。

## 2. 已完成功能与主要文件

| 功能 | 主要文件 |
|---|---|
| 三主指标、时间/筛选、比较/贡献/Top-N | packages/metrics/src/index.ts；packages/analytics/src/service.ts、query-compiler.ts、compare.ts；packages/agent/src/intent.ts |
| 库存、渠道大区流量、活动、退款原因 | packages/analytics/src/signals.ts；db/migrations/004-signals.sql |
| 证据/hash/范围/数值校验、模板事实和有限解释 | packages/agent/src/report.ts、tools.ts；packages/analytics/src/hash.ts |
| Pi 六工具、预算和重试 | packages/agent/src/pi.ts、budget.ts；packages/analytics/src/retry.ts |
| REST/SSE、同源限制、模式标识、导出 | apps/api/src/app.ts、report-export.ts |
| 持久化、owner/store 归属、幂等、会话/报告/证据 | apps/api/src/repository.ts；db/migrations/002-app.sql |
| 队列、取消、超时、重启中断、SQL 取消 | apps/api/src/runs.ts；packages/analytics/src/cancellation.ts |
| 删除会话、反馈、cursor 分页、30 天清理、SSE 410 | repository.ts、app.ts；db/migrations/003-session-lifecycle.sql |
| 复合键、数据版本不可变、发布校验、只读/RLS | db/migrations/001-business.sql；db/seeds/generate.ts |
| Windows 本地 PostgreSQL 18 与三角色连接 | scripts/local-postgres.ts、api-dev.ts、api-start.ts |
| S01—S12、冻结案例、独立 SQL | db/seeds/scenarios.ts；evals/cases/；evals/oracles/ |
| 评测/性能/真实 HTTP smoke | scripts/evaluate-offline.ts、benchmark-local.ts、verify-api.ts |
| 固定表白名单快照与空库恢复、源码包 | db/snapshot.ts；scripts/snapshot.ts、release.ts |

数据均为合成食品电商；CNY/Asia/Shanghai，业务时钟固定 2026-10-22。默认 signals-v1 有辅助信号；acceptance-v1 为小型人工验收集；固定种子支持 90 天 10 万订单/20 万行。API 主入口 paid_amount/refund_amount/sold_units，其他底层指标不代表已开放自然语言入口。

## 3. 验证结果与对应版本

### 上轮 dbffd01（历史，非本轮）

子范围库存/流量解释修复，ADR 0004；typecheck、npm test 72/72（0 跳过，44.85 秒）、build 通过。真实 PostgreSQL/Pi faux/HTTP 验证华东 A 增长、华北下降的反例，支持同范围正例，不把子范围观测当作其他范围的解释。当前导出切片验证见顶部，不能用本段代替。

### 上轮 f5cb3d5（历史，非本轮）

20 份保存报告经独立自动核查：总量/逐贡献与独立 SQL、结构/hash/引用检查通过，2 份库存解释漏引 contribution，详见 REPORT-REVIEW.md 与 report-review-2026-10-22T11-26-39-851Z.json。不是人工复核，历史报告与冻结标签未改。f5cb3d5 修复后 typecheck、npm test 64/64（0 跳过，40.84 秒）、build 通过；本轮不将其当作当前通过。

### 上一会话交接核验（历史，非本轮）

已核对 worktree、Git、实际文件与原始结果；本次未修改业务代码，验证对象为 c4885cf 的实现（交接前 HEAD=0bc9e9c）。2026-10-22 实际重新运行：npm run typecheck 通过；npm test 60/60 通过、0 跳过（约 44.2 秒）；npm run build 通过；node dist/scripts/verify-api.js 的真实 HTTP/SSE、25 个事件、断点重放与报告/证据持久化均通过，比较为 7000000/10000000 分，agentExecuted=false。最新 smoke 证据已重新生成在 evals/results/backend-api-smoke.json，随本次交接保存。

本次没有重跑 240 次离线案例或 10 万订单性能测试，下面明确保留为既往成绩，不冒充本次测量。没有外部模型请求。交接前后均检查本 worktree 未残留 PostgreSQL 进程。

### 既往验证（实现 c4885cf，文档 HEAD 0bc9e9c）

- typecheck、npm test 60/60（0 跳过）、build、node dist/scripts/verify-api.js 通过。真实 PostgreSQL 18.4 与 loopback socket；Pi Core 使用明确 faux transport，工具执行真实 SQL，不能当作 DeepSeek 验收。
- 120 案例，dev/frozen-test 各 60，family 隔离，冻结集三次，共 240/240。最新既往结果 evals/results/offline-2026-10-22T10-43-12-334Z.json；外部模型请求 0。audit-*.json 有 20 份自动审计样本，humanReviewCompleted=false。
- 10 万订单/20 万行、20 次预热+100 次本地 HTTP 测量：median 139.18 ms、P95 150.08 ms，记录 performance-2026-10-22T10-29-09-360Z.json。这是当时环境的确定性管线耗时，不是模型延迟或当前重测结果。
- 实际启动构建产物，三指标分别得到支付金额 7000000/10000000 分、退款 300000/0 分、件数 70/100；provenance.agentExecuted=false。12 场景 CLI 发布和备份 CLI 通过；恢复测试包含报告、反馈与活动任务中断。
- 源码包 .local/releases/commerce-lens-backend-c4885cf.zip：123 项，305683 bytes，SHA256 4461f472ffd3810cc1ed2512af558e926d857b226a197e77365e59a51a243078。它对应旧实现提交，不包含本次交接文档更新。

未验证：真实 DeepSeek 连通/多轮质量/价格/延迟、真实模型 B/C 基线、20 报告人工复核、前后端真实联调、演示视频与其他系统环境。不能声称完整 P0 已验收。

## 4. 进行中任务和停留点

导出内容/证据范围切片已完成，当前实现与验证见顶部快照；旧报告 2 份引用缺口仍保留，历史内容不会在导出时悄悄重新生成。下一会话先核对 Git，再按第 8 节处理明确的非模型证据缺口，不重新搭架构或重复抽样来凑通过。

## 5. 未提交修改、归属与进程

- 本轮开始后端 worktree 干净；本轮提交范围见顶部快照，全部为本会话成果。收尾后以 git status --short 核实，不 reset/clean 新出现的来源不明修改。
- 原目录 D:/llm/Commerce Lens 的前端未提交成果归另一会话；本轮没有读取或修改其页面/进度、暂存或清理，仅 git worktree list 读取分支位置。不能把 main 的 v1.0.0 文档视作当前后端。
- .local/.tools/node_modules/dist 为忽略文件；本地数据库、备份、少量历史失败临时库不入 Git。不要打印 .env 或 connection.env。本文不保存密钥或连接密码。
- API 不保证常驻，新会话需核对 3000/55432 端口和进程归属，不误停前端 Vite 或其他 worktree 服务。

## 6. 关键决定与原因

- 单 Agent、受控 QuerySpec；服务端注入权限/版本，模型没有 SQL/Shell/文件工具。确定性代码查数，金额整数分、退款成功时间、支付退款分开聚合；贡献可负或超过 100%。
- 核心数据门禁强制执行；模拟数据/确定性/真实 Agent 显式区分，供应商失败不自动伪装为演示成功。事实和解释从证据模板生成，有限规则不证明因果或损失。
- 数据集发布后不可变，报告证据不可覆写；取消/完成/保存锁同一 run，终态不可反转。SSE 先持久化，重放不重算。
- 单本地进程使用数据库 lease，2 执行+10 排队，60/min 请求限流；重启中断遗留任务，不自动重放调用。重试共用预算，隐藏 SDK 重试关闭，不增加消息队列或多 Agent。
- 备份限定固定表白名单、同迁移版本的空库恢复；冻结案例有 manifest，不删失败或原地改标签。历史取舍见 docs/decisions/0001-baseline.md、0002-payment-backend.md、0003-offline-backend-completion.md，后者更新前者的旧未完成项。

## 7. 已知问题、复现和阻塞

- 真模型验收延期且无调用授权；不要因 Key 可用就运行 verify:pi。无凭证不阻塞独立本地工作。
- 确定性解析只支持有限表达：用“数据异常”复现澄清，“今天支付金额”复现完整日拒绝，复杂问题使用 confirmedIntent；不是通用 NLP 泛化。
- SKU 排除转授权包含集合，剩余超过 20 项澄清不截断。大规模商品目录排除 SKU-01 触发限制，小数据“排除 A 呢？”应重查 B/C。
- 历史 Top-N 其他行因字段顺序导致 hash 失败，现新证据 sha256-canonical-json-v1 并兼容旧 hash；edge-cases.test.ts 有残差行→报告落库回归。不得删旧兼容逻辑。
- Windows Ctrl+C 曾同时终止 DB，现隐藏独立进程组、API/连接池先关闭再 pg_ctl wait；shutdown.test.ts 有并发关闭回归。PTY Ctrl+C exit 1 是信号退出，不宣称普通 exit 0。
- 自动报告样本不等于人工复核，尚不能声称双人审核。冻结评测是合成小样本，不夸大真实业务效果。
- 前后端未合并/真实联调；另一会话仍用 mock 和旧契约。发送跨会话消息需用户授权，文件交接本身不意味着可以发指令给另一个聊天。

## 8. 下一步优先级

1. 按 AGENTS.md 恢复，核对 Git/实际实现；优先处理真实复现的失败和非模型 PRD 验收缺口。不要重新搭建已完成模块，不重复大规模验证来凑进度。
2. 本轮已完成 20 报告独立自动核查、PRD 出口核对及 dev/专项修复，详见 REPORT-REVIEW.md。保留人工复核缺口，不能把自动核查重复改称人工完成；旧报告核查仍应报出 2 例 F1。
3. 库存/流量子范围解释和 Markdown/JSON 导出范围已验证，见 ADR 0004、EXPORT-REVIEW。下一步优先实际核查 BACKEND-QUICKSTART/DEMO 的本地构建启动、备份到空库恢复与构建产物复现证据；先识别未验证路径，不机械重跑通过的规模测试。真实模型/人工/前端/视频出口不由自动审计代填。
4. 若推进联调，先只读比较 main 与 backend/payment-api 的契约/根配置，给具体提交同步清单；不覆盖前端页面或未提交修改，不盲目合并。
5. 真模型与 B/C 评测持续延期，直到用户明确改变要求。前端/视频由其负责会话处理，不把这些当成本地工作的阻塞。

## 9. 前后端契约与同步

唯一契约 packages/contracts/src/index.ts（QuerySpec）、http.ts（HTTP 1.1.0），文档 docs/API-CONTRACT.md，样例 examples/payment-flow.json / schemas.json。沿用已有 DTO 与路由，不另起一套。

- 三主指标；金额 unit=fen、件数 unit=units，null 不显示为 0。phaseName 映射四个前端阶段；0—7 phase 不直接索引四项数组。
- Evidence.signal/hashAlgorithm 可选；Fact.templateId 新增 signal；hypothesis 含 missingEvidence 和可选 contradictingEvidenceIds；ReportDraft 可选 signalEvidenceIds，旧 provenance 1.0.0 可读取。证据数量可变、rows 原值未格式化。
- 本轮仅行为同步：库存供应约束假设现在引用 comparison、contribution、inventory 三类证据；仅单个下降 SKU 可获该解释，多 SKU 合池保留事实与 unknown；退款下降不解释为销售供应约束。原 QuerySpec/HTTP 1.1.0 schema、路由、迁移和依赖未变；API-CONTRACT.md 已说明 evidenceIds 不固定为两个。不向另一聊天发消息或自动合并。
- 子范围补充：渠道/大区筛选与指标证据不匹配时不生成库存/流量解释，但保留带实际范围的 facts 并增加 unknown；同集合不同顺序等价，SKU-only 流量仅为背景。仅文本与解释生成条件改变，不新增契约字段，见 ADR 0004。
- 本轮导出同步：Markdown 现为可独立阅读的完整证据导出，包含每条原 EvidenceDTO JSON 与报告状态/原始值/执行记录；机器消费仍用原 JSON。退款/活动文本补充范围和粒度限制。HTTP 1.1.0/QuerySpec/路由不变，无根依赖或迁移同步；见 API-CONTRACT 和 EXPORT-REVIEW。不自动合并前端或向其聊天发消息。
- DELETE /api/sessions/:id；POST /api/reports/:id/feedback；历史 cursor 在 X-Next-Cursor，原数组响应不变；SSE 过期 410 REPLAY_EXPIRED，details.reportUrl 可读最终报告。
- 迁移增加 003/004，不改旧 SQL。原目录 main 仅到 25a18ec，合并需审查 package.json、package-lock.json、tsconfig.json、.env.example；Fastify 5.12.7/API scripts 为后端引入，前端独立 package/lockfile 保留。
- 用 catalog 数据版本和字典，禁止发送 scenario/storeId/ownerId/SQL。前端 fixture nuts/oats、mall/live 不是后端 A/B/C、douyin 等授权 ID。
- 后端 AGENTS.md 已补恢复规则，尚未修改前端所在 main 的规则；其会话需自行同步“读职责进度/PRD/契约→核对 Git/代码→持续更新自己的进度”。本会话不并行编辑前端规则或进度。

## 10. 必要命令

```powershell
cd 'D:\llm\Commerce Lens-backend'
git status --short
git branch --show-current
git worktree list
git log -5 --oneline
. .\scripts\bootstrap-node.ps1
# 已有 Node 24 和可用 node_modules 时无需重复安装。
npm ci
$env:ANALYSIS_MODE='deterministic'
npm run api:dev
# http://127.0.0.1:3000/api/catalog；DB 127.0.0.1:55432；Ctrl+C 停止。
```

独立终端验证，不依赖已启动 API：

```powershell
. .\scripts\bootstrap-node.ps1
npm run typecheck
npm test
npm run build
node dist/scripts/verify-api.js
# 独立核查保存的旧报告（发现 2 项已记录 F1，预期非零退出；不改写旧报告）：
node --import tsx scripts/audit-report-samples.ts
# 仅在相关改动/失败/疑点需要时扩展：
npm run eval:offline
npm run benchmark:local
```

db:scenarios 需持久 DB；db:backup 输出 .local；db:restore 仅对明确指定的空库，DATABASE_URL/BACKUP_FILE 在本机配置；release:source 要求已提交且干净，旧 ZIP 不会随文档更新。详见 BACKEND-QUICKSTART.md、EVALUATION.md、DEMO.md。
