# 当前前端切片：经营概览阅读顺序改进已验收（2026-10-24）

本轮按用户确认的竞品调研顺序改进页面，继续沿用已验收的真实HTTP概览。顺序为：紧凑页头/日期 → 指标及变化 → 趋势与规则提示 → 可展开数据与口径详情。原服务保持运行，直接刷新 `http://127.0.0.1:5173/?dataset=signals-v1` 查看；未重启/停止服务。真实后端仍为deterministic，未调用模型。

- **页面**：版本选择移到页头，signals显示“经营演示”，场景显示“演示场景 Sxx”，技术版本ID保留在详情。渠道/大区/SKU默认收起，有URL筛选时自动展开；收起后显示所选范围摘要，刷新和清除仍有效。日期集中一行，固定业务时钟/发布时间/计算时间等移入详情，合成标识与完整截至保留。
- **读数**：三卡压缩，主值下方紧接后端变化率，再显示基期与差值；退款零基期明确不可计算。桌面趋势左、规则右，规则项优先显示整体或商品名称、差值/变化率与两期值，贡献份额不截断；原后端规则文案可展开。完整趋势表和数据口径详情在下方按需展开。未增加计算、规则、原因或新分析执行入口。
- **实现范围**：App.tsx仅增加概览布局class及演示徽标文案；DataPages/OverviewPanel、相关styles。HttpApi、QuerySpec、共享schema、后端、数据库、run/SSE/取消/导出逻辑无改动。真实用例overview-read增加首屏布局、筛选展开/收起与刷新、详情和友好名称检查；overview-read/oracle仅增加可选证据输出目录环境变量，避免覆盖上轮验收文件；默认路径仍兼容。无新依赖/lock、无子Agent、无提交。
- **保护**：修改前292文件完整快照`.local/frontend-overview-layout-20261024/before.tar`，SHA256 `3c193c10bd664b2b16fb2fbddc469430a6cd2bc5c47da5ad3aa8ada4e3cf32e1`，逐项核对归档包含全部非忽略未跟踪成果。原回归写出的旧预算截图已从本快照逐字节恢复，新截图另存。本轮未reset/clean、盲合并或覆盖其他成果。
- **最终验证**：`npm run typecheck --prefix apps/web`、`npm run test --prefix apps/web`（12/12）、`npm run test:e2e --prefix apps/web -- --output=artifacts/overview-layout-20261024/e2e-final`（36/36，22.0秒）、`npm run build --prefix apps/web`通过。build内再次typecheck通过，保留图表包562.50kB提示。
- **真实链路**：设置`COMMERCE_LENS_OVERVIEW_ARTIFACTS=artifacts/overview-layout-20261024`后运行`npm run test:integration --prefix apps/web -- overview-read.spec.ts --output=artifacts/overview-layout-20261024/real-browser-final`，1/1通过（11.5秒）；经Vite读取最新Fastify/现有PostgreSQL，无响应替换，23份请求/响应，外部请求/pageerror=0。三周期/三指标/授权筛选、零基期/缺覆盖/无规则、快速切换、刷新与旧report/run恢复仍通过。
- **数值**：同环境变量下执行`npm run test:integration:overview:oracle --prefix apps/web -- --before`及无before版本，69个卡片比较、690个日比较、30个规则比较与独立SQL/手工值一致。前后sessions13/runs16/reports16/events399/evidences80、数据集发布指纹不变。支付7000000/10000000分、退款300000/0分、件数70/100仍为真实小数据结果，当前库无portfolio-90d-v1。
- **视觉**：320/390/820/1280/1440/1920六尺寸实际Chromium检查，无页面横向溢出/pageerror；查看了桌面、笔记本、手机、筛选、表格、详情、缺覆盖截图。1440×960及1920×1080首屏完整显示三卡和趋势，规则同屏；较窄屏幕按顺序纵向阅读。手机Enter可展开筛选，表格可聚焦横向滚动。没有把手机或1280×800宣称为完整趋势首屏。
- **证据与状态**：`apps/web/artifacts/overview-layout-20261024/`的README、verification.json、responsive.json、桌面/手机截图、overview-browser/overview-sql-oracle、快照指纹、六类最终日志和真实浏览器trace。本轮无失败门禁；视觉迭代修正窄屏筛选换行和元数据占位。服务仍为Vite28252/API30168/PostgreSQL38244，5173/3000/55432保持运行。

剩余边界不变：analysisQuery确认、明确datasetVersion的新session/run/SSE闭环是下一切片；新分析目前仍沿用catalog默认版本。支付成功订单总数字段尚缺；不从总订单推算。未运行真实模型、新建业务run、portfolio发布/十万订单验收、后端全套/冻结评测/规模性能，未重做分析工作台。

---

以下为此前切片历史记录。

# 此前前端切片：经营概览真实 HTTP 接入已验收（2026-10-23）

**当前服务状态（按用户要求重新启动预览）**：前端 `http://127.0.0.1:5173/?dataset=signals-v1`，Vite PID28252；最新后端通过原`api-start.ts`启动，PID30168、3000端口、明确deterministic，不实例化模型；既有PostgreSQL PID38244、55432端口。未迁移/seed或发布新版本，服务保持运行。真实Chromium再次确认三卡为¥70,000.00/¥3,000.00/70件、30日趋势、2条规则提示，pageerror0；经Vite的ready/overview均成功。运行日志、PID和浏览器检查在`.local/preview-overview-20261023-live/`。下方“验收服务已停止”描述此前验收收尾，不代表此次预览服务状态。

本节是当前有效状态。本轮只完成概览读取：三指标卡、1/7/30天、授权筛选、30天日趋势及可访问表格、规则提示、URL恢复、请求隔离。数据概况继续保留；概览→analysisQuery确认→明确datasetVersion新session→run/SSE闭环留给下一切片。

## 实现与语义

