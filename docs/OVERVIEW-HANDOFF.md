# 经营概览前端接入交接

日期2026-10-23，后端D:/llm/Commerce Lens-backend，backend/payment-api，开始HEAD=a250286。后端共享工作树包含第一切片和其他会话未提交成果，本轮不自动合并或提交。最终验证见progress-backend.md顶部；本文件定义前端下一切片的接入工作。

## 接入时点

经营概览与数据概况的当前后端门禁通过后即可开始，不需要等待真实模型或后端新功能。前端结合的完成条件仍是实际浏览器访问最新API/真实PostgreSQL，概览到工作台使用同一版本与QuerySpec。后端专项/完整测试不是浏览器验收。

## 共享文件同步

从本后端目录核对并同步以下文件，先保护原目录已有修改：

| 文件 | 用途 |
|---|---|
| packages/contracts/src/http.ts | HTTP1.2.0，DatasetProfileDTO、OverviewDTO与严格schemas |
| packages/contracts/examples/schemas.json | 无TypeBox使用方的完整JSON schemas |
| packages/contracts/examples/overview.json | 真实PostgreSQL/HTTP生成的原QuerySpec请求与响应 |
| packages/contracts/examples/dataset-profile.json | 真实数据概况样例 |
| packages/contracts/examples/payment-flow.json | 现有run/report/evidence兼容样例 |
| docs/API-CONTRACT.md | 全部字段、窗口、null/0和交互语义 |

QuerySpec的index.ts没有变，不覆盖前端页面、package/lock或其他会话源码。当前无新提交ID，不能以整分支cherry-pick替代文件归属核对。真实样例仅用于契约理解/校验，生产页面数据必须经API读取。前端本地可能已经同步profile版HTTP1.2.0，仍须核对是否有OverviewSchema；只比较1.2.0字符串不足以判断同步完成。

## 前端最小切片

1. 新增HTTP adapter：GET /api/datasets/:version/profile、POST /api/datasets/:version/overview，分别以DatasetProfileSchema、OverviewSchema校验。overview body就是原QuerySpec，不再包一层query，不传storeId/ownerId/version/SQL。版本只在路由。
2. 当前选中datasetVersion贯穿目录、概况、概览和新建session。2026-10-23只读核对时use-workspace.ts仍用catalog.version新建session，DataPages选择预览版本未传递到submit；须由前端修改。已有报告及追问保留原session/version，切版本后的独立分析新建session。
3. 昨天：2026-10-21→2026-10-22，对2026-10-14→2026-10-15；7天：2026-10-15→2026-10-22，对2026-10-08→2026-10-15；30天：2026-09-22→2026-10-22，对2026-08-23→2026-09-22。全部右端不含。初始groupBy=sku、topN=10，三个metricId从主指标选择；筛选字典来自profile。
4. 卡片读取metrics.comparison，趋势读取trend.points，变化项读取changes；不自行计算替代口径。缺失为null+reason，真实零为0；基期零变化率为null。展示query实际窗口、trend实际日期及businessClock；publishedAt不叫同步时间。profile.counts.orders包含失败订单，标签用“订单记录数”，不能称支付成功订单数。
5. 变化项或可用趋势点的analysisQuery作为confirmedIntent发给现有run接口，session指定相同datasetVersion。缺失日期禁用分析并显示原因；API保证正常点可直接分析。30天趋势的日点基期有7/30天偏移，不把整条趋势两窗口当作报告查询。
6. 筛选/周期/指标/版本改变时取消或隔离旧请求；保留现有SSE、取消、错误恢复、报告重载与导出交互。完成单元与浏览器测试后再记录前端验收结果。

## 本地运行

在后端目录用Node24.22.1。新建/停止后的本地开发库可用：

```powershell
$env:PATH = (Join-Path (Get-Location) '.tools/node-v24.22.1-win-x64') + ';' + $env:PATH
$env:ANALYSIS_MODE='deterministic'
npm run api:dev
```

api:dev会在缺版本时发布portfolio-90d-v1并默认选择它，保留旧版本。若已有会话正在运行API/数据库，先协调其正常停止；不要taskkill/reset/删除库或重复启动。连接既有已迁移库则先按原连接配置显式运行 `npm run db:seed -- portfolio-90d-v1`（仅当该版本不存在），再用deterministic模式 `npm run api:start`；默认版本以返回catalog为准。后端本轮没有重启长期开启的3000/55432服务，磁盘新代码不等于已运行实例更新。

## 浏览器验收

使用portfolio-90d-v1完成三指标、三个周期、SKU/渠道/大区筛选、版本切换/刷新、请求竞态、缺源/零基期、变化项与趋势点跳分析；实际报告的comparison与对应概览值一致，且查看/筛选概览不会创建run或发送模型请求。工作台显式deterministic，真实外部模型禁止自动调用。旧报告与追问仍可读取，且不自动换成当前预览数据集。验收记录以新浏览器/API/SQL证据为准，不能沿用历史截图与测试成绩。
