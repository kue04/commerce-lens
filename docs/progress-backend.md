# 后端进度

2026-10-22。范围：后端、数据库、指标计算、Pi、API 和共享契约；不改前端页面。

## 最新交付：除外部真实模型调用之外的本地后端

本节更新此前支付金额切片的历史记录。本轮始终在 D:/llm/Commerce Lens-backend、backend/payment-api 分支开发，未修改/合并前端工作目录。本轮没有调用 verify:pi 或任何外部模型接口，也未读取本机其他会话的凭证。

本轮可接入实现提交 c4885cf。源码包已实际生成并检查：.local/releases/commerce-lens-backend-c4885cf.zip，123 个归档项、305683 bytes，SHA256 4461f472ffd3810cc1ed2512af558e926d857b226a197e77365e59a51a243078；包含已提交的代码/契约/案例/验证结果，不包含 .env、.local、node_modules、数据库凭证或模型 Key。该包对应实现提交，后续纯进度记录不在该包中。

### 按优先级完成

1. 生命周期与可靠性：DELETE session 先取消运行再删除关联数据；报告反馈、历史 cursor 分页、每日/启动时 30 天保留清理；过期 SSE 返回 410 和 reportUrl；同身份实例锁、60/min 任务请求限流、2 个执行+10 个排队、取消/完成竞态、实际 SQL 取消。
2. 三个主指标：paid_amount、refund_amount、sold_units 的自然语言有限规则入口、确定性比较/贡献/报告；退款按 succeeded_at、多次部分退款、件数不扣退款；授权 SKU 排除展开，超过 20 项澄清，重新查询。
3. 信号与解释：inventory_hourly/traffic_daily/promotion_events 新表与 RLS/不可变保护；库存覆盖和零库存观测、渠道×大区背景流量/归因版本、活动范围匹配、退款原因码与 unknown；缺观测不补零。事实和最多三个可能解释均由受控证据模板生成，附缺失信息与反证字段，不做因果损失估计。
4. 重试与预算：SQL 暂时错误最多一次重试；Pi 429/500/502/503/504 最多一次额外请求，仍消耗统一时间/调用/token/成本预算；参数/权限不重试。实际 faux-provider 测试验证重试，不访问 DeepSeek。
5. 评测与性能：S01—S12 明细场景；120 案例、dev/frozen-test 各 60，family 隔离，冻结集重复三次，总计 240 执行。独立 SQL 固定预期、manifest hash 防止原地更改；逐例结果与 20 份自动审计样本保存，不声称人工已审。10 万订单、20 次预热后 100 次真实 loopback HTTP 性能测量。
6. 本地交付：已迁移空库的固定白名单一致性备份恢复；恢复活动任务为 interrupted，非空库拒绝覆盖，恢复前校验内容/迁移 hash；源码 ZIP 生成命令、启动/恢复/回滚说明、三分钟后端演示和面试问答。

### 实际验证

- 最新完整测试 60/60 通过、0 跳过；真实 PostgreSQL 18.4，包括数据库、HTTP、Pi Core+faux、生命周期、信号、备份恢复和正常关闭。类型检查、构建、真实 socket HTTP/SSE/replay 通过。
- 冻结案例执行 240/240 通过，外部模型请求为 0；最新结果 evals/results/offline-2026-10-22T10-43-12-334Z.json，四次完整运行结果全部保留。只衡量确定性解析与查询/证据链，不是模型准确率。
- 10 万订单/20 万行、本地单用户、真实 HTTP，20 次预热+100 次测量：median 139.18 ms、P95 150.08 ms；不含模型等待，不作为 PRD 真实 Agent 延迟。原始 times 与环境见 performance-2026-10-22T10-29-09-360Z.json。
- 构建产物 api-dev 实际启动，catalog 1.1.0/default signals-v1，三个问题分别返回支付金额 7000000/10000000 分、退款金额 300000/0 分、支付件数 70/100；证据/解释数分别 5/3、3/0、5/3。所有 provenance.agentExecuted=false。测试会话已通过 DELETE 删除。
- db:scenarios CLI 实际发布 12 个数据版本，catalog.datasets 验证 12 项；db:backup CLI 实际生成 .local/backups/2026-10-22T10-44-39-782Z.json 并输出 hash。备份只保留本地，不入 Git；恢复库测试同时验证已存报告/反馈和信号明细恢复。
- 一次性能测试因 Top-N 其他残差行属性顺序导致 hash 不一致而失败，未记作通过；新增残差行端到端回归，新证据 sha256-canonical-json-v1，并兼容旧 hash。源码/进度保留失败原因。
- Windows 手工 Ctrl+C 曾同时终止附属 PostgreSQL，导致 lease 解锁报连接错误；本地启动器改为独立隐藏进程组，先关闭 API/连接池，再 pg_ctl wait。实际 Ctrl+C 重测无错误堆栈，管理测试也覆盖并发关闭。PTY 工具将 Ctrl+C 记为 exit 1，不把此信号退出码当作普通程序 exit 0。

