# 当前后端改造：第二切片经营概览（2026-10-23）

- 目录/版本：D:/llm/Commerce Lens-backend，backend/payment-api，HEAD=a250286+第一切片/既有并行未提交成果。本轮不改前端、不自动提交或合并、不调用真实外部模型、不重启其他会话正在使用的服务。
- 实现：POST /api/datasets/:version/overview。共享HTTP1.2.0新增OverviewRequestSchema（原QuerySpec别名）、OverviewSchema/DTO；三主指标同范围比较，选中指标30天日趋势、两期实际窗口、每点单日analysisQuery、分组贡献、最多5条规则变化及独立可用性。昨天对上周同日，7天对前7天，30天对前30天；无效窗口拒绝，不静默改写。
- 计算：AnalyticsService.overviewData在RLS只读repeatable-read内核查字典/版本/时钟/水位；一个固定日聚合模板分别聚合支付/退款后union，最多再查一个现有分组模板，不逐日查询。quality.ts与现有analyze共用质量门禁，rules.ts与报告共用原规则阈值，compare/contributions/safeInteger继续复用。缺源按指标、缺分区按日期返回null及原因，真实零保留0，基期零变化率null。概览不创建run/证据/报告，API即使为agent也不调用模型。
- 本轮最终验证：Node24.22.1、真实PostgreSQL18.4；npm run typecheck、npm run contracts:examples、npm test（100/100，0跳过，255.93秒）、npm run build均通过。包含6个概览集成、共用规则边界单元和概况/概览样例schema校验；三指标所有30日两期独立SQL oracle、1/7/30窗口、筛选贡献与守恒、小数据手工值、权限/注入、跨期退款、缺源/分区/null与真实零、零基期、5条上限与精确下钻、acceptance/portfolio同QuerySpec保存报告一致。agent模式通过隔离loopback真实HTTP验证概览0模型/0新run；实际SQL调用核对为一个daily模板+一个分组模板。旧1.0.0/1.1.0报告读取/导出及现有回归均在本次100项内通过。
- 证据：.local/overview-test.log保存本轮完整npm test日志；.local/overview-verification.json保存结果和36个当前变更源码/契约/测试SHA256，收尾再次核对无漂移。packages/contracts/examples/overview.json由本轮实际HTTP/PostgreSQL产生，不是手填目标值。所有本轮临时数据库已关闭。未运行前端浏览器、冻结评测、规模性能或真实模型，不能借用历史成绩。
- 本轮文件：analytics/overview.ts、quality.ts、rules.ts（新），service.ts/query-compiler.ts；apps/api/src/app.ts；agent/report.ts仅抽出原规则调用并保留既有analysis-v3改动；contracts/src/http.ts、examples/schemas.json、overview.json（新）、重新生成payment-flow/dataset-profile；scripts/contract-examples.ts；tests/integration/overview.test.ts、tests/unit/rules.test.ts（新）、tests/unit/contracts.test.ts；API-CONTRACT、ADR0005及进度。未改package/lock、迁移、冻结标签、QuerySpec index.ts或前端。
- 归属保护：第一切片文件归此前本后端会话；repository/runs、agent预算/pi/model-context/report的promptVersion、Windows启动器/窗口测试、预算replay与fixtures、Agent优化文档/结果仍是其他会话未提交成果。本轮未reset/clean或打包提交全部修改。验证对象是共享工作树，包含既有成果。
- 接口同步清单：packages/contracts/src/http.ts；packages/contracts/examples/schemas.json、overview.json、dataset-profile.json、payment-flow.json；docs/API-CONTRACT.md及docs/decisions/0005-deterministic-overview.md。接入操作说明见docs/OVERVIEW-HANDOFF.md。本轮无提交ID，不能按整分支盲目cherry-pick。前端同步示例用于理解/校验，不能当页面实际数据。
- 前端接入：本轮最终后端门禁通过后即可开始，无需等真实模型。只读发现原目录前端已存在页面与profile adapter的进行中改动，进度文档可能滞后；未触碰。前端须核对实际共享schema而非仅版本号，新增overview adapter；选择版本显式传createSession，同QuerySpec作为confirmedIntent，已有报告追问保留原session。当前use-workspace的新提交仍读取catalog.version，需前端会话修正版本传递，避免预览版本与分析版本不一致。
- 准确停留点/下一步：第二切片后端已完成，本轮门禁通过，现在即可开始前端接入，无需等待真实模型或新增后端模块。前端结合尚未验收，需由前端会话按OVERVIEW-HANDOFF与API-CONTRACT接概况→概览→analysisQuery进入工作台，真实浏览器验证切指标/时间/筛选、缺源/零基期、异步请求隔离与数值一致。没有自动同步主目录文件或自动重启服务；后端文件未提交，HEAD仍为a250286。

本轮复现命令（后端目录；测试仅faux/离线重放，不调用真实外部模型）：

