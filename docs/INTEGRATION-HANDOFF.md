# 前后端联调交接

2026-10-22，Asia/Shanghai。用户决定下一步连接前后端，继续跳过真实模型；前端旧进度“暂缓联调”不再代表最新用户意图。本次只做文档与只读差异核对，没有修改前端、合并分支或执行联调。

## 目录与版本

- 后端 D:/llm/Commerce Lens-backend，backend/payment-api，最近业务提交 6411a0b；此前 dbffd01 子范围解释匹配、f5cb3d5 库存引用/合池、c4885cf 三指标/生命周期/恢复。最新交接提交用 git log -1 查询。本次开始工作区干净。
- 前端 D:/llm/Commerce Lens/apps/web，main，HEAD 25a18ec。git status 为 `?? apps/`、`?? docs/progress-frontend.md`；源码、独立 package/lock、测试、字体/许可证和验证截图尚未入 Git。不能通过新 checkout 恢复，必须保护原目录，禁止 reset/clean、覆盖或盲目合并。
- 本次检查 127.0.0.1:5173 已监听（PID 24748）；3000/55432 未监听。新窗口重新核实归属，不停未知进程。
- 先读两边适用 AGENTS.md、职责进度，再读后端本文、API-CONTRACT、PRD 相关验收及 ADR 0001/0004；前端目录中的旧后端文档不能代替最新版本。

## 已有证据和验收边界

后端有三指标、数据门禁、权限隔离、Pi 工具、报告/证据校验、真实 HTTP/SSE、持久化、取消/恢复、导出及空库恢复。6411a0b 对应 typecheck、完整测试 75/75（0 跳过，49.08 秒）、build，之后新增旧版/转义单元单独 1/1，最终 typecheck；不要写成完整 76/76。历史 240 次离线评测和 socket smoke 未在该版本重跑。真实模型/B/C、人工复核、浏览器前后端验收仍未完成。

前端进度记录历史 typecheck、11 单元、47 浏览器、build；本次仅读取，没有重新验证。已有 HttpApi、MockApi、DTO 复用、SSE 生命周期逻辑；Vite 已代理 /api 到 127.0.0.1:3000。连接具备基础，不能宣称已经联调成功。

## 最小同步方式与差异清单

建议先保持双目录运行：新窗口在原前端目录改 adapter 和必要兼容逻辑，后端独立启动。先核对目标文件归属/差异并保留可恢复快照，再按文件同步共享契约；不要先合并整条后端分支或复制整个 apps。

已核实 main 与 6411a0b 的共享同步清单：packages/contracts/src/http.ts、packages/contracts/examples/payment-flow.json、schemas.json、docs/API-CONTRACT.md。index.ts（QuerySpec）无差异，不另造 DTO。共享 schema 保持后端版本为权威源，mock catalog.contractVersion 需兼容新 schema，旧 report.provenance 1.0.0 仍可读；不删测试或放宽 schema 掩盖失败。

| 已核实前端位置 | 必须处理或核实 |
|---|---|
| src/lib/api.ts | 旧 v1.0.0 schema 拒绝新 catalog/信号事实；validateReport 写死 r.unit!==fen，拒绝 units；文案版本更新 |
| HttpApi | 已去掉 scenario、有幂等键和 SSE，不重搭；410 REPLAY_EXPIRED 目前作为普通重连失败，应按 details.reportUrl/run.reportId 取最终报告 |
| use-workspace.ts | 普通 HTTP 输入不注入 mock query，保持；澄清/重试/刷新需核实不会带 fixture baseQuery 的 mock ID |
| EvidencePanel.tsx、selectors.ts | 库存仍解读 fixture 逐小时 rows/coverage×24；后端 signal.inventory 是 SKU×大区池小时，按 expectedHours/observedHours/zeroHours 展示，不从聚合值反推缺货时段；missing 不补零 |
| ReportView.tsx | 存在固定 reference(E03)，改用实际 hypothesis.evidenceIds；引用数量可变 |
| format.ts、ReportView.tsx | 已有 metricValue 的 units 支持可复用；分整数/null/负贡献/超过100% 保持原语义 |
| ScopeDialog/fixtures | nuts/oats、mall/live、web-demo-v1 不能发给后端。第一条链路用纯问题和真实报告 QuerySpec |