### 需要接口使用方同步

共享契约从原文件兼容升级至 1.1.0：Report.unit 支持 fen/units；Evidence.signal、hashAlgorithm 可选；Fact.templateId 增加 signal；hypotheses 可包含 contradictingEvidenceIds；ReportDraft 可选 signalEvidenceIds。旧报告 provenance 1.0.0 仍可读取。迁移增加 003/004，旧 migration 不改写。GET catalog.supportedMetrics 显示三个主入口。

新增接口：DELETE /api/sessions/:id →204；POST /api/reports/:id/feedback →201 feedbackId；GET /api/sessions?limit=&cursor= 返回原数组，下一游标在 X-Next-Cursor；SSE 过期回放 →410 REPLAY_EXPIRED，可用 details.reportUrl 读取已存报告。

根依赖没有新增，增加 scripts：db:scenarios、db:backup、db:restore、eval:offline、benchmark:local、release:source。启动仍 npm run api:dev。细节 docs/API-CONTRACT.md、BACKEND-QUICKSTART.md、EVALUATION.md、DEMO.md。

### 明确延期/限制

用户要求排除的真实 DeepSeek 连通、多轮模型质量、B/C 基线对比和真实模型价格/延迟未运行；人工 20 份复核待执行（已备样本）、前端页面/端到端视频由另一个会话负责，公网部署已不在范围。因此不宣称整份 P0 已验收或完整作品集视频已完成。

后端可用的有限自然语言解析不覆盖任意电商问题；复杂表达可用 confirmedIntent 或返回澄清，不能称为无模型 NLP 泛化。备份是本项目固定 schema 的逻辑快照，仅恢复到同迁移版本的空库，不能替代企业数据库通用备份系统。

## 并行隔离

已通过 Codex 会话列表确认前端与本会话起初都在 D:/llm/Commerce Lens；原目录没有 Git 仓库。已仅提交本会话的 M0/M1 后端成果为基线 cef46cc，apps/web 保持未跟踪、未清理、未纳入提交。独立 worktree 为 D:/llm/Commerce Lens-backend，分支 backend/payment-api；原目录 main 供前端继续工作。禁止 reset/clean 或覆盖对方未提交内容。

## 已完成

- M0/M1：17 项测试通过、真实 PostgreSQL 18.4、两 seed 的 90 天 100000 订单/200000 行验证通过。详情 docs/PROGRESS.md。
- 持久数据库实际启动、db:migrate、db:seed 已通过，固定种子 42 的 100000 订单/200000 行已保存在原目录 .local/postgres；凭证在忽略的 .local/connection.env，未提交。当前测试结束已停库。
- 共享 HTTP 契约 v1.0.0：沿用 QuerySpec，覆盖分析请求、运行状态、报告、证据、统一错误及可重放 SSE 事件；尽量兼容现有前端 adapter 结构。
- examples/payment-flow.json 为真实 PostgreSQL 计算后生成并 schema 验证的样例；examples/schemas.json 可供前端脱离 TS 工程消费。

## 契约差异与同步

详见 docs/API-CONTRACT.md：新增 phaseName、provenance、fact valueRefs；phase 数字 0—7 需映射前端四个展示阶段；Evidence rows 为未格式化数值分；证据数量可变；服务端字典与前端 fixture 分离。根 Fastify 依赖/API 启动 scripts 在后续接口提交引入；当前前端独立 package 配置保持原状。

## 当前已完成的可联调切片

用户已明确恢复后端独立推进，撤销此前等待前端页面的顺序；本会话持续只负责后端。本轮支付金额接口实现沿用契约提交 0c9d3b2，代码位于 backend/payment-api 分支。

可接入的后端实现提交：ec08b13（feat(api): deliver persisted payment analysis with SSE and bounded Pi tools）。在独立 worktree 验证与提交，尚未合入前端所在 main；联调可直接启动该 worktree API，合并时先审查根配置差异。

