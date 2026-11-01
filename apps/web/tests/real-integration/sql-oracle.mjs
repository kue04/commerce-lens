import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

// Node-only, read-only oracle. No credentials, DB modules or URLs enter the web bundle.
const backend = process.env.COMMERCE_LENS_BACKEND_DIR ?? fileURLToPath(new URL("../../../../../Commerce Lens-backend/", import.meta.url));
const requireBackend = createRequire(resolve(backend, "package.json"));
const { Pool } = requireBackend("pg");
const connection = parseEnv(await readFile(resolve(backend, ".local/connection.env"), "utf8"));
const pool = new Pool({ connectionString: connection.DATABASE_URL, max: 1 });
const artifacts = fileURLToPath(new URL("../../artifacts/http-only/", import.meta.url));
const report = JSON.parse(await readFile(resolve(artifacts, "payment.json"), "utf8"));
assert.equal(report.dataset.version, "signals-v1");
assert.equal(report.query.metricId, "paid_amount");
assert.deepEqual(report.query.filters, { regionId: ["east"] });
const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout='3s'");
  const serverVersion = (await client.query("SHOW server_version")).rows[0].server_version;
  const totals = [];
  const groups = [];
  const inventory = [];
  for (const window of [report.query.currentWindow, report.query.baselineWindow]) {
    const args = ["signals-v1", "store-demo", window.startDate + "T00:00:00+08:00", window.endDateExclusive + "T00:00:00+08:00"];
    // Header total is independent of production order-line SUM / QuerySpec compiler.
    totals.push(Number((await client.query(`
      SELECT coalesce(sum(paid_amount_cents),0)::text AS total FROM business.orders
      WHERE dataset_version=$1 AND store_id=$2 AND payment_status='succeeded' AND region_id='east'
      AND paid_at >= $3 AND paid_at < $4`, args)).rows[0].total));
    groups.push((await client.query(`
      SELECT i.sku_id, sum(i.paid_amount_cents)::text AS total
      FROM business.order_items i JOIN business.orders o USING(dataset_version,store_id,order_id)
      WHERE o.dataset_version=$1 AND o.store_id=$2 AND o.payment_status='succeeded' AND o.region_id='east'
      AND o.paid_at >= $3 AND o.paid_at < $4 GROUP BY i.sku_id ORDER BY i.sku_id`, args)).rows);
    inventory.push((await client.query(`
      SELECT count(*) FILTER (WHERE is_observed)::int AS observed,
        count(*) FILTER (WHERE is_observed AND available_units=0)::int AS zero
      FROM business.inventory_hourly WHERE dataset_version=$1 AND store_id=$2 AND sku_id='A' AND region_id='east'
      AND hour_at >= $3 AND hour_at < $4`, args)).rows[0]);
  }
  assert.deepEqual(totals, [7000000, 10000000]);
  assert.equal(report.comparison.current, totals[0]);
  assert.equal(report.comparison.baseline, totals[1]);
  assert.equal(report.comparison.delta, totals[0] - totals[1]);
  const deltas = groups[0].map((row) => ({ sku: row.sku_id, delta: Number(row.total) - Number(groups[1].find((base) => base.sku_id === row.sku_id)?.total ?? 0) }));
  assert.deepEqual(deltas, [{ sku: "A", delta: -4000000 }, { sku: "B", delta: 1000000 }]);
  for (const row of deltas) assert.equal(report.contributors.find((c) => c.key === row.sku).delta, row.delta);
  assert.deepEqual(inventory, [{ observed: 24, zero: 10 }, { observed: 24, zero: 0 }]);
  const saved = (await client.query("SELECT dto FROM app.reports WHERE report_id=$1", [report.id])).rows[0].dto;
  assert.deepEqual(saved, report);
  const run = (await client.query("SELECT dto FROM app.runs WHERE run_id=$1", [report.runId])).rows[0].dto;
  assert.equal(run.usage.modelRequests, 0);
  assert.equal(saved.provenance.agentExecuted, false);
  await client.query("COMMIT");
  const evidence = { verifiedAt: new Date().toISOString(), readOnly: true, serverVersion, reportId: report.id,
    dataset: report.dataset.version, totals, deltas, inventory, storedReportEqualsBrowserDownload: true,
    modelRequests: run.usage.modelRequests, agentExecuted: saved.provenance.agentExecuted };
  await writeFile(resolve(artifacts, "payment-sql-oracle.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  client.release();
  await pool.end();
}
