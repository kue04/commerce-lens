# 真实数据概况读取证据（2026-10-23）

已通过真实浏览器→Vite→Fastify→PostgreSQL18.4，只读验证，无外部模型调用。

- profiles-real.json：signals-v1与acceptance-v1的真实HTTP响应，非测试样例。
- profile-browser.json：真实浏览器GET/状态、无外部请求/页面错误、既有报告恢复。
- profile-sql-oracle.json、database-before.json：逐源独立SQL/实际日期/水位检查和应用表前后数量不变；手工总订单4、支付成功3、订单行6、退款3。
- profile-real-*.png、real-browser/：真实桌面/手机分段截图和Playwright trace。
- e2e/：测试transport的故障/竞态/生命周期回归，31/31，不作为真实PostgreSQL读数。源码样例不进入生产路径。
- verification.json、contract-sync-final.json：验证结果与精确同步共享HTTP1.2.0六文件的SHA256。
- preservation.json：修改前203文件归档SHA256；原tar在根.local/frontend-profile-20261023/before.tar。
- backend-source-sha256.json、serve-readonly.ts.txt：本轮固定后端源码指纹与只读启动配置（无凭证）。实际运行目录为根.local/frontend-profile-20261023/backend-source，node_modules仅指向现有后端依赖。启动器只读，不能用于新分析。

本轮没有发布portfolio-90d-v1，未验收十万订单数据。支付成功订单字段未在契约提供，前端单独显示“后端尚未提供”；概览及概览→分析仍未验收。后端最终overview契约已同步但没有前端请求。

复验使用项目Node24：npm run typecheck --prefix apps/web；npm run test --prefix apps/web；npm run test:e2e --prefix apps/web -- --output=artifacts/frontend-profile-20261023/e2e；npm run test:integration --prefix apps/web -- profile-read.spec.ts --output=artifacts/frontend-profile-20261023/real-browser；npm run test:integration:profile:oracle --prefix apps/web（首次浏览器前加 -- --before）；npm run build --prefix apps/web。真实读取需要先显式启动deterministic API和原有数据库，不能使用未知Agent启动配置。
