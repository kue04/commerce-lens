CREATE SCHEMA business;
CREATE TABLE business.datasets (
 dataset_version text PRIMARY KEY,
 schema_version text NOT NULL,
 seed integer NOT NULL,
 published_at timestamptz,
 business_clock date NOT NULL,
 is_synthetic boolean NOT NULL CHECK (is_synthetic),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 CHECK ((status='published') = (published_at IS NOT NULL))
);
CREATE TABLE business.products (
 dataset_version text NOT NULL REFERENCES business.datasets,
 store_id text NOT NULL, sku_id text NOT NULL, name text NOT NULL, category text NOT NULL,
 PRIMARY KEY(dataset_version,store_id,sku_id)
);
CREATE TABLE business.orders (
 dataset_version text NOT NULL REFERENCES business.datasets,
 store_id text NOT NULL, order_id text NOT NULL, paid_at timestamptz,
 payment_status text NOT NULL CHECK(payment_status IN ('succeeded','pending','failed')),
 channel_id text NOT NULL, region_id text NOT NULL,
 paid_amount_cents bigint NOT NULL CHECK(paid_amount_cents BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(dataset_version,store_id,order_id),
 CHECK(payment_status <> 'succeeded' OR paid_at IS NOT NULL)
);
CREATE TABLE business.order_items (
 dataset_version text NOT NULL, store_id text NOT NULL, order_item_id text NOT NULL, order_id text NOT NULL,
 sku_id text NOT NULL, category_at_sale text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),
 paid_amount_cents bigint NOT NULL CHECK(paid_amount_cents BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(dataset_version,store_id,order_item_id),
 FOREIGN KEY(dataset_version,store_id,order_id) REFERENCES business.orders,
 FOREIGN KEY(dataset_version,store_id,sku_id) REFERENCES business.products
);
CREATE TABLE business.refund_events (
 dataset_version text NOT NULL, store_id text NOT NULL, refund_event_id text NOT NULL, order_item_id text NOT NULL,
 succeeded_at timestamptz, status text NOT NULL CHECK(status IN ('succeeded','pending','failed')),
 refund_amount_cents bigint NOT NULL CHECK(refund_amount_cents BETWEEN 0 AND 9007199254740991),
 refunded_units integer NOT NULL CHECK(refunded_units>=0), reason_code text,
 PRIMARY KEY(dataset_version,store_id,refund_event_id),
 FOREIGN KEY(dataset_version,store_id,order_item_id) REFERENCES business.order_items,
 CHECK(status <> 'succeeded' OR succeeded_at IS NOT NULL)
);
CREATE TABLE business.source_watermarks (
 dataset_version text NOT NULL REFERENCES business.datasets,
 store_id text NOT NULL,
 source text NOT NULL CHECK(source IN ('orders','order_items','refund_events')),
 coverage_start date NOT NULL, complete_through date NOT NULL,
 missing_partitions date[] NOT NULL DEFAULT '{}',
 checked_at timestamptz NOT NULL,
 PRIMARY KEY(dataset_version,store_id,source),
 CHECK(complete_through>coverage_start)
);
CREATE INDEX ON business.orders(dataset_version,store_id,paid_at);
CREATE INDEX ON business.order_items(dataset_version,store_id,order_id);
CREATE INDEX ON business.refund_events(dataset_version,store_id,succeeded_at);

-- A published dataset is immutable, including under administrator application code.
CREATE FUNCTION business.guard_fact() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version text;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
   version := OLD.dataset_version;
   PERFORM 1 FROM business.datasets WHERE dataset_version=version AND status='draft' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'dataset is immutable'; END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
   version := NEW.dataset_version;
   PERFORM 1 FROM business.datasets WHERE dataset_version=version AND status='draft' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'dataset is immutable'; END IF;
   RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER immutable_fact BEFORE INSERT OR UPDATE OR DELETE ON business.products FOR EACH ROW EXECUTE FUNCTION business.guard_fact();
CREATE TRIGGER immutable_fact BEFORE INSERT OR UPDATE OR DELETE ON business.orders FOR EACH ROW EXECUTE FUNCTION business.guard_fact();
CREATE TRIGGER immutable_fact BEFORE INSERT OR UPDATE OR DELETE ON business.order_items FOR EACH ROW EXECUTE FUNCTION business.guard_fact();
CREATE TRIGGER immutable_fact BEFORE INSERT OR UPDATE OR DELETE ON business.refund_events FOR EACH ROW EXECUTE FUNCTION business.guard_fact();
CREATE TRIGGER immutable_fact BEFORE INSERT OR UPDATE OR DELETE ON business.source_watermarks FOR EACH ROW EXECUTE FUNCTION business.guard_fact();

CREATE FUNCTION business.guard_dataset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'dataset must start as draft'; END IF;
   RETURN NEW;
 END IF;
 IF OLD.status='published' THEN RAISE EXCEPTION 'dataset is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.status='published' THEN
   IF EXISTS (
     SELECT 1 FROM business.orders o LEFT JOIN business.order_items i USING(dataset_version,store_id,order_id)
     WHERE o.dataset_version=NEW.dataset_version GROUP BY o.store_id,o.order_id,o.paid_amount_cents
     HAVING COUNT(i.order_item_id)=0 OR SUM(i.paid_amount_cents)<>o.paid_amount_cents
   ) THEN RAISE EXCEPTION 'order line totals mismatch'; END IF;
   IF EXISTS (
     SELECT 1 FROM business.refund_events r JOIN business.order_items i USING(dataset_version,store_id,order_item_id)
     JOIN business.orders o USING(dataset_version,store_id,order_id)
     WHERE r.dataset_version=NEW.dataset_version AND r.status='succeeded'
     GROUP BY r.store_id,r.order_item_id,i.paid_amount_cents,i.quantity
     HAVING SUM(r.refund_amount_cents)>i.paid_amount_cents OR SUM(r.refunded_units)>i.quantity
       OR BOOL_OR(o.payment_status<>'succeeded' OR r.succeeded_at<o.paid_at)
   ) THEN RAISE EXCEPTION 'invalid refund allocation'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER publish_guard BEFORE INSERT OR UPDATE OR DELETE ON business.datasets FOR EACH ROW EXECUTE FUNCTION business.guard_dataset();

-- Cluster role has no credentials; local bootstrap creates a random-password login.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='commerce_reader') THEN
   CREATE ROLE commerce_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA business TO commerce_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA business TO commerce_reader;
ALTER TABLE business.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.refund_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.source_watermarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY scope ON business.products TO commerce_reader USING (dataset_version=current_setting('lens.dataset',true) AND store_id=current_setting('lens.store',true));
CREATE POLICY scope ON business.orders TO commerce_reader USING (dataset_version=current_setting('lens.dataset',true) AND store_id=current_setting('lens.store',true));
CREATE POLICY scope ON business.order_items TO commerce_reader USING (dataset_version=current_setting('lens.dataset',true) AND store_id=current_setting('lens.store',true));
CREATE POLICY scope ON business.refund_events TO commerce_reader USING (dataset_version=current_setting('lens.dataset',true) AND store_id=current_setting('lens.store',true));
CREATE POLICY scope ON business.source_watermarks TO commerce_reader USING (dataset_version=current_setting('lens.dataset',true) AND store_id=current_setting('lens.store',true));
