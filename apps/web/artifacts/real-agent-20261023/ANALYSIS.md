# DeepSeek 真实链路执行与分析

2026-10-23，Asia/Shanghai。用户本次明确授权一次真实外部模型分析，并要求保存全部过程数据后分析。本次仅提交 **1 个真实业务 run**，没有重试该 run、没有另跑连通性探针；后续根因验证使用已保存的响应离线重放，外网请求为 0。

**结论：API、真实模型、工具、PostgreSQL、SSE、报告和下载链路连通，业务终态为 `partial`，不是完整 Agent 成功。** 数值与证据校验通过；本地预算在第 5 次模型请求发送前拒绝请求，导致模型未完成 `submit_report`。保存的报告由服务端部分报告流程生成，保留来源标识和限制，没有伪装成 completed。

## 本次运行身份和结果

| 项目 | 实际值 |
| --- | --- |
| 原始问题 | 昨天华东支付金额为什么下降？ |
| 供应商/模型ID | `https://api.deepseek.com` / `deepseek-flash` |
| 模型名称边界 | 此处确认的是配置/API请求的模型ID，没有把“4.1 Flash”宣传名称当作供应商返回的精确版本证明 |
| 模式 | `agent`，`agentExecuted=true` |
| 数据 | PostgreSQL 18.4，合成 `signals-v1`；不是真实商家业务数据 |
| Session | `ebad3e3a-4a5d-489d-970c-371bea3f1977` |
| Run | `57b2f2ae-90d1-4592-8f78-32fef1439701` |
| Report | `d5b35706-6f6e-4c70-b8c7-3dc058b74c1a` |
| 终态 | `partial`，界面显示“部分成功” |
| 运行时间 | 02:00:50.373—02:00:57.473，约 7.10 秒；不是P95或完整成功任务延迟 |
| 真实模型请求 | 4 次，4 次 HTTP 200，无供应商错误重试 |
| 工具调用 | 7 次，全部执行成功；6 条保存证据 |
| SSE | 27 个事件；已和数据库事件逐条核对 |
| Tokens | 13,539，包含多轮重复发送的输入计费token |
| 估算成本 | USD 0.002206008；SDK按固定provider价格计算，未与供应商账单独立对账 |
| 浏览器外网请求/错误 | 0 / 0；外部DeepSeek请求发生在后端 |

## 调用时序

| 模型请求 | 输入/输出/合计tokens | 供应商结束类型 | 下一步动作 | 传输耗时 |
| --- | --- | --- | --- | --- |
| 1 | 751 / 88 / 839 | `stop` | 解析出合法QuerySpec：支付金额、华东、10月21日对比10月14日、按SKU | 936 ms |
| 2 | 2925 / 369 / 3294 | `tool_calls` | `check_data_quality`、`compare_metric` | 1988 ms |
| 3 | 3853 / 219 / 4072 | `tool_calls` | `decompose_change` | 1127 ms |
| 4 | 4685 / 649 / 5334 | `tool_calls` | 对A查询inventory、traffic、promotion、refund_reason | 2569 ms |
| 第5次请求前 | 尚未发送 | 本地 `BUDGET_EXCEEDED` | 未能继续到submit_report，保存partial | 无外部请求 |

工具输入、结果和顺序见 `model-transport.jsonl`、`model-calls.json`、`timeline.json`、`events.sse`、`sql-queries.jsonl`。模型自行选择了4类信号，且信号查询缩小到SKU A；服务端强制门禁、范围限制和数据库权限没有交给模型。没有使用mock响应完成真实run。

## 数值与解释分析

1. 支付金额本期 **70,000元**、基期 **100,000元**，变化 **−30,000元、−30%**。独立订单头SQL和订单行SKU聚合分别核对，避免复用生产查询编译器来“自己证明自己”。
2. A从60,000元降到20,000元，贡献 **−40,000元**；B从40,000元增到50,000元，贡献 **+10,000元**。变化守恒，A份额133.33%、B份额−33.33%合法，增长项抵消了部分下降。
3. A/east库存池本期24/24池小时，零库存10小时，基期零库存0。报告把它作为供应约束的候选解释，引用比较、SKU贡献、库存三类证据；不能从聚合值推出缺货具体时段，也不能量化因果损失。
4. 取得渠道×大区流量3000→2100的背景事实。查询包含SKU A并不代表流量支持SKU归因，报告保留“不能直接归因到单个SKU”的限制。
5. 活动证据仅证明本期或基期时间重叠，没有大区归因或效果实验。退款原因码仅是本期A的2个成功退款事件分类；退款不会回写支付金额，因此这次额外退款查询不能直接解释支付金额下降，属于可减少的上下文开销。
6. 报告事实和可能解释由服务端证据模板构造。它们通过了schema、引用/hash校验及重新渲染一致性检查，**不代表模型自行写了一份完整最终分析文本**。模型未完成submit_report，服务端fallback明确保留该限制。

