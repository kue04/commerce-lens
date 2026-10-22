# 前后端并行开发交接

> 2026-10-22 更新：下方为早期 M1 历史说明，其中“没有 HTTP 服务”等内容已失效。当前已有后端 HTTP 1.1.0 与三指标，下一步用户要求真实前后端连接，继续跳过外部模型。请先读 [INTEGRATION-HANDOFF.md](INTEGRATION-HANDOFF.md) 和 [INTEGRATION-PROMPT.md](INTEGRATION-PROMPT.md)，权威接口以本 worktree 的 API-CONTRACT.md、packages/contracts/src/http.ts 为准。本文下方不作为当前实现状态。

2026-10-22：前端归用户开发，目录 apps/web；当前 Codex 负责 contracts、metrics、analytics、db、scripts、tests 和相关文档。涉及公共契约的变更先同步，后端不覆盖用户前端文件。当前没有 HTTP 服务；以下接口是 M3 实施契约，不表示已上线。

本地接口前缀 /api，计划后端端口 3000、前端端口 5173，均绑定 127.0.0.1。开发代理让浏览器使用同源相对 URL。未实现的接口不得用固定答案伪装后端成功。

## 第一条可联调链路

1. GET /api/catalog 获取指标、数据集、时区、业务演示时钟和水位。
2. POST /api/sessions，body `{datasetVersion}`，返回 `{sessionId,state}`。
3. POST /api/sessions/:id/runs，body `{question,confirmedIntent?,parentRunId?}`，header `Idempotency-Key`，返回 202 `{runId,status,eventsUrl}`。
4. 订阅 GET /api/runs/:id/events；收到 report.ready 后 GET /api/reports/:id。连接关闭不能视作成功。
5. GET /api/evidences/:id 查看证据；POST /api/runs/:id/cancel 取消；GET /api/runs/:id 查询终态或刷新恢复。

HTTP DTO 将在 M3 实现为公共运行时 schemas；现阶段只稳定 QuerySpec 与金额/时间口径。页面 mock 不应成为后端权威契约。不要将 QuerySpec 的数据查询接口当作已存在的 REST API。

## 数据与展示约定

- 金额都是人民币分整数，页面除以 100 后展示两位小数；变化率和贡献份额为比例，乘 100 展示百分比。null 表示不可计算，不显示为 0。
- 比较窗口字段为 `{startDate,endDateExclusive}`，时区 Asia/Shanghai，使用数据集 businessClock 解释“昨天”。上周同日比较不含今天。
- 主指标 paid_amount / refund_amount / sold_units；paid_orders / aov 为辅助指标；net_receipts 当前只在计算层内部支持。
- groupBy 为 none / channel / region / sku / category。筛选键 channelId / regionId / skuId，数组内 OR、不同键 AND；每数组 1—20 个去重值。权限范围由后端绑定。
- Top-N 按绝对变化降序、键字典序打平；有遗漏分组时补“其他”。负贡献和大于 100% 的贡献均正常展示。每个维度单独呈现，不跨维度求和。
- 报告顺序：口径、总量变化、贡献图和表、事实、可能解释、未知信息、建议核实、限制。始终显示模拟数据、演示时钟、数据水位；不展示模型隐藏推理。

## 运行状态与 SSE

状态 queued / running；终态 completed / partial / needs_clarification / insufficient_data / failed / cancelled / timed_out / interrupted。澄清答复建立新 run，引用 parentRunId。

事件包 `{runId,seq,type,at,payload}`。类型 run.started / phase.changed / tool.started / tool.completed / tool.failed / clarification.required / report.ready / run.finished。按 seq 去重与重连；仅收到 report.ready 后展示报告。事件 payload 和报告字段以 docs/PRD.md 第三部分为需求基线，具体 TS schemas 在 M2/M3 补齐后联调。

错误统一 `{code,message,retryable,traceId,details?}`。需要分别设计空数据、澄清、核心数据不足、部分成功、失败、取消和刷新恢复。高级证据抽屉可展开工具名、参数摘要、结果表与版本；图表提供表格替代。
