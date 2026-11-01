import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const backend = process.env.COMMERCE_LENS_BACKEND_DIR ?? fileURLToPath(new URL("../../../../../Commerce Lens-backend/", import.meta.url));
const { Pool } = createRequire(resolve(backend, "package.json"))("pg");
const env = parseEnv(await readFile(resolve(backend, ".local/connection.env"), "utf8"));
const pool = new Pool({ connectionString: env.DATABASE_URL, options: "-c default_transaction_read_only=on", max: 1 });
const artifacts = process.env.COMMERCE_LENS_OVERVIEW_ARTIFACTS
  ? resolve(process.env.COMMERCE_LENS_OVERVIEW_ARTIFACTS)
  : fileURLToPath(new URL("../../artifacts/frontend-overview-http-20261023/", import.meta.url));
await mkdir(artifacts, { recursive: true });
const client = await pool.connect();
const shift = (day, offset) => new Date(Date.parse(day + "T00:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
// Independent SQL: order-header amounts, correlated item totals, and refunds queried separately.
// No production compiler, analytics, comparison or rule helpers are imported.
const paymentSql = `SELECT (o.paid_at AT TIME ZONE 'Asia/Shanghai')::date::text AS day,
  sum(CASE WHEN $5::text[] IS NULL THEN o.paid_amount_cents ELSE
    (SELECT coalesce(sum(i.paid_amount_cents),0) FROM business.order_items i
      WHERE i.dataset_version=o.dataset_version AND i.store_id=o.store_id AND i.order_id=o.order_id AND i.sku_id=ANY($5)) END)::text AS amount,
  sum((SELECT coalesce(sum(i.quantity),0) FROM business.order_items i
    WHERE i.dataset_version=o.dataset_version AND i.store_id=o.store_id AND i.order_id=o.order_id AND ($5::text[] IS NULL OR i.sku_id=ANY($5))))::text AS units
  FROM business.orders o WHERE o.dataset_version=$1 AND o.store_id=$2 AND o.payment_status='succeeded'
  AND ($3::text[] IS NULL OR o.channel_id=ANY($3)) AND ($4::text[] IS NULL OR o.region_id=ANY($4)) GROUP BY 1 ORDER BY 1`;
const refundSql = `SELECT (r.succeeded_at AT TIME ZONE 'Asia/Shanghai')::date::text AS day, sum(r.refund_amount_cents)::text AS amount
  FROM business.refund_events r JOIN business.order_items i USING(dataset_version,store_id,order_item_id)
  JOIN business.orders o USING(dataset_version,store_id,order_id)
  WHERE r.dataset_version=$1 AND r.store_id=$2 AND r.status='succeeded'
  AND ($3::text[] IS NULL OR o.channel_id=ANY($3)) AND ($4::text[] IS NULL OR o.region_id=ANY($4))
  AND ($5::text[] IS NULL OR i.sku_id=ANY($5)) GROUP BY 1 ORDER BY 1`;
const watermarkSql = `SELECT source,coverage_start::text,complete_through::text,missing_partitions::text[] FROM business.source_watermarks WHERE dataset_version=$1 AND store_id=$2 ORDER BY source`;
try {
  await client.query("BEGIN READ ONLY");
  const counts = (await client.query("SELECT (SELECT count(*) FROM app.sessions)::int AS sessions,(SELECT count(*) FROM app.runs)::int AS runs,(SELECT count(*) FROM app.reports)::int AS reports,(SELECT count(*) FROM app.run_events)::int AS events,(SELECT count(*) FROM app.evidences)::int AS evidences")).rows[0];
  const snapshot = (await client.query(`SELECT md5(string_agg(row_to_json(d)::text,'|' ORDER BY d.dataset_version)) AS datasets FROM business.datasets d`)).rows[0];
  if (process.argv.includes("--before")) {
    await writeFile(resolve(artifacts, "database-before.json"), JSON.stringify({ counts, snapshot }, null, 2));
    console.log("Saved pre-verification app counts and dataset publication fingerprint (read-only).");
  } else {
    const browser = JSON.parse(await readFile(resolve(artifacts, "overview-browser.json"), "utf8"));
    const cache = new Map(), results = [];
    async function source(version, filters) {
      const key = JSON.stringify([version, filters]);
      if (cache.has(key)) return cache.get(key);
      const args = [version, "store-demo", filters.channelId ?? null, filters.regionId ?? null, filters.skuId ?? null];
      const data = { args, payments: (await client.query(paymentSql, args)).rows, refunds: (await client.query(refundSql, args)).rows,
        watermarks: (await client.query(watermarkSql, args.slice(0, 2))).rows };
      cache.set(key, data); return data;
    }
    function value(data, metric, window) {
      // Refunds need the sale dimensions too: the published metric definition requires all three sources.
      const required = metric === "refund_amount" ? ["orders", "order_items", "refund_events"] : ["orders", "order_items"];
      const complete = required.every((name) => {
        const mark = data.watermarks.find((row) => row.source === name);
        return mark && mark.coverage_start <= window.startDate && mark.complete_through >= window.endDateExclusive &&
          !mark.missing_partitions.some((day) => day >= window.startDate && day < window.endDateExclusive);
      });
      if (!complete) return null;
      const rows = metric === "refund_amount" ? data.refunds : data.payments;
      return Number(rows.filter((row) => row.day >= window.startDate && row.day < window.endDateExclusive)
        .reduce((total, row) => total + BigInt(metric === "sold_units" ? row.units : row.amount), 0n));
    }
    function comparison(data, metric, query) {
      const current = value(data, metric, query.currentWindow), baseline = value(data, metric, query.baselineWindow);
      const delta = current === null || baseline === null ? null : current - baseline;
      return { current, baseline, delta, changeRate: delta === null || baseline === 0 ? null : delta / baseline };
    }
    let cardChecks = 0, dailyChecks = 0, changeChecks = 0;
    for (const record of browser.records) {
      const { response, request, version } = record;
      assert.deepEqual(response.query, request);
      const data = await source(version, request.filters);
      for (const metric of response.metrics) { assert.deepEqual(metric.comparison, comparison(data, metric.metricId, request)); cardChecks++; }
      const expectedStart = shift(request.currentWindow.endDateExclusive, -30);
      for (const [i, point] of response.trend.points.entries()) {
        assert.equal(point.date, shift(expectedStart, i));
        assert.equal(point.baselineDate, shift(point.date, -response.trend.offsetDays));
        const daily = { ...request, currentWindow: { startDate: point.date, endDateExclusive: shift(point.date, 1) }, baselineWindow: { startDate: point.baselineDate, endDateExclusive: shift(point.baselineDate, 1) } };
        assert.deepEqual(point.analysisQuery, daily);
        assert.deepEqual(point.comparison, comparison(data, request.metricId, daily)); dailyChecks++;
      }
      for (const change of response.changes) {
        const scoped = await source(version, change.analysisQuery.filters);
        assert.deepEqual(change.comparison, comparison(scoped, request.metricId, change.analysisQuery)); changeChecks++;
      }
      results.push({ version, request, cardComparisons: response.metrics.map((metric) => ({ metricId: metric.metricId, ...metric.comparison })), changes: response.changes.length });
    }
    const manual = browser.records.find((record) => record.version === "signals-v1" && record.request.metricId === "paid_amount" && !Object.keys(record.request.filters).length && record.request.currentWindow.startDate === "2026-10-21").response;
    assert.deepEqual(manual.metrics.map((metric) => [metric.comparison.current, metric.comparison.baseline]), [[7000000,10000000],[300000,0],[70,100]]);
    assert.deepEqual(manual.contributors.map((row) => [row.key,row.delta,row.share]), [["A",-4000000,4/3],["B",1000000,-1/3]]);
    const before = JSON.parse(await readFile(resolve(artifacts, "database-before.json"), "utf8"));
    assert.deepEqual({ counts, snapshot }, before);
    const serverVersion = (await client.query("SHOW server_version")).rows[0].server_version;
    await writeFile(resolve(artifacts, "overview-sql-oracle.json"), JSON.stringify({ serverVersion, readOnly: true, before, after: { counts, snapshot }, cardChecks, dailyChecks, changeChecks,
      sql: { paymentSql, refundSql, watermarkSql }, sources: [...cache.values()], results,
      manual: { paid: [7000000,10000000], refunds: [300000,0], units: [70,100], contributionA: [-4000000,4/3], contributionB: [1000000,-1/3] } }, null, 2));
    console.log(`Independent SQL matches ${cardChecks} cards, ${dailyChecks} daily pairs, ${changeChecks} rule comparisons; manual values/negative and >100% shares match; app counts/publications unchanged.`);
  }
  await client.query("COMMIT");
} finally { client.release(); await pool.end(); }