```powershell
$env:PATH = (Join-Path (Get-Location) '.tools/node-v24.22.1-win-x64') + ';' + $env:PATH
npm run typecheck
npm run contracts:examples
npm test
npm run build
```

---

以下第一切片与并行会话为历史记录，第二切片状态以本节为准。

# 当前后端改造：第一切片（2026-10-23）

- 职责/版本：D:/llm/Commerce Lens-backend，backend/payment-api，开始 HEAD=a250286。本轮负责连续数据与数据概况，不改前端；当前验证禁止真实外部模型调用，历史单次授权不延续到本轮。第二切片经营概览尚未实现。
- 已实现：db/seeds/portfolio.ts 新增固定 seed=20261022 的 portfolio-90d-v1，时钟2026-10-22，2026-07-24至2026-10-21连续90天；订单按流量/转化权重分配，折扣/库存/退款变化写入明细，无报表答案/场景标签。新发布的 published_at/checked_at 使用真实执行时间，已有不可变版本与报告不改写。api:dev保留旧版本并在新版本不存在时发布，默认选新版本；db:seed原入口仍保留，可显式传 portfolio-90d-v1。
- 已实现：GET /api/datasets/:version/profile；路由先授权版本，profile.ts 使用只读 repeatable-read、绑定参数与 RLS 统计当前店铺。返回实际行数、记录日期、六源覆盖/缺失/检查时间、三指标定义与筛选字典；区分 publishedAt、businessClock、排他 completeThrough 和 lastCompleteDate，不将发布称作同步。
- 已实现：共享 HTTP 1.2.0，保留原QuerySpec及run/report/evidence字段，provenance接受1.0.0/1.1.0/1.2.0。真实HTTP/PostgreSQL概况样例实际统计100000订单、200000订单行、4795退款事件、259200小时库存、1080渠道大区日流量、2活动、30 SKU、3渠道、4大区。源缺失与真实零、交易实际日期与覆盖声明分别表达。
- 本轮验证（HEAD=a250286+本轮与既有未提交改动，Node24.22.1、真实PostgreSQL18.4）：npm run typecheck、npm test（92/92，0跳过，215.90秒）、npm run contracts:examples通过。全套后最后一项旧报告用例从schema检查增强为真实DB保存/HTTP读取/JSON与Markdown导出/不可变保护；随后再次typecheck、最终专项6/6（0跳过，39.07秒）、npm run build通过。覆盖重复生成hash、重复发布拒绝、90天连续与粒度、三指标1/7/30天独立SQL oracle、贡献守恒、RLS、缺分区/缺源、零事件与1.0.0/1.1.0旧报告。完整全套未在增强测试后再次运行，不将增强用例混入此前92项结果。实际样例经过真实PostgreSQL与Fastify inject路由/schema，不将其称为新路由socket浏览器验收。外部模型调用0。
- 验证快照：.local/portfolio-first-slice-verification.json记录本轮命令结果、实际样例数量、HEAD与当前发生变化的源码/契约/测试SHA256；包含他会话共享源码，只用于标识验证状态，不表示归属本轮。所有本轮临时数据库已正常关闭。未改长期运行的API或其数据库。
- 未提交归属：开始已存在他会话的repository.ts/runs.ts、agent/budget.ts/pi.ts/model-context.ts、local-postgres.ts/Windows控制台测试、预算重放测试与fixtures、BACKEND-QUICKSTART、进度和评测结果。本轮期间又检测到他会话report.ts、report-export.test.ts、AGENT-BUDGET-OPTIMIZATION.md与进度更新。均保留；本轮未提交，未自动合并或重启正在使用的3000/55432服务。完整测试结果属于共享工作树，不冒称Agent优化为本轮成果。
- 本轮文件：db/seeds/portfolio.ts、db/seeds/generate.ts、packages/analytics/src/profile.ts、apps/api/src/app.ts、packages/contracts/src/http.ts及examples三文件、scripts/seed.ts/api-dev.ts/contract-examples.ts、tests/integration/portfolio-profile.test.ts；signals.test.ts仅将新报告版本预期改为1.2.0。文档为API-CONTRACT、本文及PROGRESS顶部本轮说明；未改package/lock、迁移、冻结案例/标签或前端页面。
- 前端同步（文件清单，尚无本轮提交ID）：packages/contracts/src/http.ts、packages/contracts/examples/schemas.json、dataset-profile.json、payment-flow.json、docs/API-CONTRACT.md；index.ts无变化。前端须连接运行本分支新代码的API；现有长期运行实例未由本轮重启，不能当作新路由已上线。
- 停留点/下一步：第一切片已完成并验证；本轮全部改动仍未提交，以免将并行成果混入提交。下一轮单独实施经营概览：先补HTTP1.2.0概览schema/说明/真实样例，再实现原QuerySpec三指标、实际比较窗口、有限模板日趋势与共用规则；概览不创建run/报告、不调用模型。概览与报告数值一致性、日趋势/缺日期/规则共享/最多5项变化尚待第二切片验收。规模性能、冻结评测、真实模型和新路由socket/浏览器未在本轮重跑。

