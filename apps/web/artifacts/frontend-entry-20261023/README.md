# 前端数据入口切片证据（2026-10-23）

本目录证明页面结构和HTTP adapter回归，不证明profile/overview真实PostgreSQL接入。

- `verification.json`：源码SHA256、前后端版本、快照、通过/失败/未运行、收尾端口状态。
- `overview-desktop.png`、`profile-desktop.png`、`overview-mobile.png`、`profile-mobile.png`：均为测试transport截图，样例不进入生产src。已查看桌面概览/手机概况。
- `e2e/`：独立输出目录完整28/28通过。原生命周期测试全部保留；没有真实外部模型调用。
- 首次默认输出目录执行26通过/2失败：均为browserContext.close期间Playwright trace文件ENOENT；这次失败不算通过。独立目录重跑完整套件28/28通过，未修改相关业务断言。不能据此确定是哪一个并发进程移动/清理了trace。
- 本轮前端共享契约仍1.1.0；后端1.2.0/profile在并行变化，overview未实现。3000不可达；真实HTTP/SQL oracle和概览/报告/导出数值一致性未运行。
- 快照清单在根目录`.local/frontend-overview-20261023/preservation.json`；原始未跟踪成果及旧真实联调证据保留。

复验命令：`npm run typecheck --prefix apps/web`、`npm run test --prefix apps/web`、`npm run test:e2e --prefix apps/web -- --output=artifacts/frontend-entry-20261023/e2e`、`npm run build --prefix apps/web`。使用项目`.tools/node-v24.22.1-win-x64`加入当前进程PATH，不改变系统配置。
