# 三指标后端复现

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

默认 catalog 选择 signals-v1，可把上述 session body 的 datasetVersion 改为 signals-v1，体验库存/流量/活动证据。问题还支持“昨天华东退款金额为什么上升？”、“昨天华东销量为什么下降？”。quantity 是支付件数，不扣后续退款；退款按成功时间，基期为零时变化率为 null。

创建场景演示库：后端启动时，在另一终端激活 Node 24 后 `npm run db:scenarios`，发布 S01—S12 场景。GET catalog.datasets 获取版本，然后 POST sessions 选择 scenario-S03-v1（缺货观测）、scenario-S08-v1（核心数据延迟）等。场景标签只存在评测目录，不写入 Agent 可读业务表。

预期 current=7000000、baseline=10000000、delta=-3000000、changeRate=-0.3，金额单位分。provenance.executionMode=deterministic、agentExecuted=false。证据由 order_items 聚合生成，无库存表时不提供缺货原因。

POST run 可以携带已确认的 QuerySpec（见 packages/contracts/examples/payment-flow.json.analysisRequest）。该结构不能携带店铺、用户、数据版本或 SQL。未知筛选、不完整日期和不支持指标会产生失败终态；缺少明确口径则 needs_clarification，需用 parentRunId 新建任务。

```powershell
npm run typecheck
npm test
npm run build
node dist/scripts/verify-api.js
npm run verify:pi
```

离线评测：`npm run eval:offline`，无需 Key，120 案例按模板族分 dev/frozen-test，冻结集重复三次，共 240 次执行。它衡量确定性解析/工具链，不能写作真实模型准确率。所有运行结果按时间单独保存，不覆盖冻结案例或历史失败。人工复核材料另存 audit-*.json，automated 标记不等于人工已审核。

备份：在 API 所在目录另一终端执行 `npm run db:backup`，生成 `.local/backups/*.json`，不含连接密码/Key，但含会话问题和报告，应自行保管。恢复时连接已迁移的空 PostgreSQL，设置 DATABASE_URL 和 BACKUP_FILE 后 `npm run db:restore`。备份校验 hash 仅保证内容一致性，不代替来源信任；禁止导入不可信来源，禁止恢复到现有数据库。CLI 不执行任意备份 SQL。代码升级失败时停止 API、切回兼容版本再重启；已执行迁移不向下撤销，数据库回退应另建空库恢复备份。

verify-api 自动验证真实 loopback HTTP、SSE、Last-Event-ID 重放以及落库的报告/证据，结果写 evals/results/backend-api-smoke.json。测试中明确的 faux provider 只验证 Pi Core 与真实 SQL 工具的集成，不发送网络模型请求。

连接已有 PostgreSQL 18 时，用迁移账号单独执行 db:migrate，用只读账号配置 READONLY_DATABASE_URL、状态写入账号配置 APP_DATABASE_URL，然后 api:start。应用不会用迁移管理员连接处理请求。只读角色继承 commerce_reader；状态写入角色继承 commerce_app。两个角色均不应为 superuser、表 owner 或 BYPASSRLS。
