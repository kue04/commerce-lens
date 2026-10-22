# 报告样本独立核查与后端出口条件

2026-10-22，Asia/Shanghai。对象为实现 c4885cf、交接 HEAD e69f360 保存的 `evals/results/audit-2026-10-22T10-43-12-334Z.json`，原文件不改写。本次由 Codex 逐项阅读语义并运行独立自动核查；没有人类评审参与，**不是人工抽样复核或双人复核**。

## 方法与结论

`npm exec -- tsx scripts/audit-report-samples.ts` 在临时真实 PostgreSQL 中重新发布对应合成场景，用 `evals/oracles/window.sql` 核对总量和每个 SKU/渠道/大区贡献，不调用生产查询编译器、报告生成器或 hash 实现。额外检查同 run/版本/窗口/筛选范围、结果 hash、事实引用与 valueRef、守恒、unknown 和模式标识。信号事实和解释的语义由本次逐项阅读核对下表，脚本不具备通用自然语言真实性判定能力。

原始核查结果：`evals/results/report-review-2026-10-22T11-26-39-851Z.json`。20/20 的总量、贡献和结构引用检查通过；2/20 有解释引用缺口。不能把这称为 20/20 报告验收通过，更不能取代真实模型评测。样本覆盖 16 个 family；4 份是同 family 的改述，20 份不等于 20 个独立业务场景。

所有窗口均按报告 query 的上海自然日读取；下表金额为分、件数为件，顺序是基期→本期。事实包含总量和各贡献行；新 SKU 的基期为零，share 允许负值和超过 100%，零总变化 share=null。

| caseId | 数值核查 | 假设、未知项与证据范围结论 |
|---|---|---|
| dev-sku-decline-0 | 10000000→6000000；A -4000000、B 0 | 无假设；库存/流量/活动均 missing，未补零或解释原因 |
| dev-channel-traffic-0 | 10000000→7000000；douyin -3000000 | 会话 3000→2100 仅为渠道×大区背景；活动仅作窗口重叠佐证；库存未知，无 SKU 归因或活动效果断言 |
| dev-stock-only-0 | 10000000→7000000；A -4000000、B +1000000 | A 库存池本期 24/24、零库存 10 小时，基期 0；解释承认因果未知，但漏引证明 A 下降的 contribution，记 F1；流量 missing |
| dev-historical-refund-0 | 0→300000；A +300000 | 按成功时间统计，原因码 damaged=100000、unknown=200000，共 2 事件；不当作订单数或质量事故，无假设 |
| dev-partial-refund-0 | 0→300000；A +300000 | 两次部分退款；原因码与上例相同，不回写历史支付；零基期变化率 null，无假设 |
| dev-offset-0 | 10000000→7000000；A -4000000、B +1000000 | 份额 4/3、-1/3，抵消项未截断；信号 missing，无假设 |
| dev-units-no-stock-0 | 100→70；A -40、B +10 | 单位 units，不扣退款；库存等信号 missing，无缺货解释 |
| dev-normal-0 | 10000000→10000000；A/B 均 0 | share=null；未声称规则异常，原因 unknown |
| frozen-test-new-sku-total-0 | 10000000→7012345；C +12345 | C 基期 0 且保留；A/B 抵消与贡献守恒；信号 missing，无假设 |
| frozen-test-unknown-refund-0 | 0→300000；A +300000 | 2 事件全为 unknown，missingShare=1，无质量假设 |
| frozen-test-mixed-stock-traffic-0 | 10000000→7000000；A -4000000、B +1000000 | 库存、背景流量及活动分别支持有限解释，未把它们相加为原因比例；库存解释同样漏引 contribution，记 F1；不从该冻结案例调优 |
| frozen-test-units-channel-0 | 100→70；douyin -30 | 支付件数非退款后净销量；信号 missing，无假设 |
| frozen-test-refund-channel-0 | 0→300000；douyin +300000 | 2 个成功退款事件；unknown 占金额 2/3，非订单比例，不证明质量事故 |
| frozen-test-region-contribution-0 | 10000000→7000000；east -3000000 | 大区单维度守恒，不与 SKU/渠道贡献叠加；信号 missing |
| frozen-test-rolling-week-0 | 10000000→7012345 | 当前 10-15 至 10-22、基期 10-08 至 10-15，均 7 天；C 保留，信号 missing |
| frozen-test-week-units-0 | 100→71；A -40、B +10、C +1 | 当前 10-19 至 10-22、基期 10-12 至 10-15，均 3 天；非完整周比较，信号 missing |
| dev-sku-decline-1 | 10000000→6000000 | 与同 family 第 0 例相同，引用属于本 run；原因 unknown |
| dev-sku-decline-2 | 10000000→6000000 | 同上，问题改述未改变证据范围 |
| dev-sku-decline-3 | 10000000→6000000 | 同上，未用“不要猜测原因”掩盖缺源 |
| dev-sku-decline-4 | 10000000→6000000 | 同上，缺失信息保留为 unknown |

