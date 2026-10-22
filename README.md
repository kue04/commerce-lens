# Commerce Lens

电商经营数据异常分析 Agent 求职作品集，当前已实现 **M0/M1 环境与确定性数据计算**。合成食品电商数据，CNY，Asia/Shanghai，固定演示业务时钟 2026-10-22。本地运行；前端由用户在 apps/web 同步开发。

当前演示执行真实 PostgreSQL 查询，但**没有执行 Agent 或调用模型**。Pi + DeepSeek、Fastify API、报告持久化将在后续阶段接入。进度和验收边界见 [docs/PROGRESS.md](docs/PROGRESS.md)，实施基线见 [docs/PRD.md](docs/PRD.md)。

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
- apps/web：用户负责的前端目录；HTTP 接口尚未提供。

设计取舍、查询权限与数据版本语义见 docs/decisions/0001-baseline.md。当前不提供 npm run dev 页面，后端 HTTP 服务尚未建立。