- 统一HttpApi新增overview(version, query, signal)，使用后端OverviewRequestSchema（原QuerySpec）和OverviewSchema/DTO；校验响应版本、查询范围、三主指标和单位。请求体不额外包query，不传权限/版本/SQL，没有平行接口。窗口、日点和变化项analysisQuery原样保留。
- 从所选版本profile取得固定业务时钟与授权渠道/大区/SKU字典。昨天对上周同日、近7天对前7天、近30天对前30天，初始groupBy=sku/topN=10；换版本清除旧筛选。URL以dataset/days/metric/channel/region/sku恢复；越权筛选报错、不静默替换，原report/run优先恢复工作台。
- 三卡直接读metrics.comparison及后端实际日期，金额整数分仅显示时转元，数量为件。不重算比较/贡献/规则；null显示“—”，真实零保留，零基期变化率不可计算。固定业务时钟、版本发布时间、计算时间、完整截至日期分别展示，顶部时钟随预览版本变化。
- 趋势直接读取30个日点，实线/虚线识别两期，connectNulls=false、不补零；表格包含两期日期、数值、差值、变化率和独立可用性/原因。changes最多5条，标注“规则提示”，保留负数及超100%份额，说明不是统计显著性或已证实原因；无规则与数据不足分别显示。
- 新useOverview以完整版本/QuerySpec/重试代次隔离状态，切换/重试立即隐藏旧值，AbortController加active清理隔离迟到响应，支持加载/错误/重试/不可用。没有概览分析执行按钮；查看/筛选/趋势切换不创建session/run，不调用模型。
- 文件：App、DataPages、Chart、api/types、styles；新增OverviewPanel、overview-scope、use-overview；测试data.test/overview.spec及新增overview-boundaries、real-integration/overview-read和overview-oracle。package仅新增overview oracle命令，无依赖/lock变化。未改现有报告/取消/SSE/导出逻辑，未委派子Agent。

## 保护、契约和实际服务

- 前端main@25a18ec，后端backend/payment-api@a250286，均含既有未提交成果；未提交、reset/clean、盲合并或改后端业务/迁移/种子。修改前完整快照231个非忽略的已跟踪/未跟踪文件：`.local/frontend-overview-20261023/before.tar`，SHA256 `e74f04749e9125c4f901b2794ac7b9d2aa52d35a84d73decb864339a9609035b`，归档清单逐项核对；旧快照保留。
- 六文件逐字节一致：contracts/src/http.ts、examples/schemas.json/overview.json/dataset-profile.json/payment-flow.json、docs/API-CONTRACT.md。QuerySpec index.ts文本一致，仅行尾不同，本轮无需同步/修改契约。已读后端OVERVIEW-HANDOFF与ADR0005，未只比较1.2.0字符串。
- 真实Chromium→Vite5173→Fastify3000→PostgreSQL18.4/55432，Node24.22.1。直接导入后端当前源码，包含已验收overview，未使用上轮.local冻结副本。明确deterministic、recover=false、无模型runtime，state/reader全部default_transaction_read_only=on；不迁移、seed或写业务数据。25个实际后端生产文件指纹在最终浏览器验证前后无漂移。
- 使用既有signals-v1、scenario-S08-v1（缺覆盖）、scenario-S10-v1（无规则），概况回归另读acceptance-v1。当前库无portfolio-90d-v1；没有发布或验收十万订单版本。真实测试无page.route/响应替换，外部请求0、pageerror0、未创建模型请求。
- 应用表前后sessions=12/runs=15/reports=15/events=374/evidences=75，数据集发布指纹不变。已核对归属后停止本轮API16016与数据库36352（pg_ctl正常停止），3000/5173/55432释放，库保留；没有停止未知服务。原回归固定写入的7个概况证据和1个预算截图，已另存本轮结果并从快照逐字节恢复旧成果。

## 最终验证

| 命令/检查 | 本轮结果 |
| --- | --- |
| `npm run typecheck --prefix apps/web` | 通过，build内也通过 |
| `npm run test --prefix apps/web` | 12/12，0跳过 |
| `npm run test:e2e --prefix apps/web -- --output=artifacts/frontend-overview-http-20261023/e2e-verified` | 36/36，21.8秒；保留全部生命周期断言 |
| `npm run test:integration --prefix apps/web -- overview-read.spec.ts profile-read.spec.ts --output=artifacts/frontend-overview-http-20261023/real-browser-verified` | 真实浏览器2/2，13.0秒；概览、概况及旧report/run恢复 |
| `npm run test:integration:overview:oracle --prefix apps/web -- --before` / 无before | 69个卡片比较、690个日比较、30个规则比较与独立SQL一致；应用表/发布指纹不变 |
| `npm run build --prefix apps/web` | 通过；图表包562.50kB/gzip190.71kB体积提示保留 |
| 视觉/交互 | 桌面三卡/趋势/规则、390px图表/表格已查看，无页面横向溢出；修正图例与日期重叠 |

真实浏览器覆盖版本切换、1/7/30天、三指标、授权筛选、缺覆盖、零基期、无规则、快速切换、重复操作、刷新、原report/run恢复；故障transport仅承担新增概览错误/null/份额/越权/竞态等边界，不能当作真实读数证据。原取消、SSE重连/410、异步隔离和导出回归均通过。

手工值（signals-v1、昨天、全部范围）：支付7,000,000/10,000,000分，退款300,000/0分，件数70/100；A贡献−4,000,000、份额4/3，B贡献+1,000,000、份额−1/3；A筛选支付2,000,000/6,000,000分。oracle独立使用订单头/相关订单行支付聚合、成功时间退款聚合、原始水位，未导入生产计算/规则函数。

已解决的过程失败：首次新增e2e34/36，原因是fixture共享对象污染、portfolio样例误用小数据预期；新增测试DTO类型错误；首次真实浏览器按钮可访问名选择器不匹配；oracle初稿漏掉退款对orders/order_items的覆盖依赖。修正样例隔离/预期、显式可访问名与oracle依赖后通过；未删用例、弱化断言或改业务计算。失败浏览器trace保留，最终没有待处理验收失败。

