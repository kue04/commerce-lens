import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, ArrowUpRight, BarChart3, BookOpen, Check, ChevronDown, ChevronRight, CircleAlert, Clock3, Download, Info, LayoutDashboard, LoaderCircle, Menu, Plus, Search, Settings2, Square, WifiOff, X, } from "lucide-react";
import { useWorkspace } from "./lib/use-workspace";
import { phases, regionLabels, shiftDate, clarificationQuery } from "./lib/presentation";
import { phaseIndex, recentSessions } from "./lib/selectors";
import type { QuerySpec } from "./lib/types";
import { Button, Modal } from "./components/ui";
import { ReportView } from "./components/ReportView";
import { EvidencePanel } from "./components/EvidencePanel";
import { SessionTrail } from "./components/SessionTrail";
import { DataPages } from "./components/DataPages";
import { pageFromUrl, type Page } from "./lib/navigation";
import { scopeFromUrl, writeScope, type OverviewScope } from "./lib/overview-scope";
export function App() {
    const w = useWorkspace();
    const [page, setPage] = useState<Page>(() => pageFromUrl(new URL(location.href)));
    const [previewVersion, setPreviewVersion] = useState(() => new URL(location.href).searchParams.get("dataset"));
    const [overviewScope, setOverviewScope] = useState(() => scopeFromUrl(new URL(location.href)));
    const [question, setQuestion] = useState("");
    const [evidenceId, setEvidenceId] = useState<string | null>(null);
    const [settings, setSettings] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [mobileNav, setMobileNav] = useState(false);
    const [online, setOnline] = useState(navigator.onLine);
    const [search, setSearch] = useState("");
    const [clarifyMetric, setClarifyMetric] = useState("paid_amount");
    const [notice, setNotice] = useState("");
    const input = useRef<HTMLTextAreaElement>(null);
    const focusReturn = useRef<HTMLElement | null>(null);
    const composing = useRef(false);
    const submitting = useRef(false);
    const initialEvidence = useRef(false);
    const draftGeneration = useRef(0);
    useEffect(() => {
        const restorePage = () => {
            const url = new URL(location.href);
            setPage(pageFromUrl(url));
            setPreviewVersion(url.searchParams.get("dataset"));
            setOverviewScope(scopeFromUrl(url));
            setEvidenceId(null);
        };
        window.addEventListener("popstate", restorePage);
        return () => window.removeEventListener("popstate", restorePage);
    }, []);
    function navigate(next: Page) {
        if (w.busy || submitting.current) return;
        setPage(next);
        setEvidenceId(null);
        setMobileNav(false);
        const url = new URL(location.href);
        url.searchParams.set("page", next);
        url.searchParams.delete("report");
        url.searchParams.delete("run");
        if (next === "workspace") {
            if (w.report) url.searchParams.set("report", w.report.id);
            else if (w.run) url.searchParams.set("run", w.run.id);
        }
        window.history.replaceState(null, "", url);
    }
    function previewDataset(version: string) {
        setPreviewVersion(version);
        const scope = { ...overviewScope, filters: {} };
        setOverviewScope(scope);
        const url = new URL(location.href);
        url.searchParams.set("dataset", version);
        writeScope(url, scope);
        window.history.replaceState(null, "", url);
    }
    function changeOverviewScope(scope: OverviewScope) {
        setOverviewScope(scope);
        const url = new URL(location.href);
        writeScope(url, scope);
        window.history.replaceState(null, "", url);
    }
    useEffect(() => {
        if (w.report && !initialEvidence.current && window.innerWidth >= 1280) {
            initialEvidence.current = true;
            focusReturn.current = input.current;
            setEvidenceId(w.report.evidences.find((e) => e.kind === "inventory")?.id ?? null);
        }
    }, [w.report]);
    useEffect(() => {
        const update = () => {
            setOnline(navigator.onLine);
            if (navigator.onLine)
                setNotice("浏览器网络已恢复，可重试请求。");
        };
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);
    useEffect(() => {
        if (!notice)
            return;
        const timer = setTimeout(() => setNotice(""), 4500);
        return () => clearTimeout(timer);
    }, [notice]);
    function newAnalysis() {
        if (w.busy || submitting.current)
            return;
        w.fresh();
        ++draftGeneration.current;
        setEvidenceId(null);
        setPage("workspace");
        const url = new URL(location.href);
        url.searchParams.set("page", "workspace");
        window.history.replaceState(null, "", url);
        setQuestion("");
        if (input.current)
            input.current.style.height = "auto";
        setMobileNav(false);
        setTimeout(() => input.current?.focus(), 0);
    }
    function send(text = question, confirmed?: QuerySpec) {
        if (!text.trim() || w.busy || submitting.current)
            return;
        submitting.current = true;
        setEvidenceId(null);
        setPage("workspace");
        setQuestion("");
        if (input.current)
            input.current.style.height = "auto";
        const gen = ++draftGeneration.current;
        void w.submit(text, confirmed)
            .then((accepted) => {
            if (!accepted && gen === draftGeneration.current)
                setQuestion((draft) => draft || text);
        })
            .finally(() => { submitting.current = false; });
    }
    async function selectReport(id: string) {
        if (w.busy || submitting.current)
            return;
        setEvidenceId(null);
        ++draftGeneration.current;
        setPage("workspace");
        setMobileNav(false);
        await w.openReport(id);
    }
    function openEvidence(id: string, element: HTMLElement) {
        focusReturn.current = element;
        setEvidenceId(id);
    }
    const nav = (<>
      <a className="brand" href="#" onClick={(event) => {
            event.preventDefault();
            if (!w.busy) {
                navigate("overview");
            }
        }} aria-label="Commerce Lens 经营概览">
        <span className="brand-mark"/>
        <span>Commerce Lens</span>
      </a>
      <Button className="new-analysis" onClick={newAnalysis} disabled={w.busy}>
        <Plus size={19}/>
        新建分析
      </Button>
      <nav aria-label="主导航">
        <button className={`nav-item ${page === "overview" ? "active" : ""}`} aria-current={page === "overview" ? "page" : undefined} disabled={w.busy} onClick={() => navigate("overview")}>
          <LayoutDashboard size={20}/>经营概览
        </button>
        <button className={`nav-item ${page === "profile" ? "active" : ""}`} aria-current={page === "profile" ? "page" : undefined} disabled={w.busy} onClick={() => navigate("profile")}>
          <Info size={20}/>数据概况
        </button>
        <button className={`nav-item ${page === "workspace" ? "active" : ""}`} aria-current={page === "workspace" ? "page" : undefined} disabled={w.busy} onClick={() => navigate("workspace")}>
          <LayoutDashboard size={20}/>
          分析工作台
        </button>
        <button className={`nav-item ${page === "history" ? "active" : ""}`} disabled={w.busy} onClick={() => {
            navigate("history");
        }}>
          <Clock3 size={20}/>
          历史报告
        </button>
        <button className={`nav-item ${page === "metrics" ? "active" : ""}`} disabled={w.busy} onClick={() => {
            navigate("metrics");
        }}>
          <BookOpen size={19}/>
          指标口径
        </button>
      </nav>
      <div className="recent">
        <p>最近分析</p>
        {recentSessions(w.history)
            .slice(0, 4)
            .map((item) => (<button disabled={w.busy} key={item.reportId} className={item.sessionId === w.report?.sessionId ? "recent-current" : ""} onClick={() => void selectReport(item.reportId)}>
              <span>
                {item.title === "华东销售，哪里变了？"
                ? "华东销售下降"
                : item.title}
              </span>
              {item.reportCount > 1 && (<small className="recent-turn-count">
                  {item.reportCount} 轮
                </small>)}
              <ArrowUpRight size={13}/>
            </button>))}
        {!w.history.length && (<span className="recent-empty">尚无已保存的报告</span>)}
      </div>
      <div className="sidebar-bottom">
        <div className="workspace-avatar">禾</div>
        <div>
          <span>运营工作区</span>
          <small>经营分析工作区</small>
        </div>
        <button aria-label="工作区与设置" className="settings-button" onClick={() => {
            setSettings(true);
            setMobileNav(false);
        }}>
          <Settings2 size={19}/>
        </button>
      </div>
    </>);
    const currentPhase = w.run ? phaseIndex(w.run.phaseName) : 0;
    const activeRun = w.run && ["queued", "running"].includes(w.run.status);
    const showReport = w.report && page === "workspace" && !w.loading;
    const excludedSku = w.report?.query.groupBy === 'sku' ? w.report.contributors.find((c) => !c.isOther)?.key : undefined;
    const clock = w.catalog?.businessClock;
    const yesterday = clock ? shiftDate(clock, -1) : '';
    const baselineDate = clock ? shiftDate(clock, -8) : '';
    const clarificationRegion = w.run?.clarification?.region ?? '';
    const readingData = page === "overview" || page === "profile";
    const visibleDataset = readingData ? w.catalog?.datasets.find((dataset) => dataset.version === (previewVersion ?? w.catalog?.version)) : w.catalog;
    const title = page === "overview" ? "经营概览" : page === "profile" ? "数据概况" : page === "history"
        ? "历史报告"
        : page === "metrics"
            ? "指标口径"
            : "经营分析";
    return (<div className={`app-shell ${evidenceId ? "has-evidence" : ""} ${page === "overview" ? "overview-shell" : ""}`}>
      <a href="#main-content" className="skip-link">
        跳至主要内容
      </a>
      <aside className="sidebar">{nav}</aside>
      <header className="topbar">
        <div className="breadcrumbs">
          <Button variant="ghost" className="mobile-menu icon-button" aria-label="打开导航" onClick={() => setMobileNav(true)}>
            <Menu size={19}/>
          </Button>
          <span>工作台</span>
          <span className="breadcrumb-slash">/</span>
          <strong>{title}</strong>
        </div>
        <div className="toolbar-actions">
          <button className="store-select" onClick={() => setSettings(true)} aria-label="查看当前店铺与工作区">
            <span>{w.catalog?.storeName ?? "店铺待连接"}</span>
            <ChevronDown size={15}/>
          </button>
          <span className={`data-freshness ${!visibleDataset ? "warning-text" : ""}`} title={visibleDataset
            ? `固定业务时钟 ${visibleDataset.businessClock} · ${visibleDataset.timezone}；版本发布时间不代表数据完整性`
            : "尚未读取服务端数据目录"}>
            <span className="status-dot"/>
            {visibleDataset ? "固定演示版本" : "数据未连接"}
            <small>
              {visibleDataset
            ? visibleDataset.businessClock
            : "—"}
            </small>
          </span>
          <button className="mode-badge" onClick={() => setSettings(true)}>
            {w.catalog
            ? page === "overview" ? "合成数据演示" : readingData || w.catalog.executionMode === "deterministic"
                ? "确定性计算 · 未执行 Agent"
                : "真实 Agent · 合成数据"
            : "后端未连接"}
          </button>
        </div>
      </header>
      <main id="main-content" className="main-area" tabIndex={-1}>
        <div className="report-scroll">
          <div className="mode-notice">
            <span className="tiny-square"/>
            {w.catalog && (readingData || w.catalog.executionMode === "deterministic")
            ? "合成数据 · 真实 PostgreSQL · 确定性计算 · 未执行 Agent"
            : "HTTP 接入模式 · 仅展示服务端返回"}
            <span className="notice-separator">/</span>
            <span>
              {visibleDataset
            ? `业务时钟 ${visibleDataset.businessClock}`
            : "等待本地 API"}
            </span>
            
          </div>
          {(!online || !w.connection.connected || w.connection.message) && (<div className="inline-alert connection" role="status">
              <WifiOff size={17}/>
              <span>
                {!online
                ? "浏览器网络已断开。订阅中断不代表任务取消。"
                : w.connection.message}
              </span>
              {!w.connection.connected && (<Button onClick={() => void w.reconnect()}>恢复连接</Button>)}
            </div>)}
          {w.error && (<div className="inline-alert error" role="alert">
              <CircleAlert size={18}/>
              <div>
                <strong>请求未完成</strong>
                <p>{w.error}</p>{!w.catalog && <Button onClick={w.reload} disabled={w.busy}>重新连接</Button>}
              </div>
              <button aria-label="关闭错误提示" onClick={() => w.setError(null)}>
                <X size={16}/>
              </button>
            </div>)}
          
          
          {(page === "overview" || page === "profile") && <DataPages api={w.api} catalog={w.catalog} loading={w.loading} version={previewVersion} onVersion={previewDataset} scope={overviewScope} onScope={changeOverviewScope} profile={page === "profile"} onProfile={() => navigate("profile")} onMetrics={() => navigate("metrics")}/>}
          {page === "workspace" && (<>
              {showReport && (<SessionTrail history={w.history} reportId={w.report!.id} sessionId={w.report!.sessionId} busy={w.busy} onSelect={(id) => void selectReport(id)}/>)}
              {showReport && (<ReportView report={w.report!} openEvidence={openEvidence} onExport={() => setExportOpen(true)} exporting={w.exporting}/>)}
              {w.loading && (<div className="loading-state" role="status">
                  <LoaderCircle className="spin" size={26}/>
                  <h2>{w.run ? "正在读取报告" : "正在连接分析工作区"}</h2>
                  <p>等待数据层响应，尚未生成结论。</p>
                </div>)}
              {!w.loading && activeRun && (<div className="running-state" role="status" aria-live="polite">
                  <span className="eyebrow">ANALYSIS IN PROGRESS</span>
                  <h1>让变化，有据可循。</h1>
                  <p className="running-question">{w.run?.question}</p>
                  <div className="run-status">
                    <LoaderCircle size={22} className="spin"/>
                    <div>
                      <strong>
                        {w.run?.status === "queued"
                    ? "等待执行"
                    : currentPhase === 2 && w.query?.groupBy === "channel"
                        ? "渠道拆解"
                        : phases[currentPhase]}
                      </strong>
                      <p>
                        {"正在等待服务端事件，报告通过验证后统一展示。"}
                      </p>
                    </div>
                  </div>
                  <ol className="running-phases">
                    {phases.map((p, i) => (<li key={p} className={i < currentPhase
                        ? "done"
                        : i === currentPhase
                            ? "current"
                            : ""}>
                        <span>
                          {i < currentPhase ? <Check size={14}/> : i + 1}
                        </span>
                        <div>
                          <strong>
                            {i === 2 && w.query?.groupBy === "channel"
                        ? "渠道拆解"
                        : p}
                          </strong>
                          <small>
                            {[
                        "确认指标、日期与范围",
                        "核对数据覆盖与水位",
                        "按同一口径分解贡献",
                        "检查库存与相关信号",
                    ][i]}
                          </small>
                        </div>
                      </li>))}
                  </ol>
                  <Button onClick={() => void w.cancel()}>
                    <Square size={13}/>
                    取消本次分析
                  </Button>
                </div>)}
              {!w.loading && w.run?.status === "needs_clarification" && (<section className="clarification-state">
                  <span className="eyebrow">ONE MORE THING</span>
                  <h1>先确认，我们在看什么。</h1>
                  <p>{w.run.clarification?.question}</p>
                  <div className="clarification-form">
                    <label>
                      分析指标
                      <select value={clarifyMetric} onChange={(e) => setClarifyMetric(e.target.value)}>
                        <option value="paid_amount">支付金额</option>
                        <option value="refund_amount" disabled={!w.catalog?.supportedMetrics.includes("refund_amount")}>
                          退款金额
                        </option>
                        <option value="sold_units" disabled={!w.catalog?.supportedMetrics.includes("sold_units")}>
                          支付件数
                        </option>
                      </select>
                    </label>
                    <label>
                      分析日期
                      <select value={yesterday} aria-label="分析日期" disabled>
                        <option value={yesterday}>{yesterday} · 完整自然日</option>
                      </select>
                    </label>
                    <label>
                      地区范围
                      <select value={clarificationRegion} aria-label="地区范围" disabled>
                        <option value={clarificationRegion}>{regionLabels[clarificationRegion] ?? (clarificationRegion || '全部地区')} · 全渠道</option>
                      </select>
                    </label>
                    <p className="small muted">
                      比较周期为上周同日（{baselineDate}）。确认后会建立新任务，关联本次澄清记录。
                    </p>
                    <Button variant="primary" onClick={() => clock && send(w.run!.question, clarificationQuery(clock, clarifyMetric as QuerySpec["metricId"], clarificationRegion))}>
                      确认并开始分析
                      <ArrowRight size={16}/>
                    </Button>
                  </div>
                </section>)}
              {!w.loading &&
                w.run &&
                [
                    "failed",
                    "insufficient_data",
                    "cancelled",
                    "timed_out",
                    "interrupted",
                ].includes(w.run.status) && (<section className="terminal-state">
                    <div className="state-symbol">
                      {w.run.status === "cancelled" ? (<Square size={24}/>) : (<CircleAlert size={29}/>)}
                    </div>
                    <span className="eyebrow">
                      {w.run.status === "cancelled"
                    ? "ANALYSIS CANCELLED"
                    : "ANALYSIS PAUSED"}
                    </span>
                    <h1>
                      {w.run.status === "cancelled"
                    ? "分析已取消"
                    : w.run.status === "insufficient_data"
                        ? "数据还不足以回答"
                        :
                            "这次分析未完成"}
                    </h1>
                    <p>
                      {w.run.status === "cancelled"
                    ? "本次任务已停止，没有生成新的成功报告。可以调整问题后重新开始。"
                    : (w.run.message ??
                        "任务异常中止，请检查服务端状态后重试。")}
                    </p>
                    <div className="state-actions">
                      {true && (<Button variant="primary" onClick={() => send(w.run!.question)}>
                          重新分析
                          <ArrowRight size={16}/>
                        </Button>)}
                      <Button onClick={newAnalysis}>新建分析</Button>
                    </div>
                  </section>)}
              {!w.loading && !w.run && !w.report && (<section className="welcome-state">
                  <span className="welcome-mark">
                    <BarChart3 size={30} strokeWidth={1.4}/>
                  </span>
                  <span className="eyebrow">
                    A CLEARER VIEW OF YOUR BUSINESS
                  </span>
                  <h1>
                    从一个问题，
                    <br />
                    看清生意的变化。
                  </h1>
                  <p>
                    把经营疑问交给 Commerce Lens。
                    <br />
                    沿着指标、贡献与证据，找到值得核实的线索。
                  </p>
                  <div className="suggestions">
                    <button disabled={w.busy || (!w.catalog)} onClick={() => send("昨天华东支付金额为什么下降？")}>
                      <span>01</span>
                      <div>
                        <strong>支付金额为什么下降？</strong>
                        <small>华东 · 昨天 · 对比上周同日</small>
                      </div>
                      <ArrowUpRight size={18}/>
                    </button>
                    <button disabled={w.busy || (!w.catalog)} onClick={() => send("昨天华东支付金额按渠道拆解")}>
                      <span>02</span>
                      <div>
                        <strong>哪些渠道贡献了变化？</strong>
                        <small>按同一口径查看渠道贡献</small>
                      </div>
                      <ArrowUpRight size={18}/>
                    </button>
                  </div>
                  
                </section>)}
            </>)}
          {page === "history" && (<section className="history-page">
              <span className="eyebrow">YOUR ANALYSIS LIBRARY</span>
              <h1>每一次追问，都有迹可循。</h1>
              <p className="muted">
                {"当前身份可访问的历史报告。"}
              </p>
              <label className="history-search">
                <Search size={17}/>
                <input aria-label="搜索历史报告" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索问题或报告标题…"/>
              </label>
              <div className="history-list">
                {w.history
                .filter((h) => `${h.title}${h.question}`.includes(search))
                .map((h) => (<button key={h.reportId} onClick={() => void selectReport(h.reportId)}>
                      <span className="history-icon">
                        <Clock3 size={20}/>
                      </span>
                      <div>
                        <h2>{h.title}</h2>
                        <p>{h.question}</p>
                        <small>
                          {h.createdAt.slice(0, 10)} ·{" "}
                          {"服务端报告"}
                        </small>
                      </div>
                      <ChevronRight size={18}/>
                    </button>))}
                {!w.history.filter((h) => `${h.title}${h.question}`.includes(search)).length && (<div className="empty-chart">
                    <Search size={24}/>
                    <p>没有找到匹配的报告</p>
                  </div>)}
              </div>
            </section>)}
          {page === "metrics" && (<section className="metrics-page">
              <span className="eyebrow">A SHARED DEFINITION</span>
              <h1>先对齐口径，再讨论变化。</h1>
              <p className="muted">
                所有金额以人民币分安全整数计算；浏览器仅负责展示。
              </p>
              <div className="metric-definitions">
                {[
                [
                    "01",
                    "支付金额",
                    "paid_amount",
                    "按支付成功时间归属，累计订单行支付金额。退款单独聚合，不直接回写支付金额。",
                ],
                [
                    "02",
                    "退款金额",
                    "refund_amount",
                    "按退款成功时间归属。历史订单在本期发生的成功退款计入本期，多次部分退款不重复统计支付。",
                ],
                [
                    "03",
                    "销售件数",
                    "sold_units",
                    "支付成功订单行的购买件数之和。件数不等同于订单数，也不等同于销售金额。",
                ],
                [
                    "04",
                    "变化与贡献",
                    "delta / share",
                    "变化额为本期减基期；变化率为变化额除以基期。基期为零时变化率不可计算。增长项可抵消下降，贡献份额可超过 100%。",
                ],
            ].map(([n, title, code, text]) => (<article key={n}>
                    <span>{n}</span>
                    <div>
                      <h2>
                        {title}
                        <code>{code}</code>
                      </h2>
                      <p>{text}</p>
                    </div>
                  </article>))}
              </div>
              <div className="evidence-note">
                <Info size={19}/>
                <span>
                  业务时钟：{clock ?? "尚未取得"}；“昨天”为 {yesterday || "尚未取得"}。完整自然日采用
                  Asia/Shanghai，日期窗口左闭右开。
                </span>
              </div>
            </section>)}
        </div>
        {page === "workspace" && (<div className="composer-area">
            
            {showReport && (<div className="followup-chips">
                <button onClick={() => excludedSku && send(`排除 ${excludedSku} 呢？`)} disabled={w.busy || !excludedSku}>
                  {excludedSku ? `排除 ${excludedSku} 后分析` : "暂无可排除商品"}
                  <ArrowUpRight size={12}/>
                </button>
                <button onClick={() => send("按渠道进一步拆解")} disabled={w.busy}>
                  按渠道进一步拆解
                  <ArrowUpRight size={12}/>
                </button>
              </div>)}
            <form className={`composer ${activeRun ? "is-running" : ""}`} onSubmit={(e) => {
                e.preventDefault();
                send();
            }}>
              <Button variant="ghost" type="button" className="icon-button composer-plus" aria-label="清空并新建分析" disabled={w.busy} onClick={newAnalysis}>
                <Plus size={20}/>
              </Button>
              <label htmlFor="analysis-question" className="sr-only">
                输入分析问题
              </label>
              <textarea ref={input} id="analysis-question" rows={1} value={question} maxLength={2000} disabled={w.busy} onChange={(e) => {
                setQuestion(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 124)}px`;
            }} placeholder={activeRun
                ? "分析进行中，可以取消本次任务…"
                : showReport
                    ? "继续追问：只看华东，再按渠道拆解"
                    : "想了解什么经营变化？试着问问…"} onCompositionStart={() => {
                composing.current = true;
            }} onCompositionEnd={() => {
                composing.current = false;
            }} onKeyDown={(e) => {
                if (e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    !composing.current &&
                    e.keyCode !== 229) {
                    e.preventDefault();
                    send();
                }
            }}/>
              {activeRun ? (<Button type="button" variant="primary" className="send-button" aria-label="取消分析" onClick={() => void w.cancel()}>
                  <Square size={15} fill="currentColor"/>
                </Button>) : (<Button variant="primary" type="submit" className="send-button" aria-label="发送问题" disabled={!question.trim() ||
                    w.busy
                    ||
                        !w.catalog}>
                  <ArrowUp size={22}/>
                </Button>)}
            </form>
            <div className="composer-caption">
              <span>
                {"分析结论以服务端验证报告为准"}
              </span>
              <span>
                Enter 发送<span className="caption-dot">·</span>Shift + Enter
                换行
              </span>
            </div>
          </div>)}
      </main>
      <EvidencePanel id={evidenceId} report={w.report} api={w.api} onClose={() => setEvidenceId(null)} returnFocus={focusReturn} onSelect={setEvidenceId}/>
      <Modal open={settings} onOpenChange={setSettings} title="工作区设置" description="查看后端数据版本、业务时钟与计算模式。">
        <div className="settings-store">
          <span className="workspace-avatar">禾</span>
          <div>
            <strong>{w.catalog?.storeName ?? "店铺待连接"}</strong>
            <p>单店铺 · 只读经营分析</p>
          </div>
        </div>
        <div className="settings-field">
          <strong>后端数据库</strong>
          <p>报告、证据与历史直接来自本地服务，连接失败时显示错误。</p>
          <p>{w.catalog?.executionMode === 'deterministic' ? '合成数据 · 确定性计算 · 未执行 Agent' : '正在核对服务端模式'}</p>
        </div>
        <div className="workspace-details">
          <p>
            <span>版本发布时间（非完整截至日期）</span>
            <strong>{w.catalog?.updatedAt ?? "尚未取得"}</strong>
          </p>
          <p>
            <span>数据版本</span>
            <strong>{w.catalog?.version ?? "尚未取得"}</strong>
          </p>
          <p>
            <span>时区</span>
            <strong>{w.catalog?.timezone ?? "Asia/Shanghai"}</strong>
          </p>
          <p>
            <span>多店铺切换</span>
            <strong className="muted">未开放 · 当前为单店铺</strong>
          </p>
        </div>
        <Button variant="primary" className="modal-done" onClick={() => setSettings(false)}>
          完成
          <Check size={16}/>
        </Button>
      </Modal>
      <Modal open={exportOpen} onOpenChange={setExportOpen} title="导出这次分析" description="包含报告、证据、数据版本与执行来源。">
        <div className="export-options">
          <Button onClick={() => {
            void w.download("md");
            setExportOpen(false);
        }} disabled={w.exporting}>
            <Download size={20}/>
            <span>
              <strong>Markdown 报告</strong>
              <small>便于阅读、归档与作品集展示</small>
            </span>
            <ArrowUpRight size={17}/>
          </Button>
          <Button onClick={() => {
            void w.download("json");
            setExportOpen(false);
        }} disabled={w.exporting}>
            <Download size={20}/>
            <span>
              <strong>JSON 数据</strong>
              <small>完整结构、查询条件与证据结果</small>
            </span>
            <ArrowUpRight size={17}/>
          </Button>
        </div>
      </Modal>
      <Modal open={mobileNav} onOpenChange={setMobileNav} title="导航">
        <div className="mobile-sidebar">{nav}</div>
      </Modal>
      {notice && (<div className="toast" role="status">
          <Check size={16}/>
          {notice}
        </div>)}
    </div>);
}
