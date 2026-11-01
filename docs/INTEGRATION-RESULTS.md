# 最新联调：经营概览阅读顺序改进（2026-10-24）

本轮是已验收概览的展示改进：紧凑控制区和友好版本名称、可展开授权筛选、突出主值与变化的三卡、桌面并排趋势/规则、下方表格与口径详情。沿用原HTTP/QuerySpec/DTO，不改计算、规则、后端、数据或模型行为；概览→分析确认仍留下一切片。

- 真实Chromium→Vite5173→最新Fastify3000→现有PostgreSQL55432、明确deterministic；复用用户要求保持的服务，未重启或停止。23份实际请求/响应，无拦截/响应替换，外部请求与pageerror0。signals-v1、scenario-S08/S10与原报告恢复均通过，不发布portfolio数据。
- 最终typecheck、12/12单元、36/36浏览器（22.0秒）、1/1真实浏览器（11.5秒）、独立SQL oracle、build通过。oracle继续核对69卡片、690日比较、30规则比较及手工支付7000000/10000000分、退款300000/0分、件数70/100；应用表sessions13/runs16/reports16/events399/evidences80及发布指纹不变。原生命周期断言保留。
- 实测320/390/820/1280/1440/1920宽度，无页面横向溢出；1440×960/1920×1080首屏完整图表和规则可读。手机筛选键盘展开、条件收起摘要、刷新恢复、可聚焦趋势表和口径详情通过。完整日期、null/零/零基期、负贡献/超100%份额与原规则文案保留。
- 前端修改前292文件快照`.local/frontend-overview-layout-20261024/before.tar`，SHA256 `3c193c10bd664b2b16fb2fbddc469430a6cd2bc5c47da5ad3aa8ada4e3cf32e1`；无reset/clean/提交/契约同步/依赖变化。原预算截图由快照恢复，本轮结果另存。真实用例/oracle支持可选`COMMERCE_LENS_OVERVIEW_ARTIFACTS`隔离输出，本轮使用`artifacts/overview-layout-20261024`，没有覆盖上轮真实概览证据。
- 证据：`apps/web/artifacts/overview-layout-20261024/`中的README/verification、responsive、实际overview-browser/overview-sql-oracle、桌面/手机/详情/缺覆盖截图和最终日志/trace。未解决失败0；保留既有图表包562.50kB提示。详情与准确命令见前端进度。
- 剩余：analysisQuery确认、指定datasetVersion新session及run/SSE、支付成功订单字段仍未完成；未运行新增业务run、真实模型、十万订单、后端全套/规模/冻结评测。预览服务继续运行：[经营概览](http://127.0.0.1:5173/?dataset=signals-v1)。

---

# 此前联调：经营概览真实 HTTP 接入已验收（2026-10-23）

本轮已完成三卡、1/7/30天、授权渠道/大区/SKU筛选、30天趋势与可访问表格、规则提示、URL恢复和请求隔离。复用原QuerySpec及共享OverviewRequestSchema/OverviewSchema/DTO，无生产mock回退、不重算业务结果。analysisQuery保留，概览→确认/新session/run留给下一切片。详细状态见 [progress-frontend.md](progress-frontend.md)。

- **实际服务**：前端main@25a18ec，最新后端backend/payment-api@a250286加既有未提交overview实现；Chromium→Vite5173→Fastify3000→PostgreSQL18.4/55432，Node24.22.1。直接加载后端当前源码，非上轮.local冻结副本；25个生产文件指纹在最终浏览器验证前后一致。明确deterministic、recover=false、无模型runtime，state/reader全部只读，不迁移/seed/写业务数据。
- **保护和同步**：231文件完整快照`.local/frontend-overview-20261023/before.tar`，SHA256 `e74f04749e9125c4f901b2794ac7b9d2aa52d35a84d73decb864339a9609035b`，包含未跟踪成果，旧快照保留。六个共享schema/样例/API文档逐字节一致，QuerySpec仅行尾不同，本轮无需复制/改契约，无依赖/lock变更。未reset/clean、提交、盲合并或改后端。原用例重写的旧概况/预算证据已恢复原内容，本轮结果另存。
- **实际数据**：signals-v1、scenario-S08-v1（缺覆盖）、scenario-S10-v1（无规则），概况回归另读acceptance-v1。当前库没有portfolio-90d-v1，不把十万订单样例当当前数据。真实浏览器无路由拦截/响应替换，外部请求与pageerror均0，概览不创建session/run/model请求。
- **实际请求**：`POST /api/datasets/signals-v1/overview`；原QuerySpec示例：`{metricId:"paid_amount",currentWindow:{startDate:"2026-10-21",endDateExclusive:"2026-10-22"},baselineWindow:{startDate:"2026-10-14",endDateExclusive:"2026-10-15"},filters:{},groupBy:"sku",topN:10}`。23份实际版本、完整请求与响应保存在overview-browser.json；后端实际窗口/日点/变化项analysisQuery未改写。
- **数值核对**：独立SQL使用订单头/相关订单行支付聚合、按成功时间单独退款聚合、原始水位，不导入生产计算函数。69个卡片比较、690个日比较、30个规则比较一致。手工signals昨日支付7,000,000/10,000,000分，退款300,000/0分，件数70/100；A贡献−4,000,000、份额4/3，B贡献+1,000,000、份额−1/3；A筛选支付2,000,000/6,000,000分，全部一致。null、真实零、零基期和负/超100%份额没有截断或替代。
- **无写入验证**：前后sessions12/runs15/reports15/events374/evidences75，数据集发布指纹不变。旧partial报告d5b35706-6f6e-4c70-b8c7-3dc058b74c1a及run57b2f2ae-90d1-4592-8f78-32fef1439701从原链接恢复与刷新通过，不重跑历史模型。验证后只停止本轮API16016和数据库36352（pg_ctl正常停止），三端口释放，数据库保留。
- **最终门禁**：typecheck、12/12单元、36/36浏览器（21.8秒）、2/2真实浏览器（概览+概况，13.0秒）、SQL oracle、build通过。原取消/历史/报告刷新/SSE重连与410/异步隔离/导出断言保留。桌面/390px图表和表格已检查，图例与日期重叠已修正；build保留图表包562.50kB/gzip190.71kB体积提示。
- **已解决失败**：首次新增e2e34/36的fixture共享污染和数值预期混用、测试DTO类型、首次真实浏览器按钮可访问名选择器、oracle退款覆盖依赖遗漏均修正；失败浏览器trace保留。未删测试/弱化断言/改业务口径，最终无待处理失败。
- **证据**：`apps/web/artifacts/frontend-overview-http-20261023/`：README/verification、overview-browser、overview-sql-oracle、database-before、runtime-source、启动器、契约/快照指纹、六份最终log、e2e-verified/real-browser-verified trace、真实截图和profile-regression。
- **未运行与剩余**：新建业务run、概览/新报告/导出数值闭环、portfolio发布/十万订单浏览器、真实模型、后端全套/冻结评测/规模性能未运行。下一切片做analysisQuery确认、明确datasetVersion新session和原run/SSE闭环。当前新分析仍用catalog默认版本，不能视为预览版本已贯穿分析；支付成功订单总数字段仍待后端提供。

---

以下为此前记录，测试数量与服务状态仅对应当时。

# 此前联调：数据概况真实HTTP已验收（2026-10-23）

本轮真实Chromium→Vite→Fastify→PostgreSQL18.4验证了数据概况读取。共享HTTP1.2.0最终契约六文件已从后端精确同步，QuerySpec不变；后端同时已完成overview，但前端概览与分析闭环留到下一切片。详情与当前有效范围见 [progress-frontend.md](progress-frontend.md)。

- 保护：原目录203文件快照 `.local/frontend-profile-20261023/before.tar`，SHA256 `a9ed4300ed4e61d9776e80f9053d1351e98321da1301a6f917f7c7ebeb63f7be`。未reset/clean、提交/合并或修改后端业务、迁移、种子和原有数据版本。
- 真实接口：GET catalog + GET datasets/:version/profile；生产HttpApi按共享schema校验数量安全整数和版本，切换/卸载会取消并隔离旧请求，加载/错误/重试可见。概况包含六源覆盖与实际日期、数量、定义/依赖源、字典。总订单含失败；schema仍缺支付成功订单总数，单独显示“后端尚未提供”，该字段需求未完成。
- 实际数据：使用既有signals-v1、acceptance-v1，不写入新portfolio数据。两个版本4订单/6订单行/3退款事件；SQL确认成功订单3。signals有576库存池小时/24渠道大区日流量行/1活动，acceptance对应覆盖缺失，零行不冒充业务零。当前库没有portfolio-90d-v1，未验收10万订单读取。
- 验收服务：后端源码复制到本前端.local冻结运行（37文件hash，profile.ts与最终后端一致），buildApp明确deterministic+recover=false，state/reader连接default_transaction_read_only=on。不加载模型runtime、不迁移、不seed。仅用于本轮读取，产品默认生命周期未变。测试结束只停止本轮API36172与DB29540，pg_ctl正常关闭；现有库保留。
- 真实浏览器1/1：六源读数、切换/刷新/缺覆盖、未知版本、390px无横向溢出、已有报告URL优先和刷新恢复通过；无路由拦截或响应替换。旧报告保持signals-v1和原内容，不新建run。浏览器只有GET、外部请求/pageerror均0。
- 独立SQL逐源核对计数、实际起止日期及原始水位/缺分区/checkedAt，手工小数据预期通过；应用表前后sessions12/runs15/reports15不变。10/10单元、31/31隔离浏览器、typecheck/build通过。首次build的测试JSON类型错误修正后通过；没有删测试或弱化断言。ECharts体积提示保留。
- 证据：`apps/web/artifacts/frontend-profile-20261023/` 下profiles-real.json、profile-browser.json、profile-sql-oracle.json、真实桌面/手机分段截图、real-browser trace、verification.json。e2e子目录使用测试transport，仅验证故障/竞态；不作为真实读数证据。
- 未运行：真实新增run/模型、前端overview、概览→分析确认、概览/报告/导出数字一致性、真实零基期/缺分区，以及新portfolio库发布。本轮外部模型调用0。

下一切片直接按后端已完成的overview契约与OVERVIEW-HANDOFF接入三卡/窗口/筛选/趋势/规则。之后再传后端analysisQuery与明确datasetVersion建立新会话；已有报告与追问保持原session。缺少支付成功订单总数字段须由后端补契约，前端不另造字段或推算。

---

以下为此前切片/历史联调证据，测试数字和服务状态仅对应原时刻。

# 最新联调边界：前端数据入口结构切片（2026-10-23）

本轮只完成前端概览/数据概况入口及目录版本预览；未完成 profile/overview 真实接入，不能以本轮测试截图宣称 PostgreSQL 业务读数通过。最新前端状态见 [progress-frontend.md](progress-frontend.md)。

- 前端仍在原目录 main@25a18ec，未跟踪成果先完整归档：`.local/frontend-overview-20261023/before-unicode.tar`，173文件，SHA256 `b333fba4168e31edaf9ed954e03f38795d6d1b05bc3469652a67b22574b4910a`。未重置、清理、盲合并、提交或改后端/数据库。
- 本轮开始两边HTTP1.1.0；收尾时后端其他会话已将 API-CONTRACT 更新为1.2.0并提供 profile schema/路由/样例，overview明确未实现。前端本轮未复制变动中的契约，仍1.1.0。下一步按后端文档五文件清单同步；不得把 CatalogSchema 版本校验放宽来掩盖不同步。QuerySpec保持原结构。profile尚缺“支付成功订单总数”共享字段，counts.orders不可代替。
- 默认概览、数据概况、`page/dataset` URL刷新恢复、无权限版本不回退、原run/report优先恢复、无效完整水位/数量不补零、移除“数据已更新”、显式createSession版本及响应错配拒绝已实现。概览/概况不会创建session/run或调用模型。版本选择目前是数据预览，尚未接入分析确认。
- typecheck、9/9单元、最终28/28浏览器、最终build通过。首次e2e为26通过/2 trace文件ENOENT失败，保留失败记录，独立输出目录重跑全部通过；未删用例或弱化断言。原取消/SSE410/异步隔离/导出回归继续运行。原工作台输入测试改为显式workspace入口。既有ECharts体积提示保留。
- 本轮真实浏览器→Fastify→PostgreSQL、profile/overview读数、SQL oracle和报告/概览一致性**未运行**。收尾直接探测3000/5173均连接拒绝；未启动未知配置的Agent服务或自动调用真实模型。后端另一路临时测试PostgreSQL进程由原会话管理，没有停止。
- 可审查证据：`apps/web/artifacts/frontend-entry-20261023/verification.json`、README、overview/profile桌面和手机截图、e2e输出；截图和浏览器成功用例均使用测试transport，不能当作真实HTTP业务读数。生产src保持唯一HTTP路径，无样例回退。

下一切片先核对后端profile交付及支付成功订单字段，精确同步共享契约并在明确deterministic服务上完成概况真实HTTP读取；overview与分析闭环依次验收，当前均不标完成。旧单次真实模型授权不适用于本轮，本轮外部模型请求0。

---

以下为历史联调证据，服务状态与测试数字只对应原记录时刻。

# 当前预算收尾优化已验证（2026-10-23）

预算收尾切片已完成。精简模型工具返回/保留完整证据入库导出；规范化发送上下文保守计数并预留submit_report；预算紧张转为仅提交，保留一次修订；原始BUDGET_EXCEEDED传播到run/SSE/partial报告与Markdown；前端顶部显示部分成功原因；真实模型验收必须completed且trace含成功submit_report。新Agent promptVersion=analysis-v3；硬限制未提高，原真实记录与zip未修改，本轮外部模型调用0。

验证：HTTP1.1.0隔离基线a250286+14个预算/既有Windows启动文件，typecheck、86/86测试（真实PostgreSQL，0跳过，176.93秒）、build通过，前后指纹一致且本轮文件hash与共享源一致。原共享全套83/86（1个Markdown文本转义断言已修复、2个来自并行1.2.0契约切换）；另一路profile/数据集升级未覆盖、未并入本轮结论。最新前端typecheck、9/9单元、28/28浏览器、build通过。完整日志/指纹见apps/web/artifacts/agent-budget-optimization-20261023。

离线验证：重放原四条真实响应+明确模拟最终提交，真实SQL工具执行后completed，5请求/8工具/6完整证据；第五轮输入上界24476降到4068。原真实样本依旧partial；不冒称修复后真实DeepSeek完成或成本下降。后续真实completed验收仍待独立运行。本轮服务未新启动，避免与并行数据集/profile工作冲突；隔离数据库均正常关闭。

详细交付：D:/llm/Commerce Lens-backend/docs/AGENT-BUDGET-OPTIMIZATION.md；主目录apps/web/artifacts/agent-budget-optimization-20261023/OPTIMIZATION.md、backend-verification.json、frontend-verification.json、offline-replay-result.json和partial-budget-banner.png。

---

此前历史记录：

# 真实 DeepSeek 单次执行结果（2026-10-23）

用户在本会话明确授权“跑一次真实链路，并把所有过程数据内容保存后分析”。已完成1个真实浏览器业务run，DeepSeek模型ID deepseek-flash，4次真实HTTP200，7次SQL工具调用、6证据、27SSE事件，13539 tokens，估算成本USD0.002206008，run耗时7.10秒。原始run=57b2f2ae-90d1-4592-8f78-32fef1439701，report=d5b35706-6f6e-4c70-b8c7-3dc058b74c1a，session=ebad3e3a-4a5d-489d-970c-371bea3f1977。业务终态partial，agentExecuted=true，不能称完整Agent成功。

独立SQL/手工预期7000000/10000000分、A−4000000/B+1000000通过，报告/导出/6证据/27事件与数据库一致，schema及证据hash校验通过。离线响应重放（外网0）定位：累计13539实际tokens后，第5轮输入的UTF8字节上界24476超过剩余16461预算，在发请求前BUDGET_EXCEEDED；Agent错误最终归并为REPORT_NOT_SUBMITTED。保存partial及原始错误，不改不可变报告、不抬预算、不重跑第二次真实run。

完整证据目录D:/llm/Commerce Lens/apps/web/artifacts/real-agent-20261023/；ANALYSIS.md有调用时序、数值/解释审核和建议，model-transport.jsonl保存全部4次请求body/原始响应流（无Authorization），sql-queries.jsonl保存791条录制期SQL模板/参数/结果（含启动/目录/状态，非791业务聚合），source-data.json保存实际来源表与提取SQL，database-snapshot.json、events.sse、model-calls.json、timeline.json、report.json/md、截图、Playwright trace、offline-replay.json、analysis.json和SHA256 manifest.json均保留。已知凭证值扫描通过，未输出/保存Key或连接密码。

本轮前端typecheck、7/7单元、23/23隔离HTTP浏览器、build通过；真实模型浏览器1/1通过表示partial链路被捕获，不代表completed。后端typecheck/build通过；业务源码未改，未重跑完整77项/冻结评测/性能/人工。真实用例在独立playwright.real-agent.config.ts内，默认test:e2e排除real-agent，且需显式COMMERCE_LENS_REAL_AGENT_ONCE=1；不会被普通回归自动付费执行。

现有API已切为agent、signals-v1，前端/真实PostgreSQL继续运行；单次采集器已停止，不再录制后续模型/SQL内容。当前API使用后端.local/real-agent/start.ts（不加载capture.mjs）连接已有55432数据库、监听3000，前端5173。该本地启动器源码已复制进证据包；api:dev对现有数据库会拒绝重复启动，正常使用已有库可用api:start但其默认数据版本可能不同。本次未修改生产启动器。后续优先离线修正工具回传冗余/预算估算和原始错误传播，再另行验收completed；当前用户仅授权一次真实run，不继续自动发起新run。

---

以下为此前历史状态；“禁止真实外部模型”等限制已由本次用户对单次真实运行的明确授权覆盖，不能将历史deterministic记录当作本次结果。

# 当前数据路径状态（2026-10-23，Asia/Shanghai）

用户要求应用使用后端数据并移除 mock。现已将 `apps/web` 改为唯一 HTTP API 数据路径：删除生产 `MockApi`、fixture 报告/本地事件模拟、场景选择和模式切换；移除 localStorage/sessionStorage 的模式、报告、run、QuerySpec 缓存。页面刷新只向 Fastify 查询服务端 run/report/history，API失败明确显示错误，绝不显示固定样例或回退模拟数据。修改前前端与进度快照为 `.local/integration/pre-http-only-20261022.tar`，SHA256 `FB82643F4EBBE86D82F4815256FFC4278BFF052BC675775C13AFB74BE0AF1B6A`；被退役实现与旧专用测试逐文件原文保留在 `apps/web/tests/archive/20261022/*.txt`，不参与构建/测试发现。React StrictMode、运行锁、取消、SSE恢复、服务端run/report URL恢复、卸载隔离、导出竞态改由HTTP响应故障测试覆盖。

## HTTP-only 验收

- 真实 deterministic 后端 `http://127.0.0.1:3000` / PostgreSQL 18.4 已ready；Vite `http://127.0.0.1:5173` 使用 `/api` 代理。默认数据集 `signals-v1` 是后端发布的合成数据，执行真实SQL，无外部模型 runtime。
- 真正 Chromium 无网络拦截运行：支付问题 → session/run/SSE → 报告、5条真实evidence GET → 独立QuerySpec/columns/rows/signal及真实引用 → 刷新恢复 → 服务端历史 → JSON/Markdown导出。再输入“按渠道进一步拆解”，POST run 带真实 `parentRunId`，收到新的同范围渠道报告，会话显示2轮，刷新恢复第二轮。
- 关键值保持 `7000000/10000000/-3000000` 分，A/B贡献 `-4000000/+1000000`；库存是SKU×大区池24/24小时、零库存10小时，不绘制虚构的小时序列。真实服务/下载/数据库一致，`modelRequests=0`、`agentExecuted=false`、浏览器外网请求0。
- 独立只读SQL oracle与手工预期核对订单头总额、SKU行分组、库存小时和保存DTO。真实浏览器运行和证据位于 `apps/web/artifacts/http-only/`：`payment-browser.json`、`payment.sse`（服务端Last-Event-ID=0真实持久事件重放，且另断言浏览器确实订阅/events）、下载、SQL oracle、截图和Playwright trace。最终真实浏览器用例验证渠道追问后的刷新恢复。
- 当前前端门禁：typecheck通过，unit 7/7；HTTP生命周期、失效响应、旧mock状态不影响HTTP、浏览器禁用存储等e2e为23/23；真实Chromium payment+followup+evidence+refresh+exports为1/1；PostgreSQL oracle通过；build通过。ECharts 517.03kB的既有构建提示保留，未调阈值。
- 最终浏览器支付报告 `4ddabdc2-790a-44f7-bbcc-33c178342528`，渠道追问报告 `c03caf9f-0cdf-4b6b-9461-187784c9e9da`；首轮25个SSE事件、5条证据，追问POST parentRunId与后端history两轮已核对。最终浏览器源记录 `payment-browser.json` 于2026-10-23 01:36（Asia/Shanghai）生成；本地执行时钟为UTC前一日。
- 网络拦截只用于隔离的HTTP传输/生命周期/410故障回归，响应样例只存在 tests，不会构建进应用；生产 `src/` 没有fixture/mock API/本地报告存储。`tests/archive/20261022` 只存文字快照以保留旧未提交成果与原测试来源，不被Playwright扫描。临时Playwright失败输出检查后确认，`test-results/`为空；原始备份tar仍保留未清理。
- 后端业务源码无改动；原 Windows 隐藏控制台修复仍在后端独立worktree，历史77/77与启动器验证见下方历史切片。真实外部模型持续禁用。

## 当前运行进程

本地服务保持以便直接审查：Vite5173、deterministic API3000、PostgreSQL55432均在后台；health/ready为ready，可见PostgreSQL窗口为0。实际 PID 应以当前端口查询为准。页面直接打开 http://127.0.0.1:5173 即用后端数据，不需要设置模式。

# 历史联调记录（支付金额首次接通及 Windows 窗口修复）

2026-10-22，Asia/Shanghai。当前切片：支付金额真实浏览器链路。用户已授权联调，原“暂缓联调”失效。真实外部模型持续禁止。

## 环境与保护

- 前端原目录 `D:/llm/Commerce Lens`，main，HEAD `25a18ec`；开始时 `?? apps/`、`?? docs/progress-frontend.md`。后端独立目录 `D:/llm/Commerce Lens-backend`，backend/payment-api，HEAD `a250286`，业务实现 `6411a0b`，开始工作区干净。
- 联调前源文件快照 `.local/integration/pre-integration-20261022.tar`，SHA256 `276A4108C7A355DC952258C443B2EE3B25A5746CD475D419E3D8C5A24F7D30B8`。包含已有前端源码/测试/公共资源/证据及原职责进度和四个共享契约文件；排除 node_modules、dist、临时测试输出。未 reset/clean、合并分支、覆盖整个 apps 或重新安装后端依赖。
- 快照核对用解包目录 `.local/integration/pre-integration-files` 因自动审批拒绝递归删除而保留；未绕过策略重试，不影响运行或验收，原tar和preservation.json均保留。
- 复用现有 Vite 5173（原 PID 24748），本轮显式 `ANALYSIS_MODE=deterministic; npm run api:dev` 启动 3000/55432。真实 PostgreSQL 18.4，合成 signals-v1。没有实例化外部模型 runtime。
- 仅按清单同步后端 http.ts、payment-flow.json、schemas.json、API-CONTRACT.md；QuerySpec index.ts 核对无差异。HTTP 1.1.0，旧报告 provenance 1.0.0 保持可读，未放宽 schema。

## 切片 1：真实支付链路已通过

- 真实 Chromium 从 UI 设置切到 HTTP，输入“昨天华东支付金额为什么下降？”；Vite `/api` → Fastify → PostgreSQL，session/run/SSE/report/evidence/history/export 全为真实响应。未使用 page.route、响应 fixture 或 faux-provider。
- 浏览器通过 fetch response.clone 只读记录真实 SSE 字节；原响应/状态/请求未替换。初次使用 Playwright response.text 读取已被 adapter 关闭的 SSE 流失败，改为在浏览器只读观察副本后通过；这是证据采集问题，不作为首次通过记录。
- 本期/基期 `7000000/10000000` 分，delta `-3000000`，rate `-0.3`；A `-4000000`，B `+1000000`；份额 `133.3%/-33.3%` 保留。
- 验证每条证据独立 QuerySpec、columns/rows、真实 evidence GET 和假设可变 evidenceIds；库存 A/east 24/24 池小时、零库存10，基期24/24、零库存0；聚合观测没有绘制虚构小时曲线。证据 signal 可展开核对。
- 刷新及后端历史恢复同一报告。浏览器实际下载 JSON 与保存报告深度一致，Markdown 的 QuerySpec/总量/贡献/完整证据/trace JSON 块一致。
- 独立 SQL oracle：订单头总量、订单行 SKU 分组和库存原表分别查询，不调用生产 QuerySpec 编译器；确认浏览器下载与 app.reports 持久化 DTO 相同。只读事务，凭证仅 Node 侧读取本地连接文件，不输出到证据或浏览器。
- `agentExecuted=false`，run.usage.modelRequests=0，浏览器外部请求0，pageerror0。页面明确合成数据、真实 PostgreSQL、确定性计算、未执行 Agent。

证据目录 `apps/web/artifacts/integration/`：`payment-browser.json`（请求/状态/事件/运行）、`payment.sse`（真实事件字节）、`payment.json`/`payment.md`（浏览器下载）、`payment-sql-oracle.json`、`payment-report.png`/`payment-evidence.png`/`payment-inventory.png`，及 `playwright/` 内完整 trace。最终报告 `8f8d755e-eec1-4b83-8bb3-daa5b4383d7e`，25个真实SSE事件、5条证据；最终验证21:17—21:18（Asia/Shanghai），无外部请求/页面错误。

## 切片 2：Windows 数据库弹窗已修复

- 用户在联调中报告大量 postgres.exe 窗口。进程树确认是一套本轮启动的 PostgreSQL 的8个后台worker窗口，不是重复启动8套服务。首先只对该可执行路径的窗口调用 ShowWindow(SW_HIDE)，从8降到0，数据库保持ready。
- 旧 Windows 启动 `windowsHide:true, detached:true` 使父进程没有控制台，PostgreSQL自行创建的子进程又各分配可见控制台；父进程隐藏属性没有传给这些后代。新增真实数据库/并发SQL连接/窗口可见性回归，修复前 `visiblePostgresWindows=11`、测试失败。
- 后端仅修改 `scripts/local-postgres.ts` Windows启动：PowerShell7 Start-Process -WindowStyle Hidden 建立独立隐藏控制台，子进程继承该控制台；保留API控制台Ctrl+C隔离、启动日志/readiness检查和pg_ctl有序关闭。新增只读可见性检查脚本及集成测试，没有业务/DTO/迁移/依赖变化。
- 修复后专项2/2（隐藏窗口、并发关闭顺序）、后端完整77/77（0跳过，154.68秒）、typecheck/build通过。实际启动API→Ctrl+C→3000/55432均释放→重启，再跑真实浏览器与oracle通过。最终可见数据库窗口0。测试比旧启动耗时增加，未重测性能基准，不将此当作性能验收。

## 当前验证

| 命令 | 结果 |
| --- | --- |
| npm run typecheck --prefix apps/web | 最终版本通过 |
| npm run test --prefix apps/web | 最终13/13通过，0跳过 |
| npm run test:integration --prefix apps/web | 最终真实浏览器支付1/1通过，5.4秒，无网络拦截 |
| npm run test:integration:oracle --prefix apps/web | PostgreSQL18.4独立SQL/手工预期/持久化一致通过 |
| npm run test:e2e --prefix apps/web | 最终75/75通过，0跳过，约1.6分钟；包括原72条及新增3条410恢复故障注入回归 |
| npm run build --prefix apps/web | 通过；原ECharts约549.57kB提示仍保留，未调高阈值 |
| 主目录 npm run typecheck / npm run test:unit / npm run build | 全通过；根单元7/7 |
| 后端 npm run typecheck / npm test / npm run build | 全通过；77/77，0跳过，154.68秒；包括新增Windows窗口回归 |

最终9个主目录/前端命令的起止时间、退出码、原始日志和两边源码SHA256在 `apps/web/artifacts/integration/verification.json` 及同目录 *.log；`sourceUnchangedDuringChecks=true`。后端完整门禁见其中backendChecks及本会话工具session93645（未另存完整原始控制台日志）。`preservation.json`核对联调前34个前端文件全部存在，仅12个预期接入文件有修改，styles.css、字体/许可证及原生命周期/存储测试未改。两边git diff --check通过，所有工作未暂存/提交，不覆盖既有untracked成果。

## 边界和下一步

当前验收首个支付链路及本轮暴露的Windows弹窗。SSE410的run.reportId/details.reportUrl恢复、取消订阅后晚到结果3条专项故障注入回归通过；首条支付浏览器未注入故障，不把410样例当真实事件过期验收。澄清/parentRunId、自然语言追问、退款/件数、真实离线/partial/缺数据/取消与重启活动任务恢复后续逐片验收。HTTP仍不提供完整SKU/渠道字典，不用Top-N伪装完整目录，范围编辑仅限mock；HTTP的快捷追问文案和澄清日期选项仍需在下一片按真实报告/业务时钟核对，不宣称多轮已验收。

后端业务实现仍是6411a0b，但Windows开发启动器有本轮未提交修复，不能称源码完全未改。主目录旧M1全数据库套件未重跑，其历史启动器也未盲目同步；当前真实数据库/HTTP验收使用后端独立工作树的完整77项和浏览器/oracle。冻结评测/性能/真实模型/B/C/人工/视频均未运行，不代表完整P0完成。

收尾保持本地服务供审查：原Vite5173/PID24748保留；本轮API3000/PID30468、PostgreSQL55432/PID30328在后台运行，ANALYSIS_MODE=deterministic，可见窗口0。当前API工具session99418可Ctrl+C有序关闭，不停止原Vite或其他服务。打开 http://127.0.0.1:5173，在设置选择本地HTTP API；也可直接打开 `?report=8f8d755e-eec1-4b83-8bb3-daa5b4383d7e`（需HTTP模式）。进程归属最后需按实际端口重新核实，不假设永久常驻。