交付证据：`apps/web/artifacts/frontend-overview-http-20261023/README.md`、verification.json、overview-browser.json（23份实际版本/完整QuerySpec请求响应）、overview-sql-oracle.json、runtime-source.json、契约/快照指纹、最终六份日志/trace与真实桌面/手机截图。

## 停留点与剩余缺口

经营概览HTTP读取已完成并验收。下一切片实现analysisQuery确认、指定datasetVersion新session，再复用原run/SSE。当前useWorkspace新分析仍用catalog默认版本，不能声称预览版本已贯穿分析；已有报告与追问保留原session/version。支付成功订单总数仍缺后端共享字段，页面单列“后端尚未提供”，不得用总订单数代替。

未运行：新增业务session/run、真实外部模型、portfolio发布/十万订单浏览器、后端完整测试、冻结评测、规模性能；不借用历史成绩。本轮没有做导入/平台授权/自动同步/P1或分析页重做。

---

以下为上一切片历史记录，以顶部当前状态为准。

# 此前前端切片：真实数据概况读取（2026-10-23）

本节为当前有效状态。已同步后端 HTTP 1.2.0，并完成数据概况的真实浏览器→Vite→Fastify→PostgreSQL读取。经营概览三卡/趋势/规则与概览→分析确认仍未实现；本轮不以概况验收代替完整改造验收。

## 实现与范围

- 数据概况通过唯一 HttpApi 的 `profile(version, signal)` 读取共享 DatasetProfileSchema；校验 schema、数量安全整数和响应版本。新增 useDatasetProfile 隔离切换、取消和卸载后的迟到响应；切换时立即清空旧详情，支持独立错误/重试。无生产mock、样例回退或浏览器报告缓存。
- 展示合成来源、版本、固定业务时钟、发布时间、核心完整区间、记录数量、六源粒度/实际日期/排他水位/连续完整截至/缺失分区/检查时间，以及后端指标定义、依赖源和授权字典。来源缺失不会表示为业务零值；库存显示SKU×大区池×小时，流量行数不冒称自然日数，活动结束为排他边界。固定演示版本无自动同步，刷新不会生成新数据。
- 总订单明确“含支付失败”；支付成功订单独立显示“后端尚未提供”。当前共享schema仍没有该总数字段，**此需求尚未完成**，不加平行字段、不从总订单推算。只读SQL核对已有小数据为总订单4、成功订单3，证明两者不能混用。
- 概览页现在可真实取得所选版本的完整截至日期，三指标/趋势/规则仍显示未接入。概况与概览页读取均不会创建session/run或调用模型。版本选择仍是数据预览；后续分析闭环须把明确版本传给createSession，不能继续使用useWorkspace当前的catalog默认版本。已有报告/追问继续原session。
- 实际改动：App.tsx、components/DataPages.tsx、lib/api.ts/types.ts、新lib/use-dataset-profile.ts、styles.css；package.json仅新增profile只读oracle命令，无依赖/lock变化。测试更新data.test/http-support/overview.spec，并新增profile.spec、real-integration/profile-read.spec.ts和profile-oracle.mjs。保留全部原生命周期用例和断言，未委派子Agent。旧真实支付用例payment.spec.ts仅更新显式workspace入口与HTTP1.2.0版本期望；本轮未执行其新增run/导出流程，以保持只读，不能把历史报告读取当成该流程验收。

## 保护与接口同步

- 原目录main@25a18ec，apps/web和本文仍未跟踪；后端backend/payment-api@a250286带其他会话未提交成果。未reset/clean、提交、盲合并或修改后端业务/迁移/种子/凭证。
- 修改前快照 `.local/frontend-profile-20261023/before.tar`，203个非忽略的已跟踪/未跟踪文件，SHA256 `a9ed4300ed4e61d9776e80f9053d1351e98321da1301a6f917f7c7ebeb63f7be`，归档清单逐项核对。上轮173文件快照也保留。
- 精确同步后端六文件：contracts/src/http.ts；examples/schemas.json、dataset-profile.json、payment-flow.json、overview.json；docs/API-CONTRACT.md。初次同步后后端继续完成overview，本轮收尾已同步其最终发布版本；记录见 `.local/frontend-profile-20261023/contract-sync-final.json`。QuerySpec/index.ts文本一致，仅原行尾不同，未修改。没有放宽schema，也未自行定义接口。
- 后端收尾已经完成overview，进度记载100/100后端测试；这仅是后端验收，**前端overview尚未接入**。下一切片可以直接读后端OVERVIEW-HANDOFF/ADR0005后实施，不必再等接口。前端使用的DatasetProfile/Catalog/Report/Run schema与后端最终版本逐项比较一致。

## 真实联调与验证

- 使用现有长期数据库的已有 `signals-v1`、`acceptance-v1`，不发布新版本。当前库未有portfolio-90d-v1，**本轮没有验收10万订单概况**。100000行的测试transport样例只用于故障回归，不进入产品。
- 后端在继续并行改动，因此将源码只读复制到本前端 `.local/frontend-profile-20261023/backend-source` 固定运行，保留37个源文件hash；profile服务与后端最终源码hash一致。使用原buildApp，明确deterministic、不实例化模型runtime、recover=false、数据库连接default_transaction_read_only=on。仅禁用本次验收启动恢复/清理，产品源码和默认生命周期不改。没有迁移、seed、业务写入或新建run。
- 真实Chromium无page.route/响应替换：概况读取、两版本切换、完整截至、六源记录数/粒度/检查时间、acceptance缺少库存覆盖、刷新、390px无横向溢出、无权限版本、原报告URL优先恢复及再刷新均通过。恢复的是既有partial报告d5b35706-6f6e-4c70-b8c7-3dc058b74c1a，不重新执行历史模型。
- 独立只读SQL逐源核对数量与实际日期，并核对原始水位/缺失分区/检查时间；手工预期两个版本均为订单4/订单行6/退款3，成功订单3。signals另有576库存池小时/24流量行/1活动。应用表验证前后sessions=12/runs=15/reports=15不变。浏览器只发GET，外部请求0，pageerror0；本轮模型调用0。