本轮复现命令（工作目录为本后端目录，测试不调用真实外部模型）：

```powershell
$env:PATH = (Join-Path (Get-Location) '.tools/node-v24.22.1-win-x64') + ';' + $env:PATH
npm run typecheck
npm run contracts:examples
npm test
node --import tsx --test --test-concurrency=1 --test-timeout=60000 tests/integration/portfolio-profile.test.ts
npm run build
```

---

以下保留其他会话与历史记录，不作为本轮验收结论。

# 当前预算收尾优化已验证（2026-10-23）

预算收尾切片已完成。精简模型工具返回/保留完整证据入库导出；规范化发送上下文保守计数并预留submit_report；预算紧张转为仅提交，保留一次修订；原始BUDGET_EXCEEDED传播到run/SSE/partial报告与Markdown；前端顶部显示部分成功原因；真实模型验收必须completed且trace含成功submit_report。新Agent promptVersion=analysis-v3；硬限制未提高，原真实记录与zip未修改，本轮外部模型调用0。

验证：HTTP1.1.0隔离基线a250286+14个预算/既有Windows启动文件，typecheck、86/86测试（真实PostgreSQL，0跳过，176.93秒）、build通过，前后指纹一致且本轮文件hash与共享源一致。原共享全套83/86（1个Markdown文本转义断言已修复、2个来自并行1.2.0契约切换）；另一路profile/数据集升级未覆盖、未并入本轮结论。最新前端typecheck、9/9单元、28/28浏览器、build通过。完整日志/指纹见apps/web/artifacts/agent-budget-optimization-20261023。

离线验证：重放原四条真实响应+明确模拟最终提交，真实SQL工具执行后completed，5请求/8工具/6完整证据；第五轮输入上界24476降到4068。原真实样本依旧partial；不冒称修复后真实DeepSeek完成或成本下降。后续真实completed验收仍待独立运行。本轮服务未新启动，避免与并行数据集/profile工作冲突；隔离数据库均正常关闭。

详细交付：D:/llm/Commerce Lens-backend/docs/AGENT-BUDGET-OPTIMIZATION.md；主目录apps/web/artifacts/agent-budget-optimization-20261023/OPTIMIZATION.md、backend-verification.json、frontend-verification.json、offline-replay-result.json和partial-budget-banner.png。

---

此前历史记录：

前记录如下。

# 当前真实 DeepSeek 单次执行快照（2026-10-23）

用户在本会话明确授权“跑一次真实链路，并把所有过程数据内容保存后分析”。已完成1个真实浏览器业务run，DeepSeek模型ID deepseek-flash，4次真实HTTP200，7次SQL工具调用、6证据、27SSE事件，13539 tokens，估算成本USD0.002206008，run耗时7.10秒。原始run=57b2f2ae-90d1-4592-8f78-32fef1439701，report=d5b35706-6f6e-4c70-b8c7-3dc058b74c1a，session=ebad3e3a-4a5d-489d-970c-371bea3f1977。业务终态partial，agentExecuted=true，不能称完整Agent成功。

独立SQL/手工预期7000000/10000000分、A−4000000/B+1000000通过，报告/导出/6证据/27事件与数据库一致，schema及证据hash校验通过。离线响应重放（外网0）定位：累计13539实际tokens后，第5轮输入的UTF8字节上界24476超过剩余16461预算，在发请求前BUDGET_EXCEEDED；Agent错误最终归并为REPORT_NOT_SUBMITTED。保存partial及原始错误，不改不可变报告、不抬预算、不重跑第二次真实run。

完整证据目录D:/llm/Commerce Lens/apps/web/artifacts/real-agent-20261023/；ANALYSIS.md有调用时序、数值/解释审核和建议，model-transport.jsonl保存全部4次请求body/原始响应流（无Authorization），sql-queries.jsonl保存791条录制期SQL模板/参数/结果（含启动/目录/状态，非791业务聚合），source-data.json保存实际来源表与提取SQL，database-snapshot.json、events.sse、model-calls.json、timeline.json、report.json/md、截图、Playwright trace、offline-replay.json、analysis.json和SHA256 manifest.json均保留。已知凭证值扫描通过，未输出/保存Key或连接密码。

本轮前端typecheck、7/7单元、23/23隔离HTTP浏览器、build通过；真实模型浏览器1/1通过表示partial链路被捕获，不代表completed。后端typecheck/build通过；业务源码未改，未重跑完整77项/冻结评测/性能/人工。真实用例在独立playwright.real-agent.config.ts内，默认test:e2e排除real-agent，且需显式COMMERCE_LENS_REAL_AGENT_ONCE=1；不会被普通回归自动付费执行。

