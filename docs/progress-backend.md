# Commerce Lens 后端交接快照

更新：2026-10-22，Asia/Shanghai。新会话先读根 AGENTS.md；本文保留当前有效状态，历史细节查 Git，不继续追加聊天流水账。

## 1. 职责、目录、分支和提交

- 负责后端、数据库、指标计算、Pi runtime、API、共享契约与后端验证/交付；不修改前端页面或 docs/progress-frontend.md。
- 工作目录 D:/llm/Commerce Lens-backend，分支 backend/payment-api。主 worktree D:/llm/Commerce Lens 的 main 在 25a18ec，由前端会话使用，未合入最新后端。
- 最近实现提交 c4885cf（三指标、信号、生命周期、离线评测、恢复）；此前 ec08b13 是支付金额初版，不能作为当前能力上限。
- 本次交接开始 HEAD=0bc9e9c（源码包证据记录），git status --short 为空。业务代码与 c4885cf 一致。本次修改 AGENTS.md、本文，以及验证脚本重新生成的 evals/results/backend-api-smoke.json；交接提交自身用 git log -1 查询，不在文件中循环记录自身 hash。
- 用户当前要求：继续非外部真实 API 的后端工作；不等待前端页面。真实模型调用仍被排除，即使日后本机有 Key 也不能自动调用。公网部署不在当前范围。

## 2. 已完成功能与主要文件

| 功能 | 主要文件 |
|---|---|
| 三主指标、时间/筛选、比较/贡献/Top-N | packages/metrics/src/index.ts；packages/analytics/src/service.ts、query-compiler.ts、compare.ts；packages/agent/src/intent.ts |
| 库存、渠道大区流量、活动、退款原因 | packages/analytics/src/signals.ts；db/migrations/004-signals.sql |
| 证据/hash/范围/数值校验、模板事实和有限解释 | packages/agent/src/report.ts、tools.ts；packages/analytics/src/hash.ts |
| Pi 六工具、预算和重试 | packages/agent/src/pi.ts、budget.ts；packages/analytics/src/retry.ts |
| REST/SSE、同源限制、模式标识、导出 | apps/api/src/app.ts |
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

### 本次交接核验

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

本次会话恢复机制已完成，验证已通过。业务功能已提交，没有半个未完成的业务功能；本文替换旧进度中互相冲突的新旧状态，AGENTS.md 增补恢复与持续更新规则，smoke 证据同步保存。停留点为交接提交后结束；下一会话先核实 Git，再从第 8 节的非模型审查/验收缺口继续，不重新搭架构。

## 5. 未提交修改、归属与进程

- 交接开始后端 worktree 干净；本次提交范围仅 AGENTS.md、本文和重新生成的 evals/results/backend-api-smoke.json，全部为本会话交接/验证成果。三文件收尾提交后应无未提交修改；新会话以 git status --short 为准，若有新增修改先识别来源。
- 原目录 D:/llm/Commerce Lens 有 `?? apps/`、`?? docs/progress-frontend.md`，属于前端会话；本会话未修改、暂存或清理。该目录不含最新后端，不能把其 v1.0.0 文档视作当前后端。
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
2. 独立审查 audit-*.json 中 20 份报告的事实/假设/unknown、范围和证据，记录可核查结论；修复先在 dev 或专项回归，冻结标签不得修改。
3. 核对 PRD 第一部分验收、第三部分契约、第五部分出口条件，列出尚有证据缺口，选最早未完成且收益明确的小切片。不能把“继续”解释为扩展 P1。
4. 若推进联调，先只读比较 main 与 backend/payment-api 的契约/根配置，给具体提交同步清单；不覆盖前端页面或未提交修改，不盲目合并。
5. 真模型与 B/C 评测持续延期，直到用户明确改变要求。前端/视频由其负责会话处理，不把这些当成本地工作的阻塞。

## 9. 前后端契约与同步

唯一契约 packages/contracts/src/index.ts（QuerySpec）、http.ts（HTTP 1.1.0），文档 docs/API-CONTRACT.md，样例 examples/payment-flow.json / schemas.json。沿用已有 DTO 与路由，不另起一套。

- 三主指标；金额 unit=fen、件数 unit=units，null 不显示为 0。phaseName 映射四个前端阶段；0—7 phase 不直接索引四项数组。
- Evidence.signal/hashAlgorithm 可选；Fact.templateId 新增 signal；hypothesis 含 missingEvidence 和可选 contradictingEvidenceIds；ReportDraft 可选 signalEvidenceIds，旧 provenance 1.0.0 可读取。证据数量可变、rows 原值未格式化。
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
# 仅在相关改动/失败/疑点需要时扩展：
npm run eval:offline
npm run benchmark:local
```

db:scenarios 需持久 DB；db:backup 输出 .local；db:restore 仅对明确指定的空库，DATABASE_URL/BACKUP_FILE 在本机配置；release:source 要求已提交且干净，旧 ZIP 不会随文档更新。详见 BACKEND-QUICKSTART.md、EVALUATION.md、DEMO.md。