| 命令/检查 | 最终实际结果 |
| --- | --- |
| `npm run typecheck --prefix apps/web` | 通过；最终build内也通过 |
| `npm run test --prefix apps/web` | 10/10，0跳过 |
| `npm run test:e2e --prefix apps/web -- --output=artifacts/frontend-profile-20261023/e2e` | 最终31/31，19.4秒；保留取消、SSE410、异步隔离和导出回归 |
| `npm run test:integration --prefix apps/web -- profile-read.spec.ts --output=artifacts/frontend-profile-20261023/real-browser` | 真实只读浏览器1/1，最终截图版本5.5秒 |
| `npm run test:integration:profile:oracle --prefix apps/web -- --before` / 同命令无before | 前后应用表数量不变，独立SQL/手工值/日期/水位全部通过 |
| `npm run build --prefix apps/web` | 最终通过；保留既有ECharts517.03kB提示 |
| 过程中首次build | 新增测试JSON推断过窄导致TS错误；补充共享DatasetProfile类型标注后通过，无业务逻辑或断言变动 |
| 视觉 | 已检查真实桌面源卡片与手机缺覆盖状态；使用滚动分段截图避免长元素在固定滚动区内截出空白 |
| 本轮未运行 | 前端overview、概览→新分析、真实新增run、真实缺失分区/零基期、概览/报告/导出数值一致性、真实模型及后端全套重测 |

证据：`apps/web/artifacts/frontend-profile-20261023/` 中profiles-real.json、profile-browser.json、profile-sql-oracle.json、真实截图、Playwright trace、verification.json与README；样例transport和真实读取证据明确区分。

准确停留：真实概况读取已验收已提供字段，支付成功订单字段待后端补齐；下一轮接经营概览，随后再做analysisQuery确认和指定版本新会话。验收后仅停止本轮启动的API进程36172与PostgreSQL29540（pg_ctl正常关闭）；原数据库与其他会话服务不清理。Vite由Playwright自行退出。再次启动时勿直接使用真实Agent配置；本轮只读serve.ts用于读取验收，不能用来创建新分析。

---

以下为历史记录；历史“当前”与服务状态不覆盖本节。



# 当前预算收尾优化已验证（2026-10-23）

预算收尾切片已完成。精简模型工具返回/保留完整证据入库导出；规范化发送上下文保守计数并预留submit_report；预算紧张转为仅提交，保留一次修订；原始BUDGET_EXCEEDED传播到run/SSE/partial报告与Markdown；前端顶部显示部分成功原因；真实模型验收必须completed且trace含成功submit_report。新Agent promptVersion=analysis-v3；硬限制未提高，原真实记录与zip未修改，本轮外部模型调用0。

验证：HTTP1.1.0隔离基线a250286+14个预算/既有Windows启动文件，typecheck、86/86测试（真实PostgreSQL，0跳过，176.93秒）、build通过，前后指纹一致且本轮文件hash与共享源一致。原共享全套83/86（1个Markdown文本转义断言已修复、2个来自并行1.2.0契约切换）；另一路profile/数据集升级未覆盖、未并入本轮结论。最新前端typecheck、9/9单元、28/28浏览器、build通过。完整日志/指纹见apps/web/artifacts/agent-budget-optimization-20261023。

离线验证：重放原四条真实响应+明确模拟最终提交，真实SQL工具执行后completed，5请求/8工具/6完整证据；第五轮输入上界24476降到4068。原真实样本依旧partial；不冒称修复后真实DeepSeek完成或成本下降。后续真实completed验收仍待独立运行。本轮服务未新启动，避免与并行数据集/profile工作冲突；隔离数据库均正常关闭。

详细交付：D:/llm/Commerce Lens-backend/docs/AGENT-BUDGET-OPTIMIZATION.md；主目录apps/web/artifacts/agent-budget-optimization-20261023/OPTIMIZATION.md、backend-verification.json、frontend-verification.json、offline-replay-result.json和partial-budget-banner.png。

---

此前历史记录：

# 当前真实 DeepSeek 单次执行快照（2026-10-23）

用户在本会话明确授权“跑一次真实链路，并把所有过程数据内容保存后分析”。已完成1个真实浏览器业务run，DeepSeek模型ID deepseek-flash，4次真实HTTP200，7次SQL工具调用、6证据、27SSE事件，13539 tokens，估算成本USD0.002206008，run耗时7.10秒。原始run=57b2f2ae-90d1-4592-8f78-32fef1439701，report=d5b35706-6f6e-4c70-b8c7-3dc058b74c1a，session=ebad3e3a-4a5d-489d-970c-371bea3f1977。业务终态partial，agentExecuted=true，不能称完整Agent成功。

独立SQL/手工预期7000000/10000000分、A−4000000/B+1000000通过，报告/导出/6证据/27事件与数据库一致，schema及证据hash校验通过。离线响应重放（外网0）定位：累计13539实际tokens后，第5轮输入的UTF8字节上界24476超过剩余16461预算，在发请求前BUDGET_EXCEEDED；Agent错误最终归并为REPORT_NOT_SUBMITTED。保存partial及原始错误，不改不可变报告、不抬预算、不重跑第二次真实run。

完整证据目录D:/llm/Commerce Lens/apps/web/artifacts/real-agent-20261023/；ANALYSIS.md有调用时序、数值/解释审核和建议，model-transport.jsonl保存全部4次请求body/原始响应流（无Authorization），sql-queries.jsonl保存791条录制期SQL模板/参数/结果（含启动/目录/状态，非791业务聚合），source-data.json保存实际来源表与提取SQL，database-snapshot.json、events.sse、model-calls.json、timeline.json、report.json/md、截图、Playwright trace、offline-replay.json、analysis.json和SHA256 manifest.json均保留。已知凭证值扫描通过，未输出/保存Key或连接密码。

