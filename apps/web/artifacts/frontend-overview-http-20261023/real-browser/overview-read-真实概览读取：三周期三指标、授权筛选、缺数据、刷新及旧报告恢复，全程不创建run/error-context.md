# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: overview-read.spec.ts >> 真实概览读取：三周期三指标、授权筛选、缺数据、刷新及旧报告恢复，全程不创建run
- Location: tests\real-integration\overview-read.spec.ts:5:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: page.waitForResponse: Test timeout of 90000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "跳至主要内容" [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - complementary [ref=e5]:
    - link "Commerce Lens 经营概览" [ref=e6] [cursor=pointer]:
      - /url: "#"
      - generic [ref=e8]: Commerce Lens
    - button "新建分析" [ref=e9] [cursor=pointer]
    - navigation "主导航" [ref=e11]:
      - button "经营概览" [ref=e12] [cursor=pointer]
      - button "数据概况" [ref=e18] [cursor=pointer]
      - button "分析工作台" [ref=e21] [cursor=pointer]
      - button "历史报告" [ref=e27] [cursor=pointer]
      - button "指标口径" [ref=e31] [cursor=pointer]
    - generic [ref=e34]:
      - paragraph [ref=e35]: 最近分析
      - button "支付金额变化分析" [ref=e36] [cursor=pointer]
      - button "支付金额变化分析" [ref=e41] [cursor=pointer]
      - button "支付金额变化分析 2 轮" [ref=e46] [cursor=pointer]:
        - generic [ref=e47]: 支付金额变化分析
        - generic [ref=e48]: 2 轮
      - button "支付金额变化分析 2 轮" [ref=e52] [cursor=pointer]:
        - generic [ref=e53]: 支付金额变化分析
        - generic [ref=e54]: 2 轮
    - generic [ref=e58]:
      - generic [ref=e59]: 禾
      - generic [ref=e60]:
        - text: 运营工作区
        - generic [ref=e61]: 经营分析工作区
      - button "工作区与设置" [ref=e62] [cursor=pointer]
  - banner [ref=e66]:
    - generic [ref=e67]:
      - generic [ref=e68]: 工作台
      - generic [ref=e69]: /
      - strong [ref=e70]: 经营概览
    - generic [ref=e71]:
      - button "查看当前店铺与工作区" [ref=e72] [cursor=pointer]:
        - generic [ref=e73]: 禾味食品演示店
      - generic "固定业务时钟 2026-10-22 · Asia/Shanghai；版本发布时间不代表数据完整性" [ref=e76]:
        - text: 固定演示版本
        - generic [ref=e78]: 2026-10-22
      - button "确定性计算 · 未执行 Agent" [ref=e79] [cursor=pointer]
  - main [ref=e80]:
    - generic [ref=e81]:
      - generic [ref=e82]:
        - text: 合成数据 · 真实 PostgreSQL · 确定性计算 · 未执行 Agent
        - generic [ref=e84]: /
        - generic [ref=e85]: 业务时钟 2026-10-22
      - region [ref=e86]:
        - generic [ref=e87]: BUSINESS OVERVIEW
        - generic [ref=e88]:
          - generic [ref=e89]:
            - heading "经营概览" [level=1] [ref=e90]
            - paragraph [ref=e91]: 固定演示版本，无自动同步；刷新不会生成新数据。
          - button "数据概况" [ref=e92] [cursor=pointer]
        - generic [ref=e96]:
          - generic [ref=e97]: 查看数据集
          - combobox "查看数据集" [ref=e98]:
            - option "acceptance-v1"
            - option "scenario-S01-v1"
            - option "scenario-S02-v1"
            - option "scenario-S03-v1"
            - option "scenario-S04-v1"
            - option "scenario-S05-v1"
            - option "scenario-S06-v1"
            - option "scenario-S07-v1"
            - option "scenario-S08-v1"
            - option "scenario-S09-v1"
            - option "scenario-S10-v1"
            - option "scenario-S11-v1"
            - option "scenario-S12-v1"
            - option "signals-v1" [selected]
          - generic [ref=e99]:
            - text: 固定业务时钟
            - strong [ref=e100]: 2026-10-22
          - generic [ref=e101]:
            - text: 完整截至日期
            - strong [ref=e102]: 2026-10-21
        - generic [ref=e103]:
          - generic [ref=e104]:
            - generic [ref=e105]:
              - text: 比较周期
              - combobox "比较周期" [ref=e106]:
                - option "昨天 · 对上周同日" [selected]
                - option "近7天 · 对前7天"
                - option "近30天 · 对前30天"
            - generic [ref=e107]:
              - text: 渠道筛选
              - combobox "渠道筛选" [ref=e108]:
                - option "全部渠道" [selected]
                - option "抖音（douyin）"
                - option "京东（jd）"
                - option "天猫（tmall）"
            - generic [ref=e109]:
              - text: 大区筛选
              - combobox "大区筛选" [ref=e110]:
                - option "全部大区" [selected]
                - option "华东（east）"
                - option "华北（north）"
                - option "华南（south）"
                - option "西部（west）"
            - generic [ref=e111]:
              - text: SKU筛选
              - combobox "SKU筛选" [ref=e112]:
                - option "全部SKU" [selected]
                - option "食品 A（A）"
                - option "食品 B（B）"
                - option "食品 C（C）"
            - button "清除筛选" [disabled] [ref=e113]
          - paragraph [ref=e114]: 本期：2026-10-21 至 2026-10-21基期：2026-10-14 至 2026-10-14Asia/Shanghai 自然日；接口日期右端不含当天。概览按固定业务时钟查询。
          - generic "经营指标" [ref=e115]:
            - article [ref=e116]:
              - heading [level=2] [ref=e117]:
                - button "支付金额 查看趋势" [pressed] [ref=e118] [cursor=pointer]:
                  - text: 支付金额
                  - generic [ref=e119]: 查看趋势
              - paragraph [ref=e120]: ¥70,000.00
              - paragraph [ref=e121]: 本期
              - generic [ref=e122]:
                - generic [ref=e123]:
                  - term [ref=e124]: 基期
                  - definition [ref=e125]: ¥100,000.00
                - generic [ref=e126]:
                  - term [ref=e127]: 差值
                  - definition [ref=e128]: −¥30,000.00
                - generic [ref=e129]:
                  - term [ref=e130]: 变化率
                  - definition [ref=e131]: −30.0%
            - article [ref=e132]:
              - heading [level=2] [ref=e133]:
                - button "成功退款金额 查看趋势" [ref=e134] [cursor=pointer]:
                  - text: 成功退款金额
                  - generic [ref=e135]: 查看趋势
              - paragraph [ref=e136]: ¥3,000.00
              - paragraph [ref=e137]: 本期
              - generic [ref=e138]:
                - generic [ref=e139]:
                  - term [ref=e140]: 基期
                  - definition [ref=e141]: ¥0.00
                - generic [ref=e142]:
                  - term [ref=e143]: 差值
                  - definition [ref=e144]: +¥3,000.00
                - generic [ref=e145]:
                  - term [ref=e146]: 变化率
                  - definition [ref=e147]: 不可计算
              - paragraph [ref=e148]: 基期为零，变化率不可计算。
            - article [ref=e149]:
              - heading [level=2] [ref=e150]:
                - button "支付件数 查看趋势" [ref=e151] [cursor=pointer]:
                  - text: 支付件数
                  - generic [ref=e152]: 查看趋势
              - paragraph [ref=e153]: 70 件
              - paragraph [ref=e154]: 本期
              - generic [ref=e155]:
                - generic [ref=e156]:
                  - term [ref=e157]: 基期
                  - definition [ref=e158]: 100 件
                - generic [ref=e159]:
                  - term [ref=e160]: 差值
                  - definition [ref=e161]: −30 件
                - generic [ref=e162]:
                  - term [ref=e163]: 变化率
                  - definition [ref=e164]: −30.0%
          - region [ref=e165]:
            - heading "支付金额 · 近30天日趋势" [level=2] [ref=e166]
            - paragraph [ref=e167]: 本期日期：2026-09-22 至 2026-10-21；配对基期：2026-09-15 至 2026-10-14，逐日偏移 7 天。
            - paragraph [ref=e168]: 实线为本期，虚线为配对基期；缺失数据保留断点，不补零。日趋势与指标卡的比较周期分别展示。
            - img "近30天日趋势，本期实线与配对基期虚线；缺失值断开。下方提供完整日期、数值和可用性的数据表。" [ref=e169]:
              - img [ref=e171]:
                - generic [ref=e173]:
                  - generic [ref=e174]: 元
                  - generic [ref=e175]: "0"
                  - generic [ref=e176]: 20,000
                  - generic [ref=e177]: 40,000
                  - generic [ref=e178]: 60,000
                  - generic [ref=e179]: 80,000
                  - generic [ref=e180]: 100,000
                  - generic [ref=e181]: 09-22
                  - generic [ref=e182]: 09-24
                  - generic [ref=e183]: 09-26
                  - generic [ref=e184]: 09-28
                  - generic [ref=e185]: 09-30
                  - generic [ref=e186]: 10-02
                  - generic [ref=e187]: 10-04
                  - generic [ref=e188]: 10-06
                  - generic [ref=e189]: 10-08
                  - generic [ref=e190]: 10-10
                  - generic [ref=e191]: 10-12
                  - generic [ref=e192]: 10-14
                  - generic [ref=e193]: 10-16
                  - generic [ref=e194]: 10-18
                  - generic [ref=e195]: 10-20
                  - generic [ref=e262]: 本期
                  - generic [ref=e265]: 配对基期
            - group [ref=e267]:
              - generic "查看30天趋势数据表" [ref=e268] [cursor=pointer]
          - region [ref=e269]:
            - heading "规则提示" [level=2] [ref=e270]
            - paragraph [ref=e271]: 业务规则提供待核实的变化线索，不代表统计显著性或已证实原因。
            - list [ref=e272]:
              - listitem [ref=e273]:
                - strong [ref=e274]: 支付金额变化达到业务规则提示阈值，请核实。
                - paragraph [ref=e275]: 本期 ¥70,000.00 · 基期 ¥100,000.00 · 差值 −¥30,000.00 · 变化率 −30.0%
              - listitem [ref=e276]:
                - strong [ref=e277]: SKU：A 的支付金额变化达到业务规则提示阈值，请核实。
                - paragraph [ref=e278]: 本期 ¥20,000.00 · 基期 ¥60,000.00 · 差值 −¥40,000.00 · 变化率 −66.7% · 贡献份额 +133.3%
          - paragraph [ref=e279]: 版本发布时间：2026-10-21T16:00:00.000Z本次计算时间：2026-10-23T13:37:55.375Z确定性计算 · 口径 1.0.0 · 规则 business-rules-v1 · 未执行模型
```

# Test source

```ts
  1   | import { test, expect, type Response } from "@playwright/test";
  2   | import { mkdir, writeFile } from "node:fs/promises";
  3   | import type { Catalog, Overview, QuerySpec } from "../../src/lib/types";
  4   | 
  5   | test("真实概览读取：三周期三指标、授权筛选、缺数据、刷新及旧报告恢复，全程不创建run", async ({ page }) => {
  6   |   test.setTimeout(90_000);
  7   |   const artifacts = "artifacts/frontend-overview-http-20261023";
  8   |   await mkdir(artifacts, { recursive: true });
  9   |   const traffic: { method: string; path: string; status: number }[] = [];
  10  |   const records: { version: string; request: QuerySpec; response: Overview }[] = [];
  11  |   const external: string[] = [], errors: string[] = [];
  12  |   page.on("response", (response) => {
  13  |     const path = new URL(response.url()).pathname;
  14  |     if (path.startsWith("/api/")) traffic.push({ method: response.request().method(), path, status: response.status() });
  15  |   });
  16  |   page.on("request", (request) => { if (!["localhost", "127.0.0.1"].includes(new URL(request.url()).hostname)) external.push(request.url()); });
  17  |   page.on("pageerror", (error) => errors.push(error.message));
  18  |   expect(await (await page.request.get("/api/health/ready")).json()).toEqual({ status: "ready", executionMode: "deterministic" });
  19  |   const catalog: Catalog = await (await page.request.get("/api/catalog")).json();
  20  |   expect(catalog.datasets.some((dataset) => dataset.version === "portfolio-90d-v1")).toBe(false);
  21  |   const fmt = (n: number | null, unit: "fen" | "units") => n === null ? "—" : unit === "fen"
  22  |     ? `¥${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 100)}` : `${new Intl.NumberFormat("zh-CN").format(n)} 件`;
  23  |   const isOverview = (response: Response) => /\/overview$/.test(response.url()) && response.request().method() === "POST";
  24  |   const read = async (action: () => Promise<unknown>, predicate: (query: QuerySpec) => boolean = () => true) => {
> 25  |     const pending = page.waitForResponse((response) => isOverview(response) && predicate(response.request().postDataJSON()));
      |                          ^ Error: page.waitForResponse: Test timeout of 90000ms exceeded.
  26  |     await action();
  27  |     const response = await pending;
  28  |     expect(response.status()).toBe(200);
  29  |     const data: Overview = await response.json();
  30  |     records.push({ version: data.dataset.version, request: response.request().postDataJSON(), response: data });
  31  |     expect(data.executionMode).toBe("deterministic"); expect(data.agentExecuted).toBe(false);
  32  |     for (const metric of data.metrics) await expect(page.locator(`[data-metric="${metric.metricId}"] .overview-value`)).toHaveText(fmt(metric.comparison.current, metric.unit));
  33  |     await expect(page.locator(".overview-window")).toContainText(data.query.currentWindow.startDate);
  34  |     await expect(page.getByRole("heading", { name: /近30天日趋势/ })).toContainText(data.metrics.find((metric) => metric.metricId === data.query.metricId)!.label);
  35  |     expect(data.trend.points).toHaveLength(30);
  36  |     expect(data.changes.length).toBeLessThanOrEqual(5);
  37  |     return data;
  38  |   };
  39  |   // No route interception: Chromium -> Vite -> latest Fastify source -> existing PostgreSQL.
  40  |   const initial = await read(() => page.goto("/?dataset=signals-v1"));
  41  |   expect(initial.metrics.map((metric) => metric.comparison)).toEqual([
  42  |     { current: 7000000, baseline: 10000000, delta: -3000000, changeRate: -0.3 },
  43  |     { current: 300000, baseline: 0, delta: 300000, changeRate: null },
  44  |     { current: 70, baseline: 100, delta: -30, changeRate: -0.3 },
  45  |   ]);
  46  |   await expect(page.locator(".overview-changes")).toContainText("贡献份额 +133.3%");
  47  |   await expect(page.locator('[data-metric="refund_amount"]')).toContainText("基期为零");
  48  |   await page.screenshot({ path: `${artifacts}/overview-real-desktop.png`, fullPage: true });
  49  |   for (const days of [1, 7, 30]) {
  50  |     if (days !== 1) await read(() => page.getByLabel("比较周期").selectOption(String(days)));
  51  |     for (const [metricId, label] of [["refund_amount", "成功退款金额"], ["sold_units", "支付件数"], ["paid_amount", "支付金额"]] as const) {
  52  |       const data = await read(() => page.getByRole("button", { name: `${label}查看趋势` }).click());
  53  |       expect(data.query.metricId).toBe(metricId);
  54  |       expect(data.query.currentWindow.startDate).toBe(days === 1 ? "2026-10-21" : days === 7 ? "2026-10-15" : "2026-09-22");
  55  |       expect(data.trend.offsetDays).toBe(days === 30 ? 30 : 7);
  56  |     }
  57  |   }
  58  |   await read(() => page.getByLabel("比较周期").selectOption("1"));
  59  |   await read(() => page.getByLabel("渠道筛选").selectOption("douyin"));
  60  |   await read(() => page.getByLabel("大区筛选").selectOption("east"));
  61  |   const filtered = await read(() => page.getByLabel("SKU筛选").selectOption("A"));
  62  |   expect(filtered.query.filters).toEqual({ channelId: ["douyin"], regionId: ["east"], skuId: ["A"] });
  63  |   expect(filtered.metrics[0]!.comparison.current).toBe(2000000);
  64  |   expect(filtered.metrics[0]!.comparison.baseline).toBe(6000000);
  65  |   await read(() => page.reload());
  66  |   await expect(page.getByLabel("SKU筛选")).toHaveValue("A");
  67  |   await expect(page.getByLabel("渠道筛选")).toHaveValue("douyin");
  68  |   await expect(page.getByLabel("大区筛选")).toHaveValue("east");
  69  |   await read(() => page.getByRole("button", { name: "清除筛选" }).click());
  70  |   const missing = await read(() => page.getByLabel("查看数据集").selectOption("scenario-S08-v1"));
  71  |   expect(missing.metrics[0]!.comparison.current).toBe(null);
  72  |   await expect(page.locator('[data-metric="paid_amount"]')).toContainText("覆盖不完整");
  73  |   await page.getByText("查看30天趋势数据表", { exact: true }).click();
  74  |   await expect(page.locator(".overview-trend-table tbody tr")).toHaveCount(30);
  75  |   await expect(page.locator(".overview-trend-table tbody tr").last()).toContainText("覆盖不完整");
  76  |   const quiet = await read(() => page.getByLabel("查看数据集").selectOption("scenario-S10-v1"));
  77  |   expect(quiet.changes).toEqual([]);
  78  |   await expect(page.locator(".overview-changes")).toContainText("当前范围没有触发规则提示");
  79  |   await read(() => page.getByLabel("查看数据集").selectOption("signals-v1"));
  80  |   // Rapid and repeated changes still settle on the final request, without new sessions/runs.
  81  |   await read(async () => {
  82  |     await page.getByLabel("比较周期").selectOption("7");
  83  |     await page.getByLabel("比较周期").selectOption("30");
  84  |     await page.getByLabel("比较周期").selectOption("1");
  85  |   }, (query) => query.currentWindow.startDate === "2026-10-21");
  86  |   await page.getByRole("button", { name: "支付金额查看趋势" }).click({ clickCount: 2 });
  87  |   await expect(page.locator('[data-metric="paid_amount"] .overview-value')).toHaveText("¥70,000.00");
  88  |   await read(() => page.reload());
  89  |   await page.setViewportSize({ width: 390, height: 844 });
  90  |   await page.getByLabel("比较周期").focus();
  91  |   await expect(page.getByLabel("比较周期")).toBeFocused();
  92  |   await page.getByText("查看30天趋势数据表", { exact: true }).click();
  93  |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  94  |   await page.screenshot({ path: `${artifacts}/overview-real-mobile.png`, fullPage: true });
  95  |   const history = await (await page.request.get("/api/sessions?limit=30")).json();
  96  |   expect(history.length).toBeGreaterThan(0);
  97  |   await page.goto(`/?page=overview&dataset=not-authorized&days=30&report=${history[0].reportId}`);
  98  |   await expect(page.locator(".report")).toBeVisible();
  99  |   await page.reload();
  100 |   await expect(page.locator(".report")).toBeVisible();
  101 |   const saved = await (await page.request.get(`/api/reports/${history[0].reportId}`)).json();
  102 |   await page.goto(`/?page=overview&days=7&run=${saved.runId}`);
  103 |   await expect(page.locator(".report")).toBeVisible();
  104 |   await page.reload();
  105 |   await expect(page.locator(".report")).toBeVisible();
  106 |   expect(traffic.filter((request) => request.method !== "GET" && !request.path.endsWith("/overview"))).toEqual([]);
  107 |   expect(external).toEqual([]); expect(errors).toEqual([]);
  108 |   await writeFile(`${artifacts}/overview-browser.json`, JSON.stringify({ catalog, records, traffic, external, errors, restoredReport: saved.id, restoredRun: saved.runId, modelRequestsCreated: 0 }, null, 2));
  109 | });
  110 | 
```