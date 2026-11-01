# 经营概览阅读顺序改进（2026-10-24）

按前轮对有赞、WooCommerce和Shopify官方资料的调研结论实施。阅读顺序为经营范围/周期 → 指标值与变化 → 趋势和规则提示 → 明细及口径；没有增加业务计算或分析执行入口。

本轮范围：App、DataPages、OverviewPanel、相关CSS；overview-read增加新布局/展开筛选/恢复和详情验证，overview-read与oracle支持可选证据目录（默认兼容）。真实HTTP adapter、schema/DTO/QuerySpec、Chart计算及后端没有改变。现有生命周期回归保留，无新依赖或提交。

- `desktop.png` / `wide.png`：1440×960及1920×1080首屏。三卡约202px高，完整趋势与规则提示同屏。
- `small-mobile.png` / `mobile.png` / `tablet.png` / `laptop.png`：320、390、820、1280宽度效果；窄屏纵向阅读，不宣称所有尺寸都首屏显示完整图表。
- `mobile-filters.png` / `mobile-table.png` / `mobile-details.png` / `missing-coverage.png`：实际HTTP数据下的展开筛选、表格、口径和缺覆盖状态。
- `responsive.json` / `responsive.mjs.txt`：六尺寸实际布局、无页面溢出/pageerror、键盘展开筛选/表格滚动验证及脚本。
- `overview-browser.json` / `overview-sql-oracle.json` / `database-before.json`：23份实际QuerySpec请求响应、独立SQL逐卡/逐日/规则比较及应用表/发布指纹。三指标/周期/筛选/零基期/缺覆盖/无规则/刷新和旧report/run仍通过。
- `verification.json`、最终log、`e2e-final/`、`real-browser-final/`：typecheck、12/12单元、36/36浏览器、1/1真实浏览器、oracle（69卡片/690日比较/30规则比较）、build通过；保留图表562.50kB体积提示。
- `preservation.json`：292文件完整快照SHA256，归档在`.local/frontend-overview-layout-20261024/before.tar`。旧预算截图已逐字节恢复，当前回归截图另存`partial-budget-banner-regression.png`。

真实服务复用前轮由用户要求保持的Vite28252/API30168/PostgreSQL38244，端口5173/3000/55432，未启动或停止其他服务。明确deterministic、不加载模型runtime；数据库业务明细与发布版本未改动。应用表前后sessions13/runs16/reports16/events399/evidences80，外部请求和pageerror均0。

复现（Node24.22.1，项目根目录）：

```powershell
npm run typecheck --prefix apps/web
npm run test --prefix apps/web
npm run test:e2e --prefix apps/web -- --output=artifacts/overview-layout-20261024/e2e-final
$env:COMMERCE_LENS_OVERVIEW_ARTIFACTS='artifacts/overview-layout-20261024'
npm run test:integration:overview:oracle --prefix apps/web -- --before
npm run test:integration --prefix apps/web -- overview-read.spec.ts --output=artifacts/overview-layout-20261024/real-browser-final
npm run test:integration:overview:oracle --prefix apps/web
npm run build --prefix apps/web
```

未执行真实模型、新建业务run、portfolio发布/十万订单、后端全套/冻结评测/规模性能。analysisQuery确认与显式版本新session/run/SSE仍为下一切片；支付成功订单总数字段仍缺。当前服务可直接刷新查看：[经营概览](http://127.0.0.1:5173/?dataset=signals-v1)。