## 部分成功的根因与证据强度

已经用同一组4个真实供应商响应，在独立owner/session和真实SQL工具上离线重放成功，见 `offline-replay.json`。重放不会请求DeepSeek；`externalNetworkCalls=0`。原始run和报告没有被修改。

本地 `PiPaymentRuntime.reserve()` 用完整内部上下文的UTF-8字节数加512作为保守的输入token上界。每次对话继续发送工具结果，历史上下文持续膨胀。第四批4个信号结果加入上下文后，离线复现得到：

```text
累计真实用量            13539 tokens
累计预算                30000 tokens
剩余预算                16461 tokens
下一轮输入保守上界      24476 bytes-as-token-bound
预测输出可用额度        -8015
拒绝错误码              BUDGET_EXCEEDED
```

因此第5次请求没有发往供应商；4次HTTP200不能证明模型有机会看到最后4条工具结果后提交报告。把失败归咎为“DeepSeek不支持工具调用”或“Key/模型ID无效”与实际记录不符。

其次，SDK Agent将该调用异常转为助手错误后，`analyze()`结束处只检查是否存在draft，最终抛出 `REPORT_NOT_SUBMITTED`。用户看到的限制是“模型没有提交有效的结构化报告”，掩盖了更具体的预算原因。这是错误传播与可观察性问题。

## 建议的下一步

- 优先减少发回模型的工具内容：保留evidenceId、关键比较/贡献和信号数据，避免重复带回完整QuerySpec、hash、来源、两期相同元数据；完整DTO仍保留在服务端证据库和用户导出。
- 给最终submit_report留出预算，基于当前剩余资源决定下一步检查哪些信号；支付金额问题不必无条件扩到退款原因。
- 预算估算需要保留安全上界，但不能把UTF-8字节等同于实际token计数后再误称供应商额度耗尽。先用本次记录在离线重放中评估模型适配的计数/压缩方案，不直接粗暴抬高总预算或削弱硬限制。
- 保留并传播 `BUDGET_EXCEEDED`/阶段/未发送请求等信息，避免统一降成REPORT_NOT_SUBMITTED；界面和导出继续明确partial。
- 修复后先以录制响应离线验证，再在获得后续真实运行授权时复测。当前只有1个样本，不能声称模型成功率、P95或生产质量达标。

本次任务是执行并分析，**没有为把partial变成成功而修改生产预算、业务计算、报告、测试断言或重跑第二个真实run**。

## 保存内容与复现

- `model-transport.jsonl`：4次DeepSeek请求的完整body（提示词/上下文/工具定义）和原始响应SSE，状态和耗时；不含Authorization头。
- `model-calls.json`：按4次请求合并后的模型文本、tool_calls完整参数、usage、cache统计和结束类型。
- `real-agent.json`、`question.json`、`run.json`：输入、catalog、HTTP请求响应内容、终态、报告与证据。浏览器Playwright trace在 `playwright/`。
- `events.sse`、`timeline.json`：真实run持久化事件重放原文及相对时间；和数据库事件一致。
- `sql-queries.jsonl`：录制期间791条SQL记录，含模板/绑定参数/rows/耗时，无SQL错误；这个数量包括API启动、catalog/history、状态查询、事务/RLS语句等，**不是791条业务聚合查询**。
- `source-data.json`：本次版本/店铺/大区/两期所在区间的实际订单、订单行、退款、商品、库存、流量、活动、水位原始数据，以及提取SQL/参数。活动按既有跨大区规则提取。
- `database-snapshot.json`：本run的请求、session状态、run、27事件、6证据、报告，和HTTP内容一致。
- `independent-sql-oracle.json`：手工预期、独立SQL、参数及两期结果。
- `report.json`、`report.md`：浏览器实际下载；JSON与保存报告相等，Markdown内QuerySpec/总量/贡献/provenance/所有证据/trace完整一致。
- `backend.log`、`capture-environment.jsonl`、截图：服务启动/停止信息及视觉证据。
- `offline-replay.json`、`offline-replay.ts`、`capture.mjs`、`capture-start.ts`、`runtime-source.ts`、`budget-source.ts`、`analyze.ts`：录制、源代码快照和离线根因复现；离线脚本的相对import按原后端 `.local/real-agent/` 路径运行。
- `analysis.json`：机读汇总和逐项校验。`manifest.json`保存文件大小、SHA256及已知凭证值扫描结果；不保存Key、连接串或数据库密码。

已经关闭本次全量传输采集器，后端恢复为不录制新对话的Agent服务，保留已有数据库/前端供查看。页面现为真实Agent模式；直接打开保存报告不发起新的模型任务。普通test:e2e排除了真实模型目录，真实用例要求显式 `COMMERCE_LENS_REAL_AGENT_ONCE=1`，默认不被自动执行。