库存信号为 SKU×大区池小时，不是单渠道库存；流量为渠道×大区，不能推断 SKU 转化；活动仅证明两窗口之一与记录重叠，不能证明结束导致下降；退款原因码是客户分类，无法证实质量事故。所有样本均标 synthetic、deterministic、agentExecuted=false，且保留因果与损失无法估计的限制。

## 本轮修复切片

- F1：库存“下降商品”解释需要同时引用 comparison、contribution、inventory，缺少任一环节不能靠总量下降替代 SKU 下降。
- 在 dev-stock-only-0 上补专项回归时还复现 F2：将 A/B 合并为一个库存池后，A 下降、B 增长且池中零库存小时增加，旧代码仍断言“下降商品零库存观测增加”。聚合库存无法区分零值来自 A 还是 B，应保留聚合事实并把单 SKU 归因放入 unknown。
- 冻结案例/manifest 和历史报告、历史评测结果均不修改。修复只使用 dev 报告重放及新构造的专项场景。历史 2 份报告的 F1 不会因代码修复自动消失。

修复前运行 `node --import tsx --test --test-name-pattern='stock explanation|combined SKU' tests/unit/agent.test.ts`，2/2 如预期失败，分别报 `stock explanation must cite the SKU decline evidence` 和 `zero hours may belong to the growing SKU B`。修复后同一命令 2/2 通过。

当前验证版本为 e69f360 加本次提交的差异：`npm run typecheck`、`npm test`（64/64，0 跳过，约 40.84 秒）、`npm run build` 均通过。真实 PostgreSQL 专项用独立 SQL 及手工预期确认：只有增长 B 有 10 小时零库存，下降 A 为 0；A、B、A/B 合池三种查询均不支持 A 缺货解释。已有三指标 HTTP 测试验证落库报告中的库存解释同时引用 comparison、contribution、inventory。新增退款下降回归避免把退款减少写成销售供应约束。未重跑 240 次离线集、10 万订单性能或 socket smoke，未调用外部模型。

原始核查工具针对旧报告应继续记录 2 项 F1 并非零退出，不能用新代码替换旧报告使其“变绿”。新报告修复证据是上述 dev 专项与真实数据库回归；旧报告仅可在用户明确发起新 run 后得到新的报告版本。

## PRD 出口核对

| 阶段/硬门槛 | 当前证据与缺口 |
|---|---|
| M0/M1 数据基线、SQL、隔离 | 已有代码和真实 PostgreSQL 测试；本次独立复算 20 份样本，不能冒充当前全部集成测试已重跑 |
| M2 工具/报告/预算 | 已实现；F1/F2 在本轮修复。Pi faux 测试不满足“日志显示真实模型调用”的出口 |
| M3 产品与状态 | 后端 HTTP/SSE、持久化、取消等已实现；浏览器五条路径与前后端真实联调仍未验证，属于另一会话范围 |
| M4 三指标与信号 | 已实现；历史 80 个可回答案例分布于 16 family，仅为确定性合成样本，不代表模型泛化；本轮仅核查保存的 20 份报告 |
| M5 可靠性与评测 | 历史 A 基线/冻结三次保留；本次暴露解释引用遗漏。B/C、真实模型质量/成本/延迟、至少 20 份人工复核仍 NOT_RUN；自动核查不填平人工缺口 |
| M6 本地交付 | 已有启动/备份/恢复/源码包及演示脚本；新系统全新环境复现、实际前端演示与视频未验证 |
| 第一部分 §10/§11 | 不声称完整 P0、真实模型 85% 完成率或 45 秒 P95；不因后端确定性通过改写完成定义 |
| 第三部分契约 | 继续复用 QuerySpec 与 HTTP 1.1.0；本轮只调整 hypotheses 的既有引用和 unknown 文本，不新增 DTO/路由/迁移 |
