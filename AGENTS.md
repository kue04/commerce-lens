# Commerce Lens 开发规则

先读 docs/PROGRESS.md 确认当前已验收阶段；实现业务或调整验收时读取 docs/PRD.md 与 docs/decisions/0001-baseline.md。用户在本会话确认的本地求职作品集范围优先于原 PRD 的公网发布要求。

计算层仅使用规范化 QuerySpec、绑定参数和服务端权限上下文。模型工具不接受 storeId、ownerId、数据版本、SQL 或可执行代码。金额以安全整数分计算，退款按成功时间，支付与退款分别聚合；数据质量门禁在查询服务内强制执行。

每轮完成一个可验证切片。关键数值使用手工预期值和独立 SQL oracle 核对；数据库集成测试使用真实 PostgreSQL。以 package.json 中的命令完成类型检查、相关测试和构建后，更新 docs/PROGRESS.md；未运行的验证明确标记。

模型凭证只从环境变量读取。无 Key 的检查不得声称真实模型链路通过；模拟数据、确定性计算演示与真实 Agent 模式分别标识。后续 UI 使用 Fastify + React，不增加本阶段没有用途的占位模块。

## 跨会话恢复与交接

新会话先读本文件，再读职责对应的 docs/progress-backend.md 或 docs/progress-frontend.md、docs/PRD.md 相关章节、docs/API-CONTRACT.md；随后检查 git status、分支、git worktree list 与实际代码，核实后从最早未完成且仍获授权的任务继续。进度记录不能代替代码和验证。

本 worktree 负责后端：D:/llm/Commerce Lens-backend，backend/payment-api 分支。原目录 D:/llm/Commerce Lens 由前端会话使用，可能有未提交修改；不改其页面和进度，不 reset/clean 他人工作，不自动合并到 main。共享契约、根配置和依赖变化须明确记录同步内容。

每完成一个可验证小任务，以及停止、切换任务、结束会话前，更新职责对应的进度文件：职责/目录/分支/提交、功能与文件、验证对应版本、准确停留点、未提交修改归属、设计、问题/复现/阻塞、优先级下一步、接口同步和命令。保留当前快照，历史查 Git；docs/PROGRESS.md 仅作早期背景，后端恢复以 docs/progress-backend.md 为准。

区分本次通过、历史通过、失败与未验证，不把计划写成实现，不记录密钥或聊天流水账。当前用户排除真实外部模型 API 调用，此约束持续到用户明确改变；无凭证不阻塞可独立完成的本地工作，也不为凑任务扩展范围。
