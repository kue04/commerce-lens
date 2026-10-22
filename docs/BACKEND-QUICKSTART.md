# 支付金额后端复现

在 D:/llm/Commerce Lens-backend 运行，使用 Node 24。首次先激活项目内 Node 并安装锁定依赖，之后 api:dev 会自动管理开发 PostgreSQL、迁移、数据发布和 API 生命周期。

```powershell
. .\scripts\bootstrap-node.ps1
npm ci
npm run api:dev
```

另一 PowerShell 终端：

```powershell
$catalog = Invoke-RestMethod 'http://127.0.0.1:3000/api/catalog'
$session = Invoke-RestMethod 'http://127.0.0.1:3000/api/sessions' -Method Post -ContentType 'application/json' -Body '{"datasetVersion":"acceptance-v1"}'
$body = @{ question = '昨天华东支付金额为什么下降？' } | ConvertTo-Json
$started = Invoke-RestMethod "http://127.0.0.1:3000/api/sessions/$($session.sessionId)/runs" -Method Post -ContentType 'application/json' -Headers @{ 'Idempotency-Key' = [guid]::NewGuid().ToString() } -Body $body
# 请求会持续到 run.finished；生产客户端应逐帧处理 SSE，而不是等整个响应结束。
$events = Invoke-WebRequest "http://127.0.0.1:3000$($started.eventsUrl)"
$run = Invoke-RestMethod "http://127.0.0.1:3000/api/runs/$($started.runId)"
$report = Invoke-RestMethod "http://127.0.0.1:3000/api/reports/$($run.reportId)"
$report.comparison
$report.provenance
```

预期 current=7000000、baseline=10000000、delta=-3000000、changeRate=-0.3，金额单位分。provenance.executionMode=deterministic、agentExecuted=false。证据由 order_items 聚合生成，无库存表时不提供缺货原因。

POST run 可以携带已确认的 QuerySpec（见 packages/contracts/examples/payment-flow.json.analysisRequest）。该结构不能携带店铺、用户、数据版本或 SQL。未知筛选、不完整日期和不支持指标会产生失败终态；缺少明确口径则 needs_clarification，需用 parentRunId 新建任务。

```powershell
npm run typecheck
npm test
npm run build
node dist/scripts/verify-api.js
npm run verify:pi
```

verify-api 自动验证真实 loopback HTTP、SSE、Last-Event-ID 重放以及落库的报告/证据，结果写 evals/results/backend-api-smoke.json。测试中明确的 faux provider 只验证 Pi Core 与真实 SQL 工具的集成，不发送网络模型请求。

连接已有 PostgreSQL 18 时，用迁移账号单独执行 db:migrate，用只读账号配置 READONLY_DATABASE_URL、状态写入账号配置 APP_DATABASE_URL，然后 api:start。应用不会用迁移管理员连接处理请求。只读角色继承 commerce_reader；状态写入角色继承 commerce_app。两个角色均不应为 superuser、表 owner 或 BYPASSRLS。
