# Commerce Lens Web

输入：服务端共享 HTTP DTO；输出：经营变化报告、图表、证据与导出。本目录负责页面和交互，不负责数据库查询、模型调用或业务结论生成。进度与联调边界见 ../../docs/progress-frontend.md；共享契约见 ../../docs/API-CONTRACT.md。

## 运行

在仓库根目录，以 PowerShell 7 执行：

```powershell
. ./scripts/bootstrap-node.ps1
npm ci
npm ci --prefix apps/web
npm run dev --prefix apps/web
```

打开 http://127.0.0.1:5173。也可在 apps/web 执行 npm run dev。前端独立锁文件避免改写后端根依赖，当前方案已在后端联调文档确认。构建为 npm run build --prefix apps/web，产物位于本目录 dist；本地预览用 npm run preview --prefix apps/web。

## 页面与演示

默认启动时直接读取 HTTP API catalog、服务端历史和报告；前端没有 MockApi、fixture 报告、模式切换、场景注入或本地报告缓存。后端不可达时明确显示错误并提供重新连接，不会显示固定报告或切换到模拟数据。普通输入、澄清确认、追问、取消、SSE、历史和导出均请求本地服务。

后端以 deterministic 模式时使用真实 PostgreSQL 和合成数据，不执行 Agent 或外部模型；页面从 catalog.executionMode 和报告 provenance 显示真实服务模式。地区、日期和可支持指标来自后端 catalog/businessClock；报告及每条证据使用服务端 QuerySpec。后端目前不提供完整商品/渠道字典，因此不提供推断式范围编辑。报告允许按渠道再次拆解，也可按服务端支持的语法排除报告中的 SKU。

活动任务的运行锁、取消、SSE序号、断线重连、服务端终态、报告与任务 URL 恢复、卸载隔离及导出竞态均由 HTTP adapter 实现。浏览器 localStorage/sessionStorage 不保存或决定报告和 run；刷新向后端查询原报告/任务。服务端任务即使不完整或无法恢复也显示错误，不回退旧报告。

页面不请求在线字体：DM Sans 变量字体本地托管于 public/fonts，来自 Google Fonts 的 DM Sans 项目，SIL OFL 许可证一同保留；中文回退到系统无衬线字体。

唯一的数据路径使用共享 HTTP 1.2.0 ReportDTO/EvidenceDTO/RunDTO 和 TypeBox schemas；/api 由 Vite 代理到 127.0.0.1:3000。模型 Key、数据库 URL 不得放入 VITE_* 或浏览器。

GitHub 汇总版的前后端位于同一仓库：在仓库根目录运行后端 `npm run api:dev` 和前端 `npm run dev --prefix apps/web`，无需另建相邻后端目录。运行下方真实浏览器 / SQL oracle 脚本前，在仓库根目录设置 `$env:COMMERCE_LENS_BACKEND_DIR = (Get-Location).Path`；后文双目录路径为原始开发与验收记录。

双目录运行：在 `D:/llm/Commerce Lens-backend` 执行 `. ./scripts/bootstrap-node.ps1`，显式设置 `$env:ANALYSIS_MODE='deterministic'` 后 `npm run api:dev`；主目录运行本前端，直接输入“昨天华东支付金额为什么下降？”。默认 signals-v1 为合成数据，真实 PostgreSQL 计算，未执行 Agent。不要运行 verify:pi 或开启 agent 模式。

证据抽屉按各自 QuerySpec/columns/rows/signal 展示。真实库存为 SKU×大区共享池的聚合小时计数，显示 observedHours/expectedHours、zeroHours；没有逐小时数据就不绘制缺货时段。catalog 没有完整商品/渠道字典，不以贡献 Top-N 伪装完整目录；普通输入与追问交由服务端解析，已保存报告沿用真实 QuerySpec。SSE过期恢复和HTTP生命周期回归使用隔离的网络故障测试；真实支付及渠道追问链路以 PostgreSQL 验证。

## 验证

```powershell
npm run typecheck --prefix apps/web
npm run test --prefix apps/web
npm run test:e2e --prefix apps/web
npm run build --prefix apps/web
```

Playwright 配置优先使用本机已有 Chromium。其他环境可执行 `npx --prefix apps/web playwright install chromium`，或通过 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 指定可执行文件。已有截图保留在 artifacts/；旧 mock 页面截图脚本随旧实现归档，不再驱动产品。

运行 `npm run test:integration --prefix apps/web`，再运行 `npm run test:integration:oracle --prefix apps/web`。独立配置运行真实 Chromium 支付与渠道追问链路，无网络拦截；后者在 Node 中使用后端安装的 pg，仅读本地连接配置并在只读事务执行独立 SQL，和浏览器下载及持久化报告核对。默认后端为相邻的 Commerce Lens-backend，可用 COMMERCE_LENS_BACKEND_DIR 指定。输出在 artifacts/http-only；test:e2e 运行 HTTP响应隔离的生命周期/数据边界故障回归，不运行产品模拟适配器。故障注入结果与真实数据库验收分别记录。

主要代码：src/App.tsx 工作台与状态界面；src/components 包含报告、ECharts、证据栏与SessionTrail会话轮次；src/lib/api.ts 是唯一HTTP adapter；src/lib/types.ts 直接重导出共享DTO；src/styles.css 保留现有视觉与响应式布局。旧 mock 专用源码和回归已从运行/测试发现范围移除，其可恢复原文归档在 tests/archive/20261022，不参与产品构建。

2026-10-23 用户另行授权了单次真实DeepSeek运行：已验证 deepseek-flash 真实模型/SQL/SSE/导出，原始终态为partial。完整录制和根因分析在 artifacts/real-agent-20261023/ANALYSIS.md。普通 test:e2e 不包含真实模型目录；只有明确授权新的真实run后才显式设置 COMMERCE_LENS_REAL_AGENT_ONCE=1 并执行 npm run test:agent-once，禁止把它作为普通质量门禁自动重复。现有记录可直接用 npm run test:agent-records 只读检查数据库，无需再次请求模型。