本轮前端typecheck、7/7单元、23/23隔离HTTP浏览器、build通过；真实模型浏览器1/1通过表示partial链路被捕获，不代表completed。后端typecheck/build通过；业务源码未改，未重跑完整77项/冻结评测/性能/人工。真实用例在独立playwright.real-agent.config.ts内，默认test:e2e排除real-agent，且需显式COMMERCE_LENS_REAL_AGENT_ONCE=1；不会被普通回归自动付费执行。

现有API已切为agent、signals-v1，前端/真实PostgreSQL继续运行；单次采集器已停止，不再录制后续模型/SQL内容。当前API使用后端.local/real-agent/start.ts（不加载capture.mjs）连接已有55432数据库、监听3000，前端5173。该本地启动器源码已复制进证据包；api:dev对现有数据库会拒绝重复启动，正常使用已有库可用api:start但其默认数据版本可能不同。本次未修改生产启动器。后续优先离线修正工具回传冗余/预算估算和原始错误传播，再另行验收completed；当前用户仅授权一次真实run，不继续自动发起新run。

---

以下为此前历史状态；“禁止真实外部模型”等限制已由本次用户对单次真实运行的明确授权覆盖，不能将历史deterministic记录当作本次结果。

# 当前 HTTP-only 联调快照（2026-10-23）

用户明确要求“测试联调是否正常使用后端数据、mock去除”。当前前端 main@25a18ec，后端独立 backend/payment-api@a250286（业务6411a0b，Windows启动器含独立未提交修复）。当前前端应用唯一数据源为 HTTP API/真实PostgreSQL；保留原视觉，不保留生产mock入口。用户原成果修改前快照 `.local/integration/pre-http-only-20261022.tar`，SHA256 `FB82643F4EBBE86D82F4815256FFC4278BFF052BC675775C13AFB74BE0AF1B6A`。旧实现和专用测试的原文放在 `apps/web/tests/archive/20261022/*.txt` 作为可追溯记录，不参与TS/Playwright发现；HTTP故障隔离测试仍通过测试transport注入响应，不构建进产品。

真实 Chromium→Vite→Fastify→PostgreSQL18.4支付链路已通过：普通输入、session/run/SSE、报告与5条证据、真实引用、刷新/后端历史、JSON/Markdown下载。第二轮“按渠道进一步拆解”真实POST携带 parentRunId，新报告/2轮历史/刷新均恢复。独立SQL与手工预期7000000/10000000分、A−4000000/B+1000000、库存池24/24/零库存10一致；agentExecuted=false、模型请求0。最终前端typecheck、7/7单元、23/23浏览器（HTTP响应故障隔离）、真实支付+渠道浏览器1/1、oracle、build全部通过。原视觉未重做。

本轮改动 api.ts、use-workspace.ts、types.ts、presentation.ts、App.tsx、ReportView.tsx、EvidencePanel.tsx、Chart.tsx、selectors.ts；删除 fixtures.ts、storage.ts、ScopeDialog.tsx，移除 browser cache/source mode/mock flow。Settings只显示服务端catalog；日期由 businessClock计算；证据自动按真实kind引用；分析报告/历史/run刷新完全从服务端恢复。渠道追问快捷输入改为服务端支持的“按渠道进一步拆解”；排除SKU按钮使用当前报告真实SKU key。HTTP无完整目录，不提供推测式范围选择。共享HTTP1.1.0保留、旧provenance1.0.0可读、不放宽schema、不提交 scenario/mock ID。库存池聚合展示不变，不绘制虚假逐小时数据。

联调中用户报告postgres.exe弹窗，后端Windows启动器已改独立隐藏控制台；修复前窗口回归失败，修复后完整77/77和typecheck/build通过，实际Ctrl+C释放API/DB，再启动及真实浏览器重测通过，当前可见数据库窗口0。此项改动位于后端scripts/local-postgres.ts及新增窗口回归，不修改后端业务语义。

详情和证据：[INTEGRATION-RESULTS.md](INTEGRATION-RESULTS.md)。原始本地成果先打tar快照；没有reset/clean/盲合并后端。改造中移除了仍在需求范围的mock功能，故旧演示/存储回归归档为txt快照，HTTP生命周期与用户交互重新覆盖。证据位于apps/web/artifacts/http-only/，包括真实浏览器网络记录、SSE重放、下载、SQL oracle与截图。既有旧verification.json只记录旧代码状态，不作为当前通过；当前命令按最终HTTP-only版本重跑。

准确停留：后端数据唯一路径已实现并完成支付/渠道追问真实浏览器验收。前端HTTP故障/生命周期23条、单元7条、typecheck/build均过；后端deterministic API和PostgreSQL保持ready，Windows窗口0。尚未真实验收澄清确认、指定SKU排除、退款/件数、缺数据/partial/取消/服务重启恢复场景；外部模型持续禁止。服务供本地审查保留：Vite5173、API3000、DB55432。详情见联调记录。未提交修改全部仍在原目录，后端worktree保持独立。

---

以下为联调前历史快照，仅用于追溯；当前状态以顶部快照和INTEGRATION-RESULTS为准。
# Commerce Lens 前端进度交接

快照更新：2026-10-22，Asia/Shanghai。此文件是前端跨会话恢复的唯一进度入口，以当前有效状态覆盖更新；后端进度由另一会话维护在 progress-backend.md。

## 恢复与持续更新规则

1. 新会话依次读取根 AGENTS.md、本文件、docs/PROGRESS.md 的已验收阶段、docs/PRD.md 的指标/页面与交互/状态机/报告结构章节、docs/decisions/0001-baseline.md，以及 docs/API-CONTRACT.md；涉及接口时核对 packages/contracts/src/http.ts 与 index.ts。
2. 检查 Git 状态、分支、工作目录和实际实现，再核实此文件；以用户最新要求优先，文档不能代替代码。若当前源码与验证指纹不同，旧通过记录只作历史证据，按变化范围重新验证。
3. 从下方优先级最高的未完成任务推进一个可验证切片，保留已验证交互与参考图视觉。开始新工作前检查是否有其他会话正在改同一文件。
4. 每完成小任务，或停止工作、切换任务、准备结束会话前，更新本文件的停留位置、修改归属、验证与下一步；保留当前有效状态，不追加聊天流水账。目前前端尚未提交，必须保留磁盘文件；后续若产生前端提交，再通过 Git 记录核对。

