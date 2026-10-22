-- Independent reference: payment uses order headers except for explicit SKU filters;
-- refunds are scalar aggregates, never joined into the payment aggregation.
-- Inputs: version, store, start UTC, end UTC. No production compiler is imported.
SELECT
 (SELECT COALESCE(SUM(o.paid_amount_cents),0)::text FROM business.orders o
  WHERE o.dataset_version=$1 AND o.store_id=$2 AND o.payment_status='succeeded' AND o.paid_at >= $3 AND o.paid_at < $4) AS paid,
 (SELECT COUNT(*)::text FROM business.orders o
  WHERE o.dataset_version=$1 AND o.store_id=$2 AND o.payment_status='succeeded' AND o.paid_at >= $3 AND o.paid_at < $4) AS orders,
 (SELECT COALESCE(SUM(i.quantity),0)::text FROM business.order_items i
  WHERE i.dataset_version=$1 AND i.store_id=$2 AND EXISTS (
   SELECT 1 FROM business.orders o WHERE o.dataset_version=i.dataset_version AND o.store_id=i.store_id AND o.order_id=i.order_id
    AND o.payment_status='succeeded' AND o.paid_at >= $3 AND o.paid_at < $4)) AS units,
 (SELECT COALESCE(SUM(r.refund_amount_cents),0)::text FROM business.refund_events r
  WHERE r.dataset_version=$1 AND r.store_id=$2 AND r.status='succeeded' AND r.succeeded_at >= $3 AND r.succeeded_at < $4) AS refund;
