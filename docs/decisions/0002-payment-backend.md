# ADR 0002：支付金额的本地后端切片

2026-10-22，已采用。沿用 http.ts v1.0.0，与原 QuerySpec 共同作为唯一契约；本轮只做 paid_amount，不并行扩展退款/销量入口。

本记录保留支付金额初版的历史取舍；后续三指标与生命周期补齐见 ADR 0003，不再以本记录的“尚未实现”清单作为最新进度。

前后端会话最初共享原目录，已建立 backend/payment-api worktree D:/llm/Commerce Lens-backend。后端不修改 apps/web，不在未审查的情况下把根依赖同步回 main。根新增 Fastify 5.12.7 与 API scripts；HTTP 契约不作破坏性变更。

## 执行与权限

Fastify 单本地进程、两个同时运行任务、最多十二个活动/排队任务。所有任务保存在 PostgreSQL；运行队列保留在进程内，重启时将遗留 queued/running 标记 interrupted。此次不引入队列中间件或多进程作业接管，禁止对同一库/身份并行启动第二个 API 实例。

迁移只使用管理员；业务只读角色负责 metrics 和数据覆盖查询；commerce_app 状态写入角色只能访问 app schema。所有业务读取绑定 store/version，所有应用资源查询绑定 owner/store。HTTP 只监听 loopback，Host/Origin 白名单防止网页跨源调用；不提供公网认证或 CORS 通配。

同 owner/幂等键用事务 advisory lock 保证去重，比较规范化 JSON hash；同会话用行锁和唯一部分索引限制活动 run；全局入队计数也串行。取消、报告完成、证据落库均锁定同一 run 行；终态不再改回 running。事件事务保存后再由 SSE 读取，seq 为数据库递增，重放不重新执行工具。

取消和时间预算绑定 AbortSignal，并通过相同只读账号的 pg_cancel_backend 中止当前查询；等待取消确认后才将连接返还池，避免迟到信号中断下一任务。每条查询仍保留 3 秒 statement_timeout。模型请求共享同一 90 秒墙钟预算、8 次模型、12 次工具、30000 tokens 和 0.30 美元运行预算；每次请求按 UTF-8 字节上界加协议余量保守预留 tokens，限制本次输出，价格来自固定 Pi 模型目录。价格为零或未知时 costUsd=null。

Pi/SDK 隐藏自动重试关闭，避免绕过调用数/时间预算。当前切片未实现 PRD 的 429/5xx 一次退避重试，模型错误直接输出失败或已有事实的 partial；后续增加重试时须计入同一预算。此差异如实记录，不宣称全部可靠性要求达成。

## 事实与原因

两种显式模式：deterministic 仅支持有限表达与 confirmedIntent，执行真实 SQL；agent 使用模型解析意图和真正的 Pi Agent 工具选择。两者共用 PaymentTools、证据注册和报告验证，不因供应商失败自动切换。

Agent 只能选择真实 evidence ID；模板、金额、比例、规则阈值和事实文本均由代码渲染。校验同 run/scope/version、整数、差值、贡献守恒、变化率与 hash。JSONB 可能重排键，因此 hash 还原为规范的字段顺序再校验。报告校验只允许一次修订，失败后可用真实比较证据生成 partial。当前没有充分数据建立开放文字假设，hypotheses 始终为空，unknown 明确列出缺失的库存/流量/活动。

六个工具已实现边界：get_metric_definition/check_data_quality/compare_metric/decompose_change/inspect_signals/submit_report。inspect_signals 在当前缺少对应源时注册 missing 证据，不编造库存或流量。工具可选择一个分解维度，不能改写已确认的指标、时间与筛选。报告接受后阻止后续同批工具继续执行。

## 验证与后续边界

真实 PostgreSQL + Fastify inject 验证成功、澄清、缺数据、partial、取消、超时、幂等、越权、重启恢复与导出；真实 socket 验证 HTTP/SSE 重放。Pi Core 测试使用显式 faux transport，工具执行真实 SQL，不将此结果称作 DeepSeek 网络闭环。无模型凭证，不读取其他会话/机器位置的 Key。

开发数据库改用 pg_ctl fast/wait 正常关闭，避免 Windows taskkill 只等待父进程 exit 引起临时文件锁竞态；删除仅针对本次随机测试目录，对暂时文件占用做有界重试。未隐藏 teardown 失败。

尚未实现完整会话删除、反馈、日志清理/保留期、cursor 分页、真实模型冻结集与公网部署。这是可联调支付金额切片，不是完整 M3/M5/P0。
