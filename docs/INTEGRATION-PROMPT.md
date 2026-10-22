# 新窗口提示词

以下正文可直接粘贴为新窗口首条消息。请把工作目录设为 D:/llm/Commerce Lens；前端未提交文件只在原目录存在。

请实际连接 Commerce Lens 前后端，先完成可验证的支付金额切片，不只给计划。

主目录 D:/llm/Commerce Lens（前端 apps/web，main，HEAD 25a18ec，前端成果及 docs/progress-frontend.md 尚未入 Git，必须保护原目录）。后端目录 D:/llm/Commerce Lens-backend（backend/payment-api，最近业务提交 6411a0b；最新交接提交以 git log -1 为准）。

先读两边适用的 AGENTS.md、docs/progress-frontend.md、后端 docs/progress-backend.md、docs/INTEGRATION-HANDOFF.md、docs/API-CONTRACT.md，再读 PRD 相关验收和必要 ADR；核对两个 worktree 的 git status、分支、最近提交、端口与实际代码。以前端工作目录的旧后端文档或旧进度不能覆盖最新用户指令。

我现在授权本地真实前后端联调，前端旧进度中“暂缓联调”已经过时。保持现有视觉、mock 功能和未提交成果，只修改 adapter 与接入必须的兼容逻辑。不要 reset/clean、覆盖前端文件、复制整个 apps、盲目合并后端分支或添加 P1。若另一会话正在改同一文件，先避免并发冲突。

保持双目录独立运行。按 INTEGRATION-HANDOFF 的文件清单审查并同步后端 HTTP 1.1.0 共享契约，沿用 QuerySpec、现有 DTO 和已有 /api 代理。特别核对前端旧 schema、units 拒绝、库存池聚合语义、固定 E03、SSE 410 恢复、mock ID 与 catalog 不含完整字典等差异；不能放宽校验掩盖失败。

禁止调用 DeepSeek 或其他真实外部模型，即使发现凭证。启动后端前显式设置 ANALYSIS_MODE=deterministic；可用真实本地 PostgreSQL、HTTP/SSE 和明确标识的 faux-provider 测试。真实服务失败不能静默回 mock，模型 Key/DB URL 不进浏览器，页面应标识合成数据、确定性计算和未执行 Agent。

第一切片：真实浏览器普通输入“昨天华东支付金额为什么下降？”→真实 session/run/SSE→报告、证据、刷新恢复与 JSON/Markdown 下载。signals-v1 预期本期 7000000、基期 10000000、delta -3000000 分，A -4000000、B +1000000，agentExecuted=false。证据抽屉按各自 QuerySpec/columns/rows/signal 展示；库存 24/24 池小时、零库存 10 小时，不能反推具体缺货时段。假设引用实际 evidenceIds。保留既有前端生命周期回归。

这条链路通过后再逐片验澄清/追问、退款/件数和失败恢复，别一次性重做页面。首次必须有真实浏览器→Vite→Fastify→PostgreSQL 的证据；网络拦截样例不算联调。按改动运行前端 typecheck/test/e2e/build；若改后端则运行相应门禁。每片和停止/结束前更新职责进度及联调结果，区分当前与历史、通过与失败及未运行。先简述核实状态与本轮具体范围，然后直接执行。
