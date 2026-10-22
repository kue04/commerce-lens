-- Independent scalar-subquery oracle. Payment uses order headers when no SKU
-- filter is present; SKU payment is a correlated line sum. Never join refunds
-- into the payment aggregation. Version/store/time/filters are bound values.
SELECT
 (SELECT COALESCE(SUM(CASE WHEN $7::text[] IS NULL THEN o.paid_amount_cents ELSE
    (SELECT COALESCE(SUM(i.paid_amount_cents),0) FROM business.order_items i WHERE i.dataset_version=o.dataset_version AND i.store_id=o.store_id AND i.order_id=o.order_id AND i.sku_id=ANY($7)) END),0)::text
  FROM business.orders o WHERE o.dataset_version=$1 AND o.store_id=$2 AND o.payment_status='succeeded' AND o.paid_at>=$3 AND o.paid_at<$4
  AND ($5::text[] IS NULL OR o.channel_id=ANY($5)) AND ($6::text[] IS NULL OR o.region_id=ANY($6))) AS paid,
 (SELECT COALESCE(SUM(i.quantity),0)::text FROM business.order_items i WHERE i.dataset_version=$1 AND i.store_id=$2 AND ($7::text[] IS NULL OR i.sku_id=ANY($7))
  AND EXISTS(SELECT 1 FROM business.orders o WHERE o.dataset_version=i.dataset_version AND o.store_id=i.store_id AND o.order_id=i.order_id AND o.payment_status='succeeded'
   AND o.paid_at>=$3 AND o.paid_at<$4 AND ($5::text[] IS NULL OR o.channel_id=ANY($5)) AND ($6::text[] IS NULL OR o.region_id=ANY($6)))) AS units,
 (SELECT COALESCE(SUM(r.refund_amount_cents),0)::text FROM business.refund_events r WHERE r.dataset_version=$1 AND r.store_id=$2 AND r.status='succeeded' AND r.succeeded_at>=$3 AND r.succeeded_at<$4
  AND EXISTS(SELECT 1 FROM business.order_items i WHERE i.dataset_version=r.dataset_version AND i.store_id=r.store_id AND i.order_item_id=r.order_item_id AND ($7::text[] IS NULL OR i.sku_id=ANY($7))
    AND EXISTS(SELECT 1 FROM business.orders o WHERE o.dataset_version=i.dataset_version AND o.store_id=i.store_id AND o.order_id=i.order_id AND ($5::text[] IS NULL OR o.channel_id=ANY($5)) AND ($6::text[] IS NULL OR o.region_id=ANY($6))))) AS refund;
