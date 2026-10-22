# 开发进度与验证记录

更新：2026-10-22，Asia/Shanghai。本轮从空目录开始，当前交付范围是 M0/M1；不代表完整 P0 应用交付。前端由用户独立负责，本轮不审核或改写其实现。

后续后端已在独立 worktree 继续推进：支付金额 HTTP/SSE 与报告持久化切片、Pi Core 工具集成和预算验证，最新记录以 docs/progress-backend.md 为准。以下保留 M0/M1 的历史验收结果，不将其改写为模型成绩。

2026-10-22 后续：三指标和辅助信号、会话生命周期、备份恢复、120 案例离线评测与 10 万订单本地性能检查均已有实际实现/验证，详见最新后端进度。真实外部模型验收与前端不属于本轮交付。

## 已完成

### M0：环境与基线

- 已完整读取原 PRD，保留项目内副本并更新 v1.1，记录本地作品集范围、DeepSeek、合成数据、主/辅助指标与验收差异。
- 项目内 Node 24.22.1，固定 Pi Agent Core / pi-ai 1.4.0，TypeScript strict，单个根 lockfile。
- 系统未安装 PostgreSQL/Docker，采用开发依赖启动原生 PostgreSQL 18.4，仅绑定 loopback；无需改变系统默认 Node。
- Pi Agent 导入及 DeepSeek provider/catalog 检查通过；当前没有 DEEPSEEK_API_KEY，未做模型网络调用。按 PRD 采用无模型的数据开发路径，真实连通性待验证。

### M1：数据与确定性计算

- 业务 SQL migration：datasets/products/orders/order_items/refund_events/source_watermarks，版本+店铺复合键、外键、金额边界、成功退款校验、发布不可变保护。
- 固定种子：90 个自然日、100000 订单、200000 订单行、30 SKU、3 渠道、4 大区；含星期周期、渠道偏好、支付失败、跨期退款、新 SKU、目标日 SKU 件数下滑。库存/流量/活动表与完整异常场景留待 M4，不把当前种子宣称为全量 PRD 场景集。
- QuerySpec 白名单运行时校验、日期/窗口检查、固定维度映射、绑定参数、3 秒查询超时、200 分组上限、筛选字典校验。
- 支付金额、订单数、件数、成功退款金额、净收款、客单价的比较；四个可加指标的单维度贡献、Top-N 与其他残差、守恒检查。
- 核心源覆盖起点/排他水位/缺失分区门禁。缺数据拒绝生成变化结论；真实零销量保留为零。
- 真实只读登录、RLS 版本/店铺隔离、事务结束清除上下文；模型和 QuerySpec 无权设置授权范围。
- 返回带 scope、queryTemplateId、版本、覆盖信息与 hash 的结果元数据；M2/M3 才建立 run/evidence ID、注册表和持久化报告。
- 手工预期与独立 SQL oracle；可执行演示、构建产物及启动说明。

## 本轮实际验证

环境：Windows 10.0.19045、Node v24.22.1、PostgreSQL 18.4、AMD Ryzen 5 9600X、12 logical CPUs、约 32 GiB 内存，单用户/单查询流程。完整机器与原始执行计划见 evals/results/m1-scale.json。

| 命令 | 实际结果 |
|---|---|
| npm ci | 成功；110 packages，安装审计 0 vulnerabilities |
| npm run typecheck | 通过 |
| npm test | 17/17 通过，0 跳过；包含真实 PostgreSQL 集成测试 |
| npm run build | 通过，SQL migrations 与 oracle 同步到 dist |
| node dist/scripts/demo.js | 通过；实际查询得到 100000→70000 元，A -40000、B +10000；明确 agentExecuted=false |
| npm run verify:pi | SDK、Agent 导入和 DeepSeek provider 目录通过；无凭证，真实网络连通检查 SKIPPED |
| npm run verify:scale | 通过；seed 42/2026 各 100000 订单、200000 行、90 天、30 SKU；六指标与独立 SQL 一致，重复生成/查询 hash 一致，贡献守恒 |

两份规模数据的生成/发布/查询校验总耗时分别约 10.82 秒和 11.81 秒。六指标单次 analyze（含水位和字典校验、总量查询，若可加则含 SKU 分解）约 7.68—108.52 ms。该记录不是多次 P95，不含模型等待，不代表 Agent 性能验收。

## 已发现并修复的问题

首次 100000 订单发布长期未完成，已主动中断，不算成功样本。缩小到 5000 订单后定位到导入过程未刷新统计信息，相关外键检查/发布关联验证使用不合适的查询计划：两个小复现约 5.75/6.16 秒。各事实批次完成后 ANALYZE，再导入关联表和发布，复现降至约 0.53 秒；随后完整两 seed 规模验证通过。已加真实批量发布的统计信息回归检查，以及单条导入语句 60 秒超时。

诊断脚本和 DEBUG 插桩已删除。中断验证遗留的 .local/test-4d766c34-dc2f-423a-8d63-b512791550d9 被自动执行策略拒绝删除，保留为忽略的本地诊断数据；不影响后续独立随机目录测试。正常完成的 demo/test/scale 临时集群已自动停止清理。

## 未完成/未验证

- M2：真实 Pi 多轮业务工具、6 工具契约、预算硬限制、证据注册、结构化报告与验证/一次修订。
- M3：Fastify HTTP/SSE、会话/run/report 持久化、状态机、取消、幂等、重连和刷新恢复；前端由用户同步实现，尚无可联调 API。
- M4：退款/销量的自然语言分析、库存/流量/活动/退款原因信号工具与完整场景种子。
- M5：冻结测试集、Agent 基线对比、重复模型评测、提示注入与全生命周期测试。
- M6：完整本地应用启动、演示脚本/视频、面试说明、备份与回滚流程。
- 未测得 85% Agent 成功率、45 秒 P95 或模型总成本；不得引用为已完成成绩。

## 下一阶段

M2 从支付金额问题建立真实 Pi 闭环。复用 AnalyticsService 和 QuerySpec；先建立证据注册与模板化报告，再绑定 get_metric_definition / check_data_quality / compare_metric / decompose_change / inspect_signals / submit_report。工具只接收业务参数，服务端注入版本和权限。当前只需在本机 .env 配置 DeepSeek Key 与可用模型 ID，后续连通性与工具调用测试才可实际验收；不在聊天中传 Key。
