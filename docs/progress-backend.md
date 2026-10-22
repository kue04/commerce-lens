# 后端进度

2026-10-22。范围：后端、数据库、指标计算、Pi、API 和共享契约；不改前端页面。

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
