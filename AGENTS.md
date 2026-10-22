# Commerce Lens 开发规则

先读 docs/PROGRESS.md 确认当前已验收阶段；实现业务或调整验收时读取 docs/PRD.md 与 docs/decisions/0001-baseline.md。用户在本会话确认的本地求职作品集范围优先于原 PRD 的公网发布要求。

计算层仅使用规范化 QuerySpec、绑定参数和服务端权限上下文。模型工具不接受 storeId、ownerId、数据版本、SQL 或可执行代码。金额以安全整数分计算，退款按成功时间，支付与退款分别聚合；数据质量门禁在查询服务内强制执行。

每轮完成一个可验证切片。关键数值使用手工预期值和独立 SQL oracle 核对；数据库集成测试使用真实 PostgreSQL。以 package.json 中的命令完成类型检查、相关测试和构建后，更新 docs/PROGRESS.md；未运行的验证明确标记。

模型凭证只从环境变量读取。无 Key 的检查不得声称真实模型链路通过；模拟数据、确定性计算演示与真实 Agent 模式分别标识。后续 UI 使用 Fastify + React，不增加本阶段没有用途的占位模块。