Catalog 仅有默认数据集、datasets、supportedMetrics、executionMode 等，**没有公开完整 SKU/渠道/大区字典接口**，不要假设已经存在。标准演示集可核对 A/B/C、douyin/tmall/jd、east/south/north/west；不要把 Top-N 当完整目录。首条链路不需要新增字典 API。

根配置以后合并时再审查 package.json/lock（Fastify 5.12.7、API scripts）、tsconfig.json（apps/api include）、.env.example（APP_DATABASE_URL/ANALYSIS_MODE）。双目录联调无须把后端依赖安装进前端目录，保留 apps/web 独立 package/lock，不重组 workspace。密钥/数据库 URL 不进浏览器。

## 启动

后端 PowerShell 7：

```powershell
cd 'D:\llm\Commerce Lens-backend'
. ./scripts/bootstrap-node.ps1
$env:ANALYSIS_MODE='deterministic'
# 已有依赖无需重复 npm ci；显式环境变量优先于 .env。
npm run api:dev
```

管理 PostgreSQL 18、迁移、acceptance-v1/signals-v1；默认 signals-v1；API 127.0.0.1:3000、DB 55432。同身份只启动一个 API。不要运行 verify:pi，不打印 .env/connection.env。Ctrl+C 正常关闭本次 API/DB，不动其他服务。

前端在原目录另一终端：

```powershell
cd 'D:\llm\Commerce Lens'
. ./scripts/bootstrap-node.ps1
# 先核查已有 5173 服务，避免重复启动。
npm run dev --prefix apps/web
```

访问 http://127.0.0.1:5173，设置选择 HTTP，经同源 /api 代理。保持 Host/Origin 限制，不添加 CORS 通配；保留 mock 和本地历史，真实服务失败不能静默回 mock。显著标识合成数据、真实 PostgreSQL、确定性计算、未执行 Agent。

## 分片验收

1. 先 GET /api/health/ready、catalog 确认 ready/deterministic。浏览器输入“昨天华东支付金额为什么下降？”→session/run/SSE→report/evidence。signals-v1 的本期/基期为 7000000/10000000 分、delta=-3000000、rate=-0.3，A -4000000、B +1000000；agentExecuted=false、模型调用0。不能用网络拦截样例代替。
2. 同一首片验证证据抽屉、真实引用、库存池 24/24/零库存10小时（不虚构时段）、报告刷新恢复、后端历史、JSON/Markdown 下载与报告一致；每条证据自身 QuerySpec 独立展示。
3. 再验“数据异常”澄清与 parentRunId 新 run，以及“只看华东，再按渠道拆解”“排除 A 呢？”追问。SessionResponse 只有 sessionId/datasetVersion，无 state；澄清 date 是业务时钟提示，不能把今天当完整日窗口。
4. 接退款/件数：默认信号集退款 300000/0 分，件数70/100；零基期rate=null，退款按成功时间、件数不扣退款。先支付首片，不重做页面。
5. 逐片验 API 离线、缺核心数据、partial、取消、SSE重连/410和刷新终态。短任务取消可能已完成，不能强制伪造cancelled。runId响应前关页的活动任务定位仍有契约缺口，先记录，不称已解决；不为此先扩接口。

缺数据可用已有 db:scenarios 发布 scenario-S08-v1，在真实数据集选择/API测试中验证。partial/慢任务用明确测试故障注入，不在产品增加无用开关。

按改动运行前端 typecheck/test/test:e2e/build，保留既有生命周期回归；后端若只启动未改源码做相关HTTP smoke，若修改则做其相关门禁。每片更新职责进度与联调记录，包含版本、命令、模式、通过/失败/未运行。真实模型/人工复核/视频未完成不阻塞联调，也不能被联调替代。
