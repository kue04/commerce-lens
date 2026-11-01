# 经营概览真实 HTTP 验收（2026-10-23）

本轮切片已验收：统一 HttpApi → POST overview；昨天/近7天/近30天、三指标卡、授权筛选、30天趋势/可访问表格、最多5条规则提示、URL恢复和请求隔离。概览没有分析执行入口，不创建session/run。

真实路径为 Chromium → Vite 8.3.5（5173）→ Fastify（3000）→ PostgreSQL 18.4（55432）。API直接加载 `D:/llm/Commerce Lens-backend` 当前源码，明确deterministic、recover=false、不提供模型runtime；state/reader均default_transaction_read_only=on。没有使用旧冻结源码，没有迁移/seed或业务写入。只启动并停止本轮自有服务，数据库保留；shutdown.json记录释放端口。

实际库没有portfolio-90d-v1。本次使用signals-v1、scenario-S08-v1（缺覆盖）、scenario-S10-v1（无规则），以及概况回归的acceptance-v1。三周期/三指标/三个授权筛选均通过真实HTTP读取；测试transport只用于错误、null/零、份额、越权和网络竞态等边界。目录下e2e截图属于测试transport，真实截图以overview-real开头。

关键手工值（signals-v1、昨天、全部范围，金额为分）：支付7,000,000 / 10,000,000，退款300,000 / 0，件数70 / 100；A贡献−4,000,000、份额4/3，B贡献+1,000,000、份额−1/3。支付A筛选本期2,000,000、基期6,000,000。所有前端业务值均来自响应，只有展示单位转换。

- `verification.json`：最终门禁、已解决失败、未运行项与范围。
- `overview-browser.json`：23份实际版本/完整QuerySpec请求/响应、浏览器HTTP记录、外部请求和pageerror、原report/run恢复ID。
- `overview-sql-oracle.json`：独立SQL、绑定参数、实际日聚合/原始水位、69个卡片比较、690个日比较、30个规则比较与手工值；oracle不导入生产计算函数。
- `database-before.json`：验收前应用表数量和数据集发布指纹。验收后sessions=12/runs=15/reports=15/events=374/evidences=75不变。
- `runtime-source.json` / `serve-readonly.ts.txt`：25个实际后端源码指纹和本轮启动器，无凭证。最终浏览器验证前后源码一致。
- `contract-check.json`：六个共享文件逐字节一致，QuerySpec仅行尾不同，本轮无需契约同步。
- `preservation.json`：修改前231文件完整快照指纹；归档在前端 `.local/frontend-overview-20261023/before.tar`。
- `overview-real-desktop.png`、`overview-real-trend.png`、`overview-real-rules.png`、`overview-real-mobile.png`：真实读数桌面/390px视觉检查。
- `e2e-verified/`、`real-browser-verified/` 与六份log：最终36项浏览器回归、2项真实浏览器、12项单元、类型检查、oracle和build通过。原SSE/410、取消、异步隔离与导出回归均保留。
- `profile-regression/`、`partial-budget-banner-regression.png`：本轮重跑原用例的新证据。原用例固定写入的7个概况证据和1个预算截图已从修改前快照逐字节恢复，旧验收成果保留。

初次新增测试中的fixture污染、数值样例误用、按钮名称选择器和退款覆盖依赖错误均已修正；失败浏览器trace保留在e2e/和real-browser/。最终没有未解决的验收失败。build保留图表包562.50kB（gzip190.71kB）的体积提示。

下一切片才实现analysisQuery确认、指定datasetVersion新session及现有run/SSE闭环。当前useWorkspace新分析仍沿用catalog默认版本；本轮没有把预览版本自动带入分析，也没有点击概览即创建session/run。支付成功订单总数仍缺后端字段；不使用总订单数代替。未发布十万订单版本、未重跑后端全套/规模评测、未调用真实模型。
