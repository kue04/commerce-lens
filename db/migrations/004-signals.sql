ALTER TABLE business.source_watermarks DROP CONSTRAINT source_watermarks_source_check;
ALTER TABLE business.source_watermarks ADD CONSTRAINT source_watermarks_source_check CHECK(source IN ('orders','order_items','refund_events','inventory','traffic','promotion'));
CREATE TABLE business.inventory_hourly (
 dataset_version text NOT NULL,store_id text NOT NULL,sku_id text NOT NULL,region_id text NOT NULL,
 hour_at timestamptz NOT NULL CHECK(hour_at=date_trunc('hour',hour_at)),available_units integer NOT NULL CHECK(available_units>=0),is_observed boolean NOT NULL,
 PRIMARY KEY(dataset_version,store_id,sku_id,region_id,hour_at),
 FOREIGN KEY(dataset_version,store_id,sku_id) REFERENCES business.products
);
CREATE TABLE business.traffic_daily (
 dataset_version text NOT NULL REFERENCES business.datasets,store_id text NOT NULL,channel_id text NOT NULL,region_id text NOT NULL,
 business_date date NOT NULL,sessions integer NOT NULL CHECK(sessions>=0),attribution_version text NOT NULL,
 PRIMARY KEY(dataset_version,store_id,channel_id,region_id,business_date)
);
CREATE TABLE business.promotion_events (
 dataset_version text NOT NULL REFERENCES business.datasets,store_id text NOT NULL,campaign_id text NOT NULL,
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,channel_id text,sku_id text,event_type text NOT NULL,
 PRIMARY KEY(dataset_version,store_id,campaign_id),CHECK(end_at>start_at)
);
CREATE INDEX ON business.inventory_hourly(dataset_version,store_id,sku_id,region_id,hour_at);
CREATE TRIGGER immutable_fact BEFORE INSERT OR UPDATE OR DELETE ON business.inventory_hourly FOR EACH ROW EXECUTE FUNCTION business.guard_fact();
CREATE TRIGGER immutable_fact BEFORE INSERT OR UPDATE OR DELETE ON business.traffic_daily FOR EACH ROW EXECUTE FUNCTION business.guard_fact();
CREATE TRIGGER immutable_fact BEFORE INSERT OR UPDATE OR DELETE ON business.promotion_events FOR EACH ROW EXECUTE FUNCTION business.guard_fact();
ALTER TABLE business.inventory_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.traffic_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.promotion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY scope ON business.inventory_hourly TO commerce_reader USING(dataset_version=current_setting('lens.dataset',true) AND store_id=current_setting('lens.store',true));
CREATE POLICY scope ON business.traffic_daily TO commerce_reader USING(dataset_version=current_setting('lens.dataset',true) AND store_id=current_setting('lens.store',true));
CREATE POLICY scope ON business.promotion_events TO commerce_reader USING(dataset_version=current_setting('lens.dataset',true) AND store_id=current_setting('lens.store',true));
GRANT SELECT ON business.inventory_hourly,business.traffic_daily,business.promotion_events TO commerce_reader;