## 当前职责、目录与 Git

- 职责：apps/web 的页面、交互、图表、统一 API adapter 以及本文件。用户最新要求：实施本地保存与恢复可靠性，必须用实际测试验收后才能标记完成；保持 mock，暂不做界面适配或真实后端联调。
- 仓库/工作目录：D:/llm/Commerce Lens；前端目录：D:/llm/Commerce Lens/apps/web；分支 main。
- 当前 HEAD：25a18ec3e64ae2d8384a101eb6fd403d5bb9038f，docs: defer backend logic until frontend pages are ready。实际 Git 中尚无前端提交。
- 最近相关共享契约提交：0c9d3b2，feat(contracts): define payment analysis HTTP and SSE schemas with verified examples。
- 数据计算基线：cef46cc。git ls-files apps/web docs/progress-frontend.md 仍为空。
- Git 状态：apps/web 内源码、配置、独立锁文件、字体与许可证、截图、验证指纹，以及本文件均为 untracked；普通 git diff 看不到它们。本轮未暂存、提交或清理，必须在原目录继续，不能通过新 checkout 自动恢复这些文件。文档此前出现的提交计划不能当作已经提交。
- 另一会话的独立工作树：D:/llm/Commerce Lens-backend，分支 backend/payment-api；检查时该工作树 HEAD 为 0bc9e9c。该工作树内修改归后端会话，本会话未审核或修改。

## 已实现与主要文件

| 功能 | 主要文件（相对仓库根目录） |
| --- | --- |
| 深绿导航、工具栏、欢迎、历史搜索、指标口径、设置、输入区及状态界面 | apps/web/src/App.tsx、src/styles.css、src/main.tsx |
| 报告：本期/基期/变化、核心发现、贡献图/明细、事实/解释/缺失信息、导出入口 | apps/web/src/components/ReportView.tsx、Chart.tsx |
| 证据详情、证据选择、执行记录、口径、查询条件、库存图/表、Esc 与焦点恢复 | apps/web/src/components/EvidencePanel.tsx、ui.tsx |
| 商品×渠道筛选和贡献维度调整；应用新增一轮，取消保留原报告 | apps/web/src/components/ScopeDialog.tsx |
| 同一会话多轮回看、最近会话合并并显示轮次、已完成报告刷新恢复 | apps/web/src/components/SessionTrail.tsx、src/lib/use-workspace.ts、selectors.ts |
| 模拟运行刷新后明确中断、终态保存、保留范围重试、取消/完成竞态 | apps/web/src/lib/api.ts、use-workspace.ts、src/App.tsx |
| 会话导航同步锁、同帧重复提交、卸载与异步回调隔离、重连终态保护 | apps/web/src/lib/use-workspace.ts、api.ts、src/App.tsx、tests/lifecycle.spec.ts、lifecycle-harness.tsx |
| 本地存储损坏/不可用告警、范围快照失效后强制确认、任务与报告引用校验 | apps/web/src/lib/storage.ts、api.ts、use-workspace.ts、src/App.tsx、src/components/ScopeDialog.tsx、tests/storage.spec.ts |
| 集中模拟数据、受支持范围检查、追问继承、排除商品与重新计算 | apps/web/src/lib/fixtures.ts |
| mock/HTTP adapter、共享 schema 校验、运行事件、取消与导出 | apps/web/src/lib/api.ts、types.ts |
| 金额/比例格式、phaseName 映射、零库存区间推导 | apps/web/src/lib/format.ts、selectors.ts |
| 数据/契约测试、浏览器交互、截图 | apps/web/tests/data.test.ts、workspace.spec.ts、visual.mjs |
| 前端独立配置、启动说明、本地字体与许可证 | apps/web/package.json、package-lock.json、vite.config.ts、playwright.config.ts、README.md、public/fonts/ |

以上表格中的 src 相对简写均位于 apps/web 下。完整路径以实际文件为准。

- 输入支持 Enter、Shift+Enter、中文 composition，空内容不能提交，运行中锁住重复任务。失败时恢复输入草稿。支持澄清、部分成功、核心数据不足、空数据、失败、取消和模拟断线恢复。
- mock 固定数据：2026-10-21 对比 2026-10-14，华东，paid_amount；商品 nuts/oats，渠道 mall/live。金额始终为整数分。退款/销量操作禁用，仅保留指标定义。
- 人工预期：总体 7,000,000→10,000,000 分（本期/基期），变化 −3,000,000 分、−30%；坚果变化 −4,000,000 分、燕麦 +1,000,000 分；坚果零库存 10 小时。
- 共同筛选预期：坚果×商城本期 1,500,000 分、基期 4,500,000 分；商城整体 4,500,000/7,000,000 分；排除坚果后燕麦 5,000,000/4,000,000 分、+25%。报告/图表/表格/导出从相同 fixture 派生。范围外库存证据会被移除。
- 未开放指标、范围及无关问题先澄清；不假装执行自然语言 Agent。演示事件间隔仅为交互回放，页面明确标记“前端 mock / 未执行 Agent”。
- 宽屏三栏；1280px 以下证据抽屉，小屏导航折叠。字体本地托管，无 Google Fonts 请求，保留 SIL OFL 许可证。

## 当前代码的验证证据

本轮开始时核对生命周期切片 35 项指纹一致，先跑红 4 条故障回归，再补到 25 条专项用例。本表是本轮最终源码的重新验证结果，不沿用旧成绩。

