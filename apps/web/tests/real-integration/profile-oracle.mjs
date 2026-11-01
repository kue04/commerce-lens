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
const artifacts = fileURLToPath(new URL("../../artifacts/frontend-profile-20261023/", import.meta.url));
await mkdir(artifacts, { recursive: true });
const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  const appCounts = (await client.query("SELECT (SELECT count(*) FROM app.sessions)::int AS sessions,(SELECT count(*) FROM app.runs)::int AS runs,(SELECT count(*) FROM app.reports)::int AS reports")).rows[0];
  if (process.argv.includes("--before")) {
    await writeFile(resolve(artifacts, "database-before.json"), JSON.stringify(appCounts, null, 2));
    console.log("Saved read-only app row counts before browser validation.");
  } else {
    const profiles = JSON.parse(await readFile(resolve(artifacts, "profiles-real.json"), "utf8"));
    const results = [];
    for (const profile of profiles) {
      const args = [profile.dataset.version, "store-demo"];
      const counts = {};
      for (const [source, table, dateExpression, extra] of [
        ["orders", "business.orders o", "o.paid_at AT TIME ZONE 'Asia/Shanghai'", ""],
        ["order_items", "business.order_items o", "p.paid_at AT TIME ZONE 'Asia/Shanghai'", "JOIN business.orders p USING(dataset_version,store_id,order_id)"],
        ["refund_events", "business.refund_events o", "o.succeeded_at AT TIME ZONE 'Asia/Shanghai'", ""],
        ["inventory", "business.inventory_hourly o", "o.hour_at AT TIME ZONE 'Asia/Shanghai'", ""],
        ["traffic", "business.traffic_daily o", "o.business_date", ""],
        ["promotion", "business.promotion_events o", "o.start_at AT TIME ZONE 'Asia/Shanghai'", ""],
      ]) {
        const lastExpression = source === "promotion" ? "o.end_at AT TIME ZONE 'Asia/Shanghai'" : dateExpression;
        const sql = `SELECT count(*)::int AS count,min(${dateExpression})::date::text AS first,max(${lastExpression})::date::text AS last FROM ${table} ${extra} WHERE o.dataset_version=$1 AND o.store_id=$2`;
        const row = (await client.query(sql, args)).rows[0];
        const returned = profile.sources.find((item) => item.source === source);
        assert.equal(returned.rowCount, row.count);
        assert.equal(returned.actualStartDate, row.first);
        assert.equal(returned.actualEndDate, row.last);
        counts[source] = { ...row, sql };
      }
      assert.equal(profile.counts.orders, counts.orders.count);
      assert.equal(profile.counts.orderItems, counts.order_items.count);
      assert.equal(profile.counts.refundEvents, counts.refund_events.count);
      assert.equal(profile.counts.inventoryHours, counts.inventory.count);
      assert.equal(profile.counts.trafficDays, counts.traffic.count);
      assert.equal(profile.counts.promotionEvents, counts.promotion.count);
      const paidOrders = (await client.query("SELECT count(*)::int AS count FROM business.orders WHERE dataset_version=$1 AND store_id=$2 AND payment_status='succeeded'", args)).rows[0].count;
      assert.equal(counts.orders.count, 4);
      assert.equal(counts.order_items.count, 6);
      assert.equal(counts.refund_events.count, 3);
      assert.equal(paidOrders, 3);
      const marks = (await client.query("SELECT source,coverage_start::text AS start,complete_through::text AS end,missing_partitions::text[] AS missing,checked_at FROM business.source_watermarks WHERE dataset_version=$1 AND store_id=$2", args)).rows;
      for (const returned of profile.sources) {
        const mark = marks.find((row) => row.source === returned.source);
        assert.equal(returned.coverageStart, mark?.start ?? null);
        assert.equal(returned.completeThrough, mark?.end ?? null);
        assert.equal(returned.checkedAt, mark?.checked_at.toISOString() ?? null);
        assert.deepEqual(returned.missingPartitions, mark?.missing ?? []);
      }
      results.push({ version: profile.dataset.version, counts, paidOrders, paidOrderFieldInContract: false, note: "总订单4与支付成功订单3不同；前端将成功订单字段显示为后端尚未提供。" });
    }
    const before = JSON.parse(await readFile(resolve(artifacts, "database-before.json"), "utf8"));
    assert.deepEqual(appCounts, before);
    const serverVersion = (await client.query("SHOW server_version")).rows[0].server_version;
    await writeFile(resolve(artifacts, "profile-sql-oracle.json"), JSON.stringify({ serverVersion, readOnly: true, appCountsBefore: before, appCountsAfter: appCounts, results }, null, 2));
    console.log("Profile counts, dates and source watermarks match independent read-only SQL; manual totals 4/6/3; app session/run/report counts unchanged.");
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