现有API已切为agent、signals-v1，前端/真实PostgreSQL继续运行；单次采集器已停止，不再录制后续模型/SQL内容。当前API使用后端.local/real-agent/start.ts（不加载capture.mjs）连接已有55432数据库、监听3000，前端5173。该本地启动器源码已复制进证据包；api:dev对现有数据库会拒绝重复启动，正常使用已有库可用api:start但其默认数据版本可能不同。本次未修改生产启动器。后续优先离线修正工具回传冗余/预算估算和原始错误传播，再另行验收completed；当前用户仅授权一次真实run，不继续自动发起新run。

---

以下为此前历史状态；“禁止真实外部模型”等限制已由本次用户对单次真实运行的明确授权覆盖，不能将历史deterministic记录当作本次结果。

# 当前联调职责快照（2026-10-23）

按用户最新要求已继续验证仅后端数据的前端：前端MockApi/fixture报告/模拟场景/localStorage报告缓存均已删除，浏览器支付后同会话渠道追问带parentRunId完成真实第二轮；保存/刷新均来自API。Fastify运行模式显式 deterministic，真实PostgreSQL18.4执行，SQL oracle和持久化DTO核对一致，agentExecuted=false、modelRequests=0。后端分支a250286及Windows隐藏控制台未提交修复未变；本轮无后端代码修改。详细证据在原目录D:/llm/Commerce Lens/docs/INTEGRATION-RESULTS.md及apps/web/artifacts/http-only/，未合并分支。

原目录前端始终有快照保护。样式视觉保留，用户最新要求下已实际删除产品mock功能和缓存机制；旧测试源原文归档在主目录apps/web/tests/archive/20261022，当前HTTP生命周期与交互测试23条通过。最终前端7单元、23浏览器、typecheck、真实Chromium支付+渠道追问、独立SQL oracle、build通过；外网/模型请求0。

本轮必要额外修复：用户报告大量postgres.exe窗口，进程树确认一套数据库的worker窗口。旧detached父进程无控制台，PostgreSQL后代自行分配可见控制台；先ShowWindow隐藏本次8窗口保持ready，再增加真实SQL连接/窗口检查回归，修复前visiblePostgresWindows=11失败。scripts/local-postgres.ts改用PowerShell7 Start-Process -WindowStyle Hidden启动独立隐藏控制台，子进程继承，保留Ctrl+C隔离/启动日志/readiness/pg_ctl有序关闭。新增scripts/check-postgres-windows.ps1与tests/integration/windows-console.test.ts，BACKEND-QUICKSTART补充说明。无业务/依赖/DTO/迁移变化，未同步旧主目录M1启动器。

修复后专项2/2，最终后端npm run typecheck、npm test（77/77，0跳过，154.68秒）、npm run build通过；这是a250286加本轮未提交启动器/测试的结果。实际API启动后Ctrl+C退出，3000/55432均释放，再次启动后真实浏览器及SQL oracle通过，最后窗口检查0。启动时间较旧实现增加，未测性能基准；不将其当模型性能。原性能/冻结评测/真实模型/B/C/人工/视频未重跑。

后端改动仍为上一轮 Windows隐藏控制台修复/quickstart/窗口回归，本轮未增加后端源码变更；前端最新源状态在原目录未提交。当前Vite5173、deterministic API3000及DB55432运行，可见PostgreSQL窗口0，health/ready正常。后续按授权继续真实验收澄清、SKU排除、退款/件数及服务失败恢复；不得调用外部模型。详见主目录INTEGRATION-RESULTS.md。

---

以下为原交接历史快照。
# Commerce Lens 后端交接快照

更新：2026-10-22，Asia/Shanghai。新会话先读根 AGENTS.md；本文保留当前有效状态，历史细节查 Git，不继续追加聊天流水账。

## 最新交接快照（恢复自 6411a0b）