| 命令 | 本次结果 |
| --- | --- |
| npm run typecheck --prefix apps/web | 通过 |
| npm run test --prefix apps/web | 11/11，通过，0 跳过 |
| npm run test:e2e --prefix apps/web | 72/72，通过，约 1.5 分钟（原 47 + 存储专项 25） |
| npm run build --prefix apps/web | 通过，包含再次类型检查；ECharts 分包仍有约 550 kB 提示 |

- 环境：项目自带 Node 24.22.1、Windows、Playwright Chromium；本轮实际起止时间、退出码、HEAD 与源码/配置/公共资源、README 和测试的 37 项 SHA256 保存在 apps/web/artifacts/handoff-verification.json（与 storage-verification.json 同一结果）。sourceUnchangedDuringChecks=true，检查后未再改源码。本轮原始日志为 storage-verification.log；上轮 lifecycle-verification.json/.log、refresh-recovery-verification.json/.log 和初始 handoff-verification-baseline.json 均保留。*.log 被根忽略规则忽略，仅本机证据。
- 数据测试保留人工数值/既有独立 SQL 结果样例、共同筛选与守恒、零/null、越界与引用安全；新增最后 inspecting 回调先取消、完成后再取消的确定性计时测试，断言终态只出现一次且取消不产生报告。
- 浏览器保留原 29 个工作台和 18 个生命周期用例；本轮新增 25 个存储专项用例：范围记录缺失、坏 JSON、null、错误类型、错 run、越界地区/日期均禁止直接重试；取消范围确认不建任务，明确重新选择可恢复相同金额；禁用 localStorage/sessionStorage、独立 run/report 写入失败、终态写入失败、混合有效/坏记录、坏顶层结构、显式 run/report 坏链接、缺失/错配报告引用均按实际保存状态显示；完成报告以自身 QuerySpec 恢复追问，HTTP 终态不误触 mock 重确认。
- tests/lifecycle-harness.tsx 是仅供测试的真实 React StrictMode harness，通过 Playwright 测试路由加载，未向产品增加测试入口或依赖。导出晚到测试拦截 anchor.click 验证下载副作用；计时测试使用浏览器虚拟时钟，未依赖长时间 sleep。
- 本轮未改布局样式或重拍整套视觉基线；新增并检查 artifacts/storage-range-recovery-1440.png，显示范围待确认、无旧报告、无直接重试按钮。原手机端溢出与其他已有浏览器用例通过；低高度/平板等适配仍按用户要求暂缓。
- 本次未运行根工程检查、PostgreSQL 集成、真实 HTTP/SSE、真实模型或 Agent 测试。上轮根工程检查不视为当前最新验收。HTTP 浏览器测试使用网络拦截的 payment-flow.json，不等于连接真实服务。

## 正在进行与准确停留位置

- 本轮第 3 项存储可靠性切片已完成，全部未提交成果保留，无进行中的补丁或本轮失败测试。先跑红的 4 条回归及后来发现的完成运行缺 reportId/错报告引用均保留；最终 25/25 存储专项、11/11 数据、72/72 全量浏览器、typecheck 和 build 通过，指纹对应最终源码。
- 根因与结果：原恢复函数把缺失范围当作 baseQuery，可能扩大筛选后重试；原存储异常被吞掉；完成 Run 与错误报告链接缺少关联校验。现在范围缺失/损坏时进入“待确认”并阻止发送/重试，明确选择范围或新建才可继续；完成报告从自身 QuerySpec 恢复范围，HTTP 保留由服务端 parentRunId 恢复的逻辑。存储损坏/读写失败显示警告，内存任务仍可操作但不声称已保存；坏 run/report 链接报错，不回退到旧成功报告或保留运行锁。
- 准确停留：本切片已验收并更新 README/验证 JSON；后续若继续前端工作，从下节第 4 项导出一致性专项检查。真实服务联调和界面适配仍暂缓，本轮未改后端、共享契约、根配置或依赖。
- Playwright 的 webServer 可启动或复用 127.0.0.1:5173；新会话需自行检查端口，不假设服务仍在运行，也不要关闭其他会话启动的服务。

## 已知限制、复现与下一步（按优先级）

1. 已完成：运行中刷新恢复与本切片取消/完成竞态，验证见上节。选择“持续运行 / 取消”并发送后刷新，应显示“模拟分析已中断”，不回到旧报告，可重试或新建；刷新前已落定的 cancelled/failed/partial/completed 等状态保持原终态。
2. 本轮已完成：会话切换/卸载、同帧重复提交、重连终态与晚到异步结果边界，18 条新增回归通过，完整 47 条浏览器测试通过。保持既有交互：活动任务期间禁止切换会话/新建/切换模式；组件卸载只断订阅、不隐式取消，重挂载可查询恢复；整个 mock 页面重载则按第 1 项标记中断。范围外的真实服务故障与多标签页并发不视作通过。
3. 已完成（本轮）：本地存储损坏/禁用/读写失败及查询上下文恢复。最终四项统一验证通过；范围失效不会静默扩大，用户须明确选择后才能重新分析。禁用存储时仅保证本页运行和导出，刷新后明确报错或中断，不能声称已保存。
4. 候选（未开始）：导出内容一致性验收。已有 JSON 浏览器导出与生命周期测试，但 Markdown 正文、筛选范围、证据引用、partial/null 状态和页面数值的完整一致性尚未专项验收；按发现修复，不无故增加导出格式。
5. 构建体积提示：npm run build --prefix apps/web 可见 ECharts chunk 约 550 kB、gzip 约 187 kB。构建通过；可评估图表 lazy import/按需加载降低首屏成本，不调高阈值掩盖告警。
6. 阻塞于后端覆盖：真实 HTTP 服务、正式库存语义、退款/销量与更广时间/地区数据。用户当前要求 mock，因此这些不阻塞前端推进，也不擅自实现或联调。
7. 用户暂缓：低高度、平板和长文案等界面适配，不作为下一切片。键盘完整导航与对比度尚未专项验收，但本次也不自行启动界面工作。此前仅验证已有三种尺寸；内部滚动与固定输入区的低高度可见性未验收。

