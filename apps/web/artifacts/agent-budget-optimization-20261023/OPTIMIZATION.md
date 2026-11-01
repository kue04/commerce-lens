# Agent 工具上下文与预算收尾

2026-10-23，Asia/Shanghai。用户授权根据唯一真实run的分析优化；本轮不调用真实外部模型，不改变30,000 tokens、8次模型请求、12次工具尝试、90秒、0.30美元的硬限制。原始真实partial报告/记录/压缩包保持不变。

## 实现

- `model-context.ts` 只对发给模型的工具返回建立精简视图：保留evidenceId、类型/状态、指标、精确窗口/筛选/分组、覆盖率、数值和粒度限制。比较只带comparison，贡献只带结构化贡献，信号只带结构化signal，不重复回传rows/hash/模板ID/来源/时间戳。完整EvidenceDTO仍照常入库、HTTP读取和导出。
- 商品贡献/活动/退款原因最多展开10项，另带总条数与省略条数，明确提示模型不能视为完整目录。不对完整证据或最终报告做截断；missing/null/负贡献/超过100%的份额不改写。
- 预算仍使用UTF-8字节保守上界，不引入未经验证的除数来放宽计数；现在先normalizeContext，再估计实际发送的上下文，包含工具schema。`canRequest`无副作用；探索请求预留当前收尾上下文及512输出token，成本预检也计入保留量。
- 必需比较/贡献证据齐备且探索无法留下收尾额度时，使用紧凑的证据ID注册表构造新的提交上下文，只暴露 `submit_report`。模型仍须选择真实证据并经过原校验，服务端不自动伪造一次提交。请求/工具次数临近上限同样转入收尾；不再接受额外查询。已失败提交的错误反馈保留，原“一次修订”限制继续执行。若剩余预算不足以收尾，仍准确拒绝并保存partial。
- 用闭包保留预算/调用异常，避免Pi Agent把原始错误替换为REPORT_NOT_SUBMITTED。partial保存时把原始错误码写入原有run.finished.reason、说明写入原有run.message和event.message，同时报告限制写入错误码；不增加HTTP schema或迁移。
- 新Agent报告provenance.promptVersion=`analysis-v3`，历史保存报告不改写；确定性模式沿用`analysis-v2`。前端partial报告顶部显著展示限制与原始预算原因，普通金额及证据仍可查看。
- 真实模型浏览器验收现在要求 `completed` 且trace包含成功submit_report；partial会先保存全部采集内容，再令完整业务验收失败。真实用例仍独立配置/显式opt-in，未在本轮执行。
- 提示词要求按指标选相关信号，支付/件数优先库存/流量，退款原因用于退款问题；不再鼓励遍历所有信号。这项策略效果尚未通过新真实模型评测。

## 离线验证和边界

原run `57b2f2ae-90d1-4592-8f78-32fef1439701` 四次真实响应和usage抽出为 `tests/fixtures/agent-budget-20261023.json`。专项用例将其作为录制响应，执行真实PostgreSQL工具；第5个submit_report响应明确由测试合成，禁止外网。它验证预算预检现在能抵达并执行收尾，不代表DeepSeek已在修复后实测完成。

修复前定向3/3失败，修复后通过。录制响应重放第5轮输入上界由 **24,476** 降到约 **4,068**，原剩余预算16,461足以发出提交；总usage为原四次13,539加模拟末轮1,150，即14,689。5次离线模型响应、8工具尝试、6完整证据，0外网请求，手工预期/独立SQL/HTTP导出一致。重放结果保存 `evals/results/agent-budget-optimization.json`，此处costUsd=0是模拟提供方回报，不能与原真实$0.002206008直接当作节省成本对比。

另有预算故障回归确认：预算错误不被吞并，run/SSE/partial/Markdown均显示BUDGET_EXCEEDED与请求未发送；收尾阶段禁止额外探索，错误ID能按原限制修订；预览省略项显式标记，原始完整EvidenceDTO不变。

本轮首次完整检查运行中，其他会话开始升级HTTP到1.2.0并增加数据集profile，导致旧signals/契约样例两项版本检查不一致；没有回退或覆盖它们。另有partial导出断言发现Markdown对新错误码的字面方括号/下划线转义，需要按可读文本反转义后核对；结构化JSON仍逐块深度相等，不删字段/断言。

为了验证本轮负责的切片，使用 `.local/budget-verification-20261023`：从git archive a250286恢复HTTP1.1.0基线，只复制本轮预算相关实现/测试及既有Windows启动修复共14个文件，共享node_modules、不另安装依赖。完整typecheck/test/build在此执行，日志、文件指纹、重放结果复制到前端 `apps/web/artifacts/agent-budget-optimization-20261023/`。隔离验证不包含其他会话进行中的1.2.0/profile改动；当前共享worktree的整体集成需待该工作完成后再验，不能将隔离结果冒称共享工作区全部通过。

原始真实记录仍为partial，没有重写成completed。没有同步或改写另一会话的HTTP契约/迁移/依赖；新收尾逻辑复用已有DTO和SSE字段。

## 最终验证

- 后端隔离基线 `a250286` + 14个本轮/既有Windows修复文件：`npm run typecheck`、`npm test` **86/86，0跳过，176.93秒**、`npm run build`通过。源码检查前后指纹一致，14文件与共享worktree中本轮源文件逐一hash相等。首次共享工作区全套为83/86：1项Markdown转义断言已修复，另外2项为并行1.2.0版本切换产生的不一致，未覆盖其源码来制造通过。
- 前端最新快照：typecheck、**9/9单元、28/28浏览器**（18.6秒）、build通过，包含新partial顶部错误回归。此数字包含并行前端新增的已有功能回归，不全部宣称为本轮新增；517.03kB图表分包提示仍保留。
- 本次模型外网请求 **0**。完整真实DeepSeek `completed`、真实费用/延迟改善尚未复测。原始真实zip SHA256仍为 `412652D38EAF741DAB0E9967A622C03833AFD5A3EF2FF428081FFE846AD4E874`。
- 原始样本的4个真实响应全部保留，离线第5条响应为明确模拟提交；不可把模拟14689 tokens/costUsd=0当作真实供应商账单。新Agent报告记录promptVersion=`analysis-v3`，原始历史报告仍保持旧来源版本。

证据目录：主目录 `apps/web/artifacts/agent-budget-optimization-20261023/`。含后端/前端各命令原始日志、验证JSON及SHA256、离线重放结果、顶部partial提示截图与本文副本。隔离库正常停止，保留隔离源副本作为复现材料。共享工作区另一路仍在调整1.2.0/profile；本轮不启动/替换它的服务，也不盲目同步契约。