- 职责/目录/分支：后端 D:/llm/Commerce Lens-backend，backend/payment-api；本轮开始 HEAD 6411a0b、工作区干净。用户下一步授权本地前后端连接，真实模型继续跳过。本轮只制作交接，不改前端页面或未提交文件、不合并分支。
- 新增 docs/INTEGRATION-HANDOFF.md、docs/INTEGRATION-PROMPT.md；更新过时的 FRONTEND-HANDOFF 入口、BACKEND-QUICKSTART 的确定性启动约束。已只读核对主目录 main 25a18ec 的 ?? apps/ 与 ?? docs/progress-frontend.md、前端 HttpApi/Vite/进度，及后端 6411a0b 的 HTTP 1.1.0 契约。具体差异、最小同步清单和验收顺序见新交接文档。
- 可行性判断：前端已有 HttpApi、共享 DTO 导入和 /api 代理，后端已有 loopback HTTP/SSE/真实 PostgreSQL；需先同步共享契约并修复 units、库存聚合、固定 E03 等接入差异。浏览器真实联调尚未发生，不能以各自历史测试宣称成功。
- 接口同步：后端 contracts/src/http.ts、examples/payment-flow.json、schemas.json、API-CONTRACT.md 是主目录待同步文件；QuerySpec index.ts 无差异。双目录第一链路无须合并 Fastify 根依赖；未来合并需审查 package/lock、tsconfig、.env.example，保留前端独立 package/lock。
- 验证：本次为文档与只读差异核对，未运行 typecheck/test/build/HTTP/browser；上节 6411a0b 测试成绩均为历史版本证据。仅做文档链接/文件路径与 git diff --check 校验后提交；没有模型请求，未修改冻结样本。
- 准确停留与下一步：新窗口在原前端目录按 INTEGRATION-PROMPT.md 从支付金额真实浏览器链路开始，保持后端 deterministic、mock 独立，逐片验证。前端未提交成果归前端会话；本轮后端文档改动归本会话，提交后核对工作区干净。真实模型/B/C、人工复核、视频与新系统复现仍未完成。

## 上一切片快照（6411a0b，历史验证）

- 本轮开始分支 backend/payment-api、HEAD dbffd01、工作区干净，worktree 位置已核实。读取 AGENTS.md、本文、PRD 导出/证据要求、API-CONTRACT、ADR 0001/0004 后核对代码，继续导出核查。仅后端，真实模型持续跳过。
- 核查结果与修复详见 docs/EXPORT-REVIEW.md：JSON 与保存报告一致；旧 Markdown 漏掉证据 QuerySpec/列名/覆盖率/signal/note 与报告状态。新增 apps/api/src/report-export.ts，由原 export 路由调用，完整保留报告口径/状态/原始比较贡献/来源/trace，以及每条证据完整 JSON，自身子范围不再依赖报告总范围猜测。导出不重新查数或覆写报告。
- 进一步修复模板自身范围：退款原因事实明确本期、SKU/渠道/大区；活动假设与 SignalService note 明确 SKU/渠道匹配、包含全范围活动、无大区归因、仅本期或基期重叠。JSON/Markdown 共用同一保存的报告，不分别改写语义。
- 当前验证对象 dbffd01 加本次提交差异：npm run typecheck、npm test（75/75，0 跳过，49.08 秒）、npm run build 通过。生产代码未再变动，之后新增的旧版/转义专项单元 1/1 通过，最终 typecheck 再次通过；没有把该新增用例冒称为完整 npm test 的 76/76。tests/integration/report-export.test.ts 真实 PostgreSQL + Pi faux + HTTP：独立 SQL/手工预期确认总退款 350000 分、A 子范围 300000 分/2 事件；验证退款、活动子范围、partial、missing 的 JSON 与落库 DTO、Markdown 代码块与证据 GET 一致。
- 本轮全部修改归本会话，随修复提交：app.ts/report-export.ts、agent/report.ts、analytics/signals.ts、两个导出测试、API-CONTRACT、EXPORT-REVIEW 和本文；未改前端、冻结标签、历史报告，无新增依赖/DTO/迁移。临时数据库均正常停止，收尾以 git status 核实。
- 当前停留点：报告导出内容与证据范围切片完成。未重跑 240 次冻结评测、规模性能、socket smoke、浏览器 Markdown 渲染；真实模型/B/C、人工复核、前后端浏览器验收、视频/全新环境复现仍未完成。后续优先验证现有本地启动/备份恢复说明的实际复现缺口，不扩展 P1。

## 1. 职责、目录、分支和提交

- 负责后端、数据库、指标计算、Pi runtime、API、共享契约与后端验证/交付；不修改前端页面或 docs/progress-frontend.md。
- 工作目录 D:/llm/Commerce Lens-backend，分支 backend/payment-api。主 worktree D:/llm/Commerce Lens 的 main 在 25a18ec，由前端会话使用，未合入最新后端。
- 最近已提交实现 dbffd01（子范围解释与指标匹配）、f5cb3d5（库存解释引用/合池限制），此前 c4885cf 为三指标、信号、生命周期、离线评测、恢复，ec08b13 是支付金额初版，不能作为当前能力上限。
- 当前最近业务实现 HEAD=6411a0b；本轮文档交接开始工作区干净，最新交接提交用 git log -1 查询。验证版本见顶部快照，不将文档修改当成新一轮业务验证。
- 用户最新要求：做好交接，新窗口开始本地前后端连接；保留已有页面，先支付金额链路。真实模型仍被排除，即使有 Key 也不能调用。公网部署不在当前范围。

## 2. 已完成功能与主要文件

