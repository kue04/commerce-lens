# Commerce Lens

电商经营数据异常分析 Agent 求职作品集，当前已实现 **M0/M1 数据基础与支付金额后端 API 切片**。合成食品电商数据，CNY，Asia/Shanghai，固定演示业务时钟 2026-10-22。本地运行；本后端 worktree 不修改前端。

默认模式执行真实 PostgreSQL 查询，明确**没有执行 Agent 或调用模型**。已提供 Fastify API、任务/报告/证据持久化与 SSE，以及可配置的 Pi + DeepSeek 实现。Pi Core 使用测试传输的工具闭环已验证，真实 DeepSeek 凭证不可用，未声称真实供应商闭环通过。最新进度见 [docs/progress-backend.md](docs/progress-backend.md)，数据阶段记录见 [docs/PROGRESS.md](docs/PROGRESS.md)，实施基线见 [docs/PRD.md](docs/PRD.md)。

## 启动支付金额 API

在独立后端目录 D:/llm/Commerce Lens-backend：

```powershell
. .\scripts\bootstrap-node.ps1
npm ci
npm run api:dev
```

访问 http://127.0.0.1:3000/api/catalog。该命令自动启动持久 PostgreSQL（127.0.0.1:55432）、迁移并发布小型验收数据，不需要单独运行 db:start。Ctrl+C 停止服务；下次启动保留报告与证据。不要同时启动同一目录的 db:start，或在原前端目录再启动另一个后端。

```powershell
# 另一个终端：自动启动临时数据库 + 空闲 HTTP 端口，执行真正的 HTTP 与 SSE 验证
npm run verify:api
```

完整请求/响应和与前端同步的字段见 [docs/API-CONTRACT.md](docs/API-CONTRACT.md)；最小 PowerShell 示例见 [docs/BACKEND-QUICKSTART.md](docs/BACKEND-QUICKSTART.md)。

真实模型模式：在本 worktree 的 .env 配置 DEEPSEEK_API_KEY、DEEPSEEK_MODEL、ANALYSIS_MODE=agent 后再启动；没有 Key 或 modelId 时拒绝启动，不自动回退。API 仅支持 paid_amount。没有提供真实模型凭证时，不把无 Key 的启动或测试当作 Agent 供应商验收。

## Windows 快速复现

在本目录打开 PowerShell 7：

```powershell
. .\scripts\bootstrap-node.ps1
npm ci
npm run demo
```

bootstrap 仅下载已校验的 Node 24 到 .tools，并在当前 shell 激活；已有 Node 24 可省略。npm ci 安装开发用原生 PostgreSQL 二进制；首次联网下载需要时间。无需安装 Docker 或配置模型 Key。

demo 自动创建临时本地数据库、执行 SQL migrations、发布手工可核对的合成明细、用只读角色查询，并在 finally 中停止和删除本次临时集群。输出显示支付金额从 100000 元下降至 70000 元，A 减少 40000 元、B 增加 10000 元，带结果 hash、窗口和版本。该结果来自查询，不是预设问答文本。

```powershell
npm run typecheck
npm test
npm run build
node dist/scripts/demo.js
npm run verify:pi
npm run verify:scale
```

测试使用真实 PostgreSQL 18，无数据库时不会静默跳过。verify:scale 为两个 seed 分别生成并发布 90 天 10 万订单/20 万订单行，核对六指标与独立 SQL、贡献守恒、可复现性，结果保存 evals/results/m1-scale.json。它不是模型评测，也不代表 P95 达标。

## 使用持久数据库

```powershell
# 终端 1（先激活 Node 24）
npm run db:start
# 终端 2（同样激活 Node 24）
npm run db:migrate
npm run db:seed
```

开发集群监听 127.0.0.1:55432。随机生成的管理员/只读连接存放 .local/connection.env，脚本自动读取；不要提交或复制到前端。Ctrl+C 停止，数据保存在 .local/postgres。已有版本不会覆盖；需要另一份数据时在终端 2 设置 `$env:SEED='2026'` 后再 seed。也可通过进程环境变量 DATABASE_URL 指向已有 PostgreSQL 18 的迁移账号，schema migration 需要建角色权限；分析服务应使用独立只读连接。

## 模型配置

复制 .env.example 为 .env，将 DEEPSEEK_API_KEY 和 DEEPSEEK_MODEL 配置在本机后运行 npm run verify:pi。未配置 Key 时仅验证固定版本 Pi SDK 与 DeepSeek provider，并明确打印 SKIPPED；配置 Key 时执行一次限 16 输出 tokens、15 秒超时的最小连通调用，不验证业务工具闭环。具体模型 ID 需在固定 Pi 版本目录且账号可用，不能仅凭模型名称推断已连通。不要将 Key 放入 VITE_*。

## 实现结构

- packages/contracts：QuerySpec 运行时 schema、错误与安全整数。
- packages/metrics：指标目录、完整日与上海时区边界。
- packages/analytics：受控 SQL 编译、数据门禁、比较与贡献。
- db：版本化 migrations、合成明细与事务发布。
- scripts：本地数据库生命周期、演示、SDK 和规模验证。
- tests、evals/oracles：人工预期、真实数据库测试与独立 SQL。
- apps/api：Fastify 支付分析 API、任务执行与持久化仓库。
- packages/agent：Pi runtime、运行预算、受控工具、模板化报告验证。
- apps/web：由另一个会话负责，本后端 worktree 不包含页面实现。

设计取舍、查询权限与数据版本语义见 docs/decisions/0001-baseline.md 与 0002-payment-backend.md。当前不提供 npm run dev 页面；使用 api:dev 启动本地后端。