| 可用接口 | 字段与实际验证 |
|---|---|
| GET /api/catalog、/api/health/live、/api/health/ready | 数据集、时钟、mode、支持指标；实际 HTTP 验证 |
| POST /api/sessions、GET /api/sessions | datasetVersion→sessionId，历史报告；真实 PostgreSQL 与 owner/store 过滤 |
| POST /api/sessions/:id/runs | question/confirmedIntent?/parentRunId?，必需幂等键；202 runId/status/eventsUrl；JSON 字段顺序不影响去重，冲突 409 |
| GET /api/runs/:id、POST /api/runs/:id/cancel | RunSchema；终态不可覆盖，超时/取消/重启中断测试 |
| GET /api/runs/:id/events | RunEventSchema，数据库持久化 seq，Last-Event-ID 重放；真实 socket 验证 |
| GET /api/reports/:id、GET /api/evidences/:id | ReportSchema/EvidenceSchema，金额分；真实工具结果、hash 与引用校验，刷新/重建服务后保留 |
| GET /api/reports/:id/export?format=md/json | 与报告一致的导出；模拟数据和执行模式标识 |

- 新增 002-app migration：session/run/event/evidence/report 持久化，应用状态连接只允许 app schema，与业务只读查询连接分离。
- 必须执行的数据质量门禁、只读查询、模板事实、规则提示、比较/贡献守恒。当前信号缺失时保持 unknown；没有编造库存或流量。
- 任务墙钟/模型次数/工具次数/token/成本预算，单会话并发、总队列上限、重复工具缓存、取消和完成串行化。
- AbortSignal 传播到 PostgreSQL：同只读账号执行 pg_cancel_backend，等待取消完成后再归还连接；测试实际观察到阻塞查询并验证取消后连接可复用。
- Pi 1.4.0 实际 Agent Core + 六个受控工具已接入；显式 faux provider 测试工具选择、真实 SQL、错误报告引用和一次修订，测试不访问 DeepSeek。
- 当前默认 ANALYSIS_MODE=deterministic；有限语句解析可澄清与追问重新计算。agent 模式需要本机 Key 与 modelId，不可用时拒绝启动，不自动降级。

## 验证结果

- npm run typecheck：通过。
- npm test：39/39 通过，0 跳过。包括真实 PostgreSQL 数据测试、Fastify 接口、owner/store 隔离、预算和 Pi Core + faux transport。
- npm run build：通过。
- node dist/scripts/verify-api.js：真实 loopback HTTP/SSE、Last-Event-ID 重放、报告与证据落库全部通过；16 条事件。原始结果保存 evals/results/backend-api-smoke.json，明确 agentExecuted=false。
- npm run api:dev：已实际启动 127.0.0.1:3000；通过 PowerShell 发起 question-only 分析，SSE 完成后取回 current=7000000、baseline=10000000、completed 报告；已正常停止，最终不依赖残留后台服务。
- DeepSeek 实际网络和业务工具闭环：未运行，无凭证。不能把 faux provider 或确定性接口测试写作真实模型通过。

曾有一轮业务断言通过但 Windows 临时目录清理 EBUSY，未计为成功。后续修复为 pg_ctl fast/wait 等待整个集群关闭、短暂文件占用有界重试，重新完整执行测试与 HTTP 验证通过。失败轮遗留的四个随机临时目录留在忽略的 .local 下，不影响后续；未清理其他会话的文件。详见 ADR 0002。

## 启动与同步

仅在 D:/llm/Commerce Lens-backend 执行：激活 Node 24 → npm ci → npm run api:dev。该命令自动启动本 worktree 的持久 PostgreSQL，迁移并发布 acceptance-v1。已有独立数据库可配置 APP_DATABASE_URL 与 READONLY_DATABASE_URL 后 api:start。完整示例 docs/BACKEND-QUICKSTART.md。

共享 schema 仍为 http.ts v1.0.0。根新增 Fastify 5.12.7、api:dev/api:start/verify:api/contracts:examples，tsconfig include apps/api；.env.example 新增 APP_DATABASE_URL、ANALYSIS_MODE。前端联调只需请求 /api，按 phaseName 映射展示阶段、按分格式化金额、读取 provenance、允许可变证据数量；不要提交 scenario 或服务端权限字段。根配置合并后 npm ci，不能覆盖前端独立 package/lockfile。

## 未完成与下一步

真实 DeepSeek Key/modelId 配置后，先完成真实供应商最小调用与至少十个支付场景的端到端工具验收。当前只完成支付金额可联调切片，尚未完整满足 M2/M3：没有库存真实信号、完整开放假设、会话删除/feedback、cursor 分页或 30 天保留清理。模型 429/5xx 一次退避重试尚未实现，SDK 隐藏重试已关闭，避免绕过预算。

随后再增加退款/销量主入口和辅助信号，最后冻结集/基线/重复模型评测。未测得 85% 模型完成率、45 秒 P95 或真实模型成本，不能宣称 P0 已完成。详细范围和取舍见 docs/decisions/0002-payment-backend.md。