模拟自然语言解析为有限规则，不能声称任意经营问题可回答。localStorage 保存最近 30 份报告（原 demo-reports:v1 格式兼容）、活动运行及最近 30 个终态 Run；demo-runs:v1 载入时使用共享 RunSchema 检查并将活动项标记 interrupted。原问题在 Run 内；本标签页最近一次查询上下文使用 sessionStorage 的 run-query:v1，载入时校验 QuerySpecSchema 和 mock 数据字典/窗口。缺失/损坏/不匹配快照返回“范围待确认”，不再默认使用 baseQuery；已完成报告使用报告内 QuerySpec。事件流仍只在内存，刷新不假装继续执行。存储禁用或写入失败时只保证本页运行，页面提示刷新风险；显式 run/report 不存在时显示错误，不退回旧成功报告。坏顶层存储不会在载入时立即覆盖，有效与坏条目混存时保留有效条目。当前未验证多标签页同时模拟运行，mock 仍按单标签页演示使用。当前没有报告删除/重命名功能。

## 未提交内容、归属与设计决定

- 前端既有成果：apps/web 下源码、配置、独立 package-lock、测试、public 静态资源与许可证、README、artifacts 截图和交接验证 JSON；docs/progress-frontend.md，全部保留且尚未提交。
- 本轮修改：apps/web/src/lib/api.ts、use-workspace.ts、src/App.tsx、src/components/ScopeDialog.tsx、README、本文件；新增 src/lib/storage.ts、tests/storage.spec.ts、artifacts/storage-verification.json/.log 与 storage-range-recovery-1440.png，更新 handoff-verification.json。上轮数据/工作台/生命周期测试、fixture、截图、旧指纹、字体与全部未提交文件均保留；未改依赖、锁文件、共享类型或样式。
- 运行生成并忽略：apps/web/node_modules、dist、test-results、*.log。它们不是需要手动迁移的源码，但当前 test-results 含最近测试状态。
- 他人工作：根 AGENTS.md、docs/PROGRESS.md、docs/progress-backend.md、PRD/ADR/API-CONTRACT、packages、数据库、根 package/lock 及后端工作树。当前工作树没有这些文件的未提交变更；不将它们归为本会话成果，不修改或覆盖。
- 本轮未执行 git add/commit/push。Git、文档曾出现的提交意向与实际状态不一致，以上述当前 Git 核对为准。根 docs/PROGRESS.md 由另一会话维护，按用户职责划分只更新本前端进度文件。
- 数据和解释统一放 adapter/fixture；页面只展示 DTO，不自行生成分析结论。类型直接复用共享契约，保留金额整数分、null、覆盖不足与真实零值差别。
- 独立 apps/web/package.json 与锁文件用于隔离前后端并行安装；该方式已在 API-CONTRACT.md 确认，当前不重组 workspace。
- 保留已验收的深绿导航、开放式报告、浅绿证据栏、正负贡献图与有限动效。原始参考图在上一会话的临时附件中，跨会话不保证仍存在；先使用当前代码与已保存截图恢复视觉基线，不声称读过缺失图片。

## 接口与主开发会话同步

- 当前共享契约 v1.0.0，仅 paid_amount；Report/Evidence/Run DTO 直接复用。HTTP adapter 路径与 schemas 以 docs/API-CONTRACT.md 及 packages/contracts/src/http.ts 为准。前端目前使用 mock，不要求启动后端。
- phaseName 映射到四项 UI 阶段；Evidence rows 中金额按列的“分”格式化；证据数量可变，不能强制 E03；SSE 按 runId/seq 去重，EOF 不能判成功，取消和断开订阅分开处理。
- mock 的 web-demo-v1、nuts/oats、mall/live 不能发送给真实服务端。HTTP 请求不含 scenario，模型 Key/数据库 URL 不进入浏览器。服务端字典和自然语言解释由后端提供。
- 需要同步但尚未改字段：正式库存证据的小时 rows 与观测粒度语义；退款/销量开放时 supportedMetrics/unit/Clarification 的一致演进。新增需要先记录具体字段影响，由主开发会话协调。
- 后续真实 HTTP 协调需求：若创建 run 请求已被服务端接收，但页面在收到 runId 前关闭，当前契约的历史接口仅含已出报告会话，客户端无法定位尚在运行的任务。本轮只验证卸载后不订阅、不隐式取消、不改 URL；mock 接受的任务仍完成并进入报告历史。真实服务需协调按会话查询 activeRunId，或提供可持久化 Idempotency-Key 的请求结果查询；本轮未增加共享字段或擅自实现后端。
- 根 AGENTS.md 只有“先读 PROGRESS/PRD/ADR”的部分规则，没有完整职责进度恢复与持续更新规则；本会话是前端，文件由另一会话维护，故未并行覆盖。请主开发会话加入：新会话先读 AGENTS、职责进度、PRD 相关章节与接口契约，再核对 Git/实际代码，从最早未完成任务继续；每个验证切片、停工、切任务、结束前覆盖更新职责进度。

## 启动与验证

PowerShell 7，在 D:/llm/Commerce Lens 执行：

```powershell
. ./scripts/bootstrap-node.ps1
# 仅依赖缺失或锁文件变化时安装；先检查另一会话是否正在改依赖。
npm ci
npm ci --prefix apps/web
npm run dev --prefix apps/web
```

预览 http://127.0.0.1:5173，先检查端口避免重复启动。浏览器若保留 HTTP 模式，进入左下工作区设置改为 mock；必要时仅清除 commerce-lens:mode 偏好，不清理用户报告。

```powershell
npm run typecheck --prefix apps/web
npm run test --prefix apps/web
npm run test:e2e --prefix apps/web
npm run build --prefix apps/web
# 保持开发服务器运行，在另一个终端截图：
Push-Location apps/web
node tests/visual.mjs
Pop-Location
```

Playwright 优先使用本机缓存 Chromium；换机器时设置 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 或安装匹配的 Chromium。遇到安装环境缺口，应报告未运行项，不将旧结果视为通过。