| 功能 | 主要文件 |
|---|---|
| 三主指标、时间/筛选、比较/贡献/Top-N | packages/metrics/src/index.ts；packages/analytics/src/service.ts、query-compiler.ts、compare.ts；packages/agent/src/intent.ts |
| 库存、渠道大区流量、活动、退款原因 | packages/analytics/src/signals.ts；db/migrations/004-signals.sql |
| 证据/hash/范围/数值校验、模板事实和有限解释 | packages/agent/src/report.ts、tools.ts；packages/analytics/src/hash.ts |
| Pi 六工具、预算和重试 | packages/agent/src/pi.ts、budget.ts；packages/analytics/src/retry.ts |
| REST/SSE、同源限制、模式标识、导出 | apps/api/src/app.ts、report-export.ts |
| 持久化、owner/store 归属、幂等、会话/报告/证据 | apps/api/src/repository.ts；db/migrations/002-app.sql |
| 队列、取消、超时、重启中断、SQL 取消 | apps/api/src/runs.ts；packages/analytics/src/cancellation.ts |
| 删除会话、反馈、cursor 分页、30 天清理、SSE 410 | repository.ts、app.ts；db/migrations/003-session-lifecycle.sql |
| 复合键、数据版本不可变、发布校验、只读/RLS | db/migrations/001-business.sql；db/seeds/generate.ts |
| Windows 本地 PostgreSQL 18 与三角色连接 | scripts/local-postgres.ts、api-dev.ts、api-start.ts |
| S01—S12、冻结案例、独立 SQL | db/seeds/scenarios.ts；evals/cases/；evals/oracles/ |
| 评测/性能/真实 HTTP smoke | scripts/evaluate-offline.ts、benchmark-local.ts、verify-api.ts |
| 固定表白名单快照与空库恢复、源码包 | db/snapshot.ts；scripts/snapshot.ts、release.ts |

数据均为合成食品电商；CNY/Asia/Shanghai，业务时钟固定 2026-10-22。默认 signals-v1 有辅助信号；acceptance-v1 为小型人工验收集；固定种子支持 90 天 10 万订单/20 万行。API 主入口 paid_amount/refund_amount/sold_units，其他底层指标不代表已开放自然语言入口。

## 3. 验证结果与对应版本

### 上轮 dbffd01（历史，非本轮）

子范围库存/流量解释修复，ADR 0004；typecheck、npm test 72/72（0 跳过，44.85 秒）、build 通过。真实 PostgreSQL/Pi faux/HTTP 验证华东 A 增长、华北下降的反例，支持同范围正例，不把子范围观测当作其他范围的解释。当前导出切片验证见顶部，不能用本段代替。

### 上轮 f5cb3d5（历史，非本轮）

20 份保存报告经独立自动核查：总量/逐贡献与独立 SQL、结构/hash/引用检查通过，2 份库存解释漏引 contribution，详见 REPORT-REVIEW.md 与 report-review-2026-10-22T11-26-39-851Z.json。不是人工复核，历史报告与冻结标签未改。f5cb3d5 修复后 typecheck、npm test 64/64（0 跳过，40.84 秒）、build 通过；本轮不将其当作当前通过。

### 上一会话交接核验（历史，非本轮）

已核对 worktree、Git、实际文件与原始结果；本次未修改业务代码，验证对象为 c4885cf 的实现（交接前 HEAD=0bc9e9c）。2026-10-22 实际重新运行：npm run typecheck 通过；npm test 60/60 通过、0 跳过（约 44.2 秒）；npm run build 通过；node dist/scripts/verify-api.js 的真实 HTTP/SSE、25 个事件、断点重放与报告/证据持久化均通过，比较为 7000000/10000000 分，agentExecuted=false。最新 smoke 证据已重新生成在 evals/results/backend-api-smoke.json，随本次交接保存。

本次没有重跑 240 次离线案例或 10 万订单性能测试，下面明确保留为既往成绩，不冒充本次测量。没有外部模型请求。交接前后均检查本 worktree 未残留 PostgreSQL 进程。

### 既往验证（实现 c4885cf，文档 HEAD 0bc9e9c）

- typecheck、npm test 60/60（0 跳过）、build、node dist/scripts/verify-api.js 通过。真实 PostgreSQL 18.4 与 loopback socket；Pi Core 使用明确 faux transport，工具执行真实 SQL，不能当作 DeepSeek 验收。
- 120 案例，dev/frozen-test 各 60，family 隔离，冻结集三次，共 240/240。最新既往结果 evals/results/offline-2026-10-22T10-43-12-334Z.json；外部模型请求 0。audit-*.json 有 20 份自动审计样本，humanReviewCompleted=false。
- 10 万订单/20 万行、20 次预热+100 次本地 HTTP 测量：median 139.18 ms、P95 150.08 ms，记录 performance-2026-10-22T10-29-09-360Z.json。这是当时环境的确定性管线耗时，不是模型延迟或当前重测结果。
- 实际启动构建产物，三指标分别得到支付金额 7000000/10000000 分、退款 300000/0 分、件数 70/100；provenance.agentExecuted=false。12 场景 CLI 发布和备份 CLI 通过；恢复测试包含报告、反馈与活动任务中断。
- 源码包 .local/releases/commerce-lens-backend-c4885cf.zip：123 项，305683 bytes，SHA256 4461f472ffd3810cc1ed2512af558e926d857b226a197e77365e59a51a243078。它对应旧实现提交，不包含本次交接文档更新。

