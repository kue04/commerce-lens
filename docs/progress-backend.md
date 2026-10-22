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

## 当前验证与阻塞

契约生成脚本已从真实 PostgreSQL 得到 100000→70000 元，SDK/provider 导入检查通过。当前未提供 DeepSeek Key，真实模型未验证；不伪造 Agent 结果。HTTP 路由仍在实施中，契约提交本身不表示接口可连接。

## 最新推进顺序（用户 2026-10-22 确认）

先由前端会话完成页面，再开发逻辑内容。当前暂停新增后端/API/Agent 实现，仅保留已验证的 M0/M1 和已提交的契约。未创建 HTTP 服务，不提供虚构联调地址，不修改 apps/web。用户确认页面可进入逻辑联调后再继续。

## 下一步（页面完成后）

以单个支付金额切片提供 Fastify API、PostgreSQL 持久化 run/report/evidence、真实查询和 SSE，再接同一受控工具层的 Pi 模式。每个可用接口通过实际集成测试后记录路径、字段和提交。
