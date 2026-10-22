# 报告导出核查

2026-10-22，Asia/Shanghai。开始版本 dbffd01，分支 backend/payment-api。仅后端、本地 PostgreSQL 与明确 Pi faux-provider；外部模型调用为零，不是人工复核或真实模型质量验收。

## 发现与修复

JSON 导出与保存报告字段一致，未发现范围丢失。Markdown 原先只有报告总 QuerySpec 及证据行值，遗漏证据自己的 QuerySpec、列名、覆盖率、结构化信号、粒度说明，以及报告 completed/partial 状态。离开应用阅读时，无法辨明子范围与总范围，裸数字也缺少列/单位说明。

修复 apps/api/src/report-export.ts 并由原路由调用：保留人读的事实/假设/unknown/建议/限制，各证据附完整 DTO JSON，包含它自己的范围、版本、状态、columns、rows、覆盖率、signal、note、hash；附报告原始 comparison/contributors、单位、dataset/provenance、执行记录和身份引用。比例不舍入，null 不补零；状态 partial 单独显示。导出只读保存数据，不重新分析，不修改数据库中的历史报告。用户问题和标识按文本转义，JSON 代码围栏不会被数据中的反引号打断。

另外复现报告文本自身的范围缺口：总退款 350000 分包含 A/B，而只核查 A 的 300000 分、2 个事件时，原文“共 2 个退款事件”没有说明子范围。新退款事实明确本期及 SKU/渠道/大区。活动解释与证据 note 明确 SKU/渠道选择、包含全范围活动、与本期或基期重叠、无大区粒度；不声称其作用于所筛选的大区或证明活动影响。

## 验证方式与边界

`tests/integration/report-export.test.ts` 使用真实 PostgreSQL 和 Fastify HTTP 路由，退款/活动由真实 Pi Core 执行明确 faux-provider 给出的工具调用。JSON 与报告 GET、数据库 dto 逐字段比较；Markdown 的 JSON 代码块独立解析并与证据 GET、报告值比较，没有调用生产 renderer 来构造预期。

| 场景 | 手工/独立预期与核查 |
|---|---|
| 退款子范围 | 独立 SQL oracle + 手工预期：报告总量 350000 分，A 子范围 300000 分，2 个成功退款事件；事实显示 SKU A、douyin、east 和本期，证据 QuerySpec 保留子范围 |
| 活动子范围 | promotion-A 的匹配记录、时间和事件类型原样保留，选择 A/douyin；大区 east 只是请求范围，证据说明与解释明确无大区归因 |
| partial | 强制贡献查询失败，保留成功比较；Markdown/JSON 均显示 partial、限制与未知项，units 单位不变 |
| missing | 缺辅助源时，3 条 missing 证据保留 null coverage、空 rows、无 signal，不能填零或生成支持性假设 |
| 原始内容 | 所有事实引用、valueRef、假设支持/反证/缺失信息、unknown、建议、限制均导出；comparison/contributors/trace/版本可从 Markdown 代码块原样读取 |
| 历史与格式边界 | 单元回归覆盖 1.0.0 provenance、导出不修改输入、链接/HTML 文本转义、数据反引号不破坏代码围栏 |

修复前专项测试稳定失败于 Markdown 缺少结构化范围/内容；补齐导出后进一步断言退款“本期/子范围”时失败，修复模板后通过。完整质量门禁结果以 docs/progress-backend.md 当前快照为准。未重跑 240 次冻结评测、规模性能、真实 socket smoke、真实模型或浏览器 Markdown 渲染；不改冻结标签与旧报告。

QuerySpec、HTTP 1.1.0 DTO、路由、迁移及依赖不变。Markdown 排版可变，程序处理用 JSON。旧报告只按保存内容导出，不把新模板悄悄回填到历史结果。