未验证：真实 DeepSeek 连通/多轮质量/价格/延迟、真实模型 B/C 基线、20 报告人工复核、前后端真实联调、演示视频与其他系统环境。不能声称完整 P0 已验收。

## 4. 进行中任务和停留点

导出内容/证据范围切片已完成，当前实现与验证见顶部快照；旧报告 2 份引用缺口仍保留，历史内容不会在导出时悄悄重新生成。下一会话先核对 Git，再按第 8 节处理明确的非模型证据缺口，不重新搭架构或重复抽样来凑通过。

## 5. 未提交修改、归属与进程

- 本轮开始后端 worktree 干净；本轮提交范围见顶部快照，全部为本会话成果。收尾后以 git status --short 核实，不 reset/clean 新出现的来源不明修改。
- 原目录 D:/llm/Commerce Lens 的前端未提交成果归另一会话；本轮没有读取或修改其页面/进度、暂存或清理，仅 git worktree list 读取分支位置。不能把 main 的 v1.0.0 文档视作当前后端。
- .local/.tools/node_modules/dist 为忽略文件；本地数据库、备份、少量历史失败临时库不入 Git。不要打印 .env 或 connection.env。本文不保存密钥或连接密码。
- API 不保证常驻，新会话需核对 3000/55432 端口和进程归属，不误停前端 Vite 或其他 worktree 服务。

## 6. 关键决定与原因

- 单 Agent、受控 QuerySpec；服务端注入权限/版本，模型没有 SQL/Shell/文件工具。确定性代码查数，金额整数分、退款成功时间、支付退款分开聚合；贡献可负或超过 100%。
- 核心数据门禁强制执行；模拟数据/确定性/真实 Agent 显式区分，供应商失败不自动伪装为演示成功。事实和解释从证据模板生成，有限规则不证明因果或损失。
- 数据集发布后不可变，报告证据不可覆写；取消/完成/保存锁同一 run，终态不可反转。SSE 先持久化，重放不重算。
- 单本地进程使用数据库 lease，2 执行+10 排队，60/min 请求限流；重启中断遗留任务，不自动重放调用。重试共用预算，隐藏 SDK 重试关闭，不增加消息队列或多 Agent。
- 备份限定固定表白名单、同迁移版本的空库恢复；冻结案例有 manifest，不删失败或原地改标签。历史取舍见 docs/decisions/0001-baseline.md、0002-payment-backend.md、0003-offline-backend-completion.md，后者更新前者的旧未完成项。

## 7. 已知问题、复现和阻塞

- 真模型验收延期且无调用授权；不要因 Key 可用就运行 verify:pi。无凭证不阻塞独立本地工作。
- 确定性解析只支持有限表达：用“数据异常”复现澄清，“今天支付金额”复现完整日拒绝，复杂问题使用 confirmedIntent；不是通用 NLP 泛化。
- SKU 排除转授权包含集合，剩余超过 20 项澄清不截断。大规模商品目录排除 SKU-01 触发限制，小数据“排除 A 呢？”应重查 B/C。
- 历史 Top-N 其他行因字段顺序导致 hash 失败，现新证据 sha256-canonical-json-v1 并兼容旧 hash；edge-cases.test.ts 有残差行→报告落库回归。不得删旧兼容逻辑。
- Windows Ctrl+C 曾同时终止 DB，现隐藏独立进程组、API/连接池先关闭再 pg_ctl wait；shutdown.test.ts 有并发关闭回归。PTY Ctrl+C exit 1 是信号退出，不宣称普通 exit 0。
- 自动报告样本不等于人工复核，尚不能声称双人审核。冻结评测是合成小样本，不夸大真实业务效果。
- 前后端未合并/真实联调；另一会话仍用 mock 和旧契约。发送跨会话消息需用户授权，文件交接本身不意味着可以发指令给另一个聊天。

## 8. 下一步优先级

1. 按 AGENTS.md 恢复，核对 Git/实际实现；优先处理真实复现的失败和非模型 PRD 验收缺口。不要重新搭建已完成模块，不重复大规模验证来凑进度。
2. 本轮已完成 20 报告独立自动核查、PRD 出口核对及 dev/专项修复，详见 REPORT-REVIEW.md。保留人工复核缺口，不能把自动核查重复改称人工完成；旧报告核查仍应报出 2 例 F1。
3. 用户已选择联调为下一步：按 INTEGRATION-HANDOFF/INTEGRATION-PROMPT 在原前端目录保护未提交成果，先完成共享契约最小同步及支付金额真实浏览器链路；后端独立 deterministic 运行，不盲目合并。首片通过再验澄清/追问、退款/件数与失败路径。
4. 本地构建启动/备份空库恢复的新系统复现仍是后续候选，不优先于本次用户选择的联调。真实模型/人工/视频出口不由自动审计或联调代填。
5. 真模型与 B/C 评测持续延期，直到用户明确改变要求。前端/视频由其负责会话处理，不把这些当成本地工作的阻塞。

## 9. 前后端契约与同步

唯一契约 packages/contracts/src/index.ts（QuerySpec）、http.ts（HTTP 1.1.0），文档 docs/API-CONTRACT.md，样例 examples/payment-flow.json / schemas.json。沿用已有 DTO 与路由，不另起一套。

- 三主指标；金额 unit=fen、件数 unit=units，null 不显示为 0。phaseName 映射四个前端阶段；0—7 phase 不直接索引四项数组。
- Evidence.signal/hashAlgorithm 可选；Fact.templateId 新增 signal；hypothesis 含 missingEvidence 和可选 contradictingEvidenceIds；ReportDraft 可选 signalEvidenceIds，旧 provenance 1.0.0 可读取。证据数量可变、rows 原值未格式化。
- 本轮仅行为同步：库存供应约束假设现在引用 comparison、contribution、inventory 三类证据；仅单个下降 SKU 可获该解释，多 SKU 合池保留事实与 unknown；退款下降不解释为销售供应约束。原 QuerySpec/HTTP 1.1.0 schema、路由、迁移和依赖未变；API-CONTRACT.md 已说明 evidenceIds 不固定为两个。不向另一聊天发消息或自动合并。
- 子范围补充：渠道/大区筛选与指标证据不匹配时不生成库存/流量解释，但保留带实际范围的 facts 并增加 unknown；同集合不同顺序等价，SKU-only 流量仅为背景。仅文本与解释生成条件改变，不新增契约字段，见 ADR 0004。
- 本轮导出同步：Markdown 现为可独立阅读的完整证据导出，包含每条原 EvidenceDTO JSON 与报告状态/原始值/执行记录；机器消费仍用原 JSON。退款/活动文本补充范围和粒度限制。HTTP 1.1.0/QuerySpec/路由不变，无根依赖或迁移同步；见 API-CONTRACT 和 EXPORT-REVIEW。不自动合并前端或向其聊天发消息。
- DELETE /api/sessions/:id；POST /api/reports/:id/feedback；历史 cursor 在 X-Next-Cursor，原数组响应不变；SSE 过期 410 REPLAY_EXPIRED，details.reportUrl 可读最终报告。
- 迁移增加 003/004，不改旧 SQL。原目录 main 仅到 25a18ec，合并需审查 package.json、package-lock.json、tsconfig.json、.env.example；Fastify 5.12.7/API scripts 为后端引入，前端独立 package/lockfile 保留。
- 用 catalog 数据版本和字典，禁止发送 scenario/storeId/ownerId/SQL。前端 fixture nuts/oats、mall/live 不是后端 A/B/C、douyin 等授权 ID。
- 后端 AGENTS.md 已补恢复规则，尚未修改前端所在 main 的规则；其会话需自行同步“读职责进度/PRD/契约→核对 Git/代码→持续更新自己的进度”。本会话不并行编辑前端规则或进度。

## 10. 必要命令

```powershell
cd 'D:\llm\Commerce Lens-backend'
git status --short
git branch --show-current
git worktree list
git log -5 --oneline
. .\scripts\bootstrap-node.ps1
# 已有 Node 24 和可用 node_modules 时无需重复安装。
npm ci
$env:ANALYSIS_MODE='deterministic'
npm run api:dev
# http://127.0.0.1:3000/api/catalog；DB 127.0.0.1:55432；Ctrl+C 停止。
```

独立终端验证，不依赖已启动 API：

```powershell
. .\scripts\bootstrap-node.ps1
npm run typecheck
npm test
npm run build
node dist/scripts/verify-api.js
# 独立核查保存的旧报告（发现 2 项已记录 F1，预期非零退出；不改写旧报告）：
node --import tsx scripts/audit-report-samples.ts
# 仅在相关改动/失败/疑点需要时扩展：
npm run eval:offline
npm run benchmark:local
```

db:scenarios 需持久 DB；db:backup 输出 .local；db:restore 仅对明确指定的空库，DATABASE_URL/BACKUP_FILE 在本机配置；release:source 要求已提交且干净，旧 ZIP 不会随文档更新。详见 BACKEND-QUICKSTART.md、EVALUATION.md、DEMO.md。
