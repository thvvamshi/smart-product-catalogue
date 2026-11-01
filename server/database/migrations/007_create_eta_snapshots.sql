CREATE TABLE IF NOT EXISTS eta_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage VARCHAR(16) NOT NULL CHECK (stage IN ('checkout','reservation','order','delivery')),
  scope VARCHAR(12) NOT NULL CHECK (scope IN ('store','overall')),
  checkout_attempt_id BIGINT REFERENCES checkout_attempts(id) ON DELETE RESTRICT,
  reservation_id BIGINT REFERENCES inventory_reservations(id) ON DELETE RESTRICT,
  customer_order_id BIGINT REFERENCES customer_orders(id) ON DELETE RESTRICT,
  store_order_id BIGINT REFERENCES store_orders(id) ON DELETE RESTRICT,
  store_id BIGINT REFERENCES stores(id) ON DELETE RESTRICT,
  eta_minutes INTEGER NOT NULL CHECK (eta_minutes > 0),
  min_eta_minutes INTEGER NOT NULL CHECK (min_eta_minutes > 0),
  max_eta_minutes INTEGER NOT NULL CHECK (max_eta_minutes >= eta_minutes),
  estimated_delivery_at TIMESTAMPTZ NOT NULL,
  latest_estimated_delivery_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  eta_source VARCHAR(40) NOT NULL,
  algorithm_version VARCHAR(32) NOT NULL,
  config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config_snapshot)='object'),
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input_snapshot)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT eta_snapshots_scope_value_check CHECK ((scope='overall' AND store_id IS NULL) OR (scope='store' AND store_id IS NOT NULL)),
  CONSTRAINT eta_snapshots_stage_link_check CHECK (
    (stage='checkout' AND checkout_attempt_id IS NOT NULL AND reservation_id IS NULL AND customer_order_id IS NULL AND store_order_id IS NULL) OR
    (stage='reservation' AND reservation_id IS NOT NULL AND checkout_attempt_id IS NOT NULL AND customer_order_id IS NULL AND store_order_id IS NULL) OR
    (stage='order' AND customer_order_id IS NOT NULL AND ((scope='overall' AND store_order_id IS NULL) OR (scope='store' AND store_order_id IS NOT NULL))) OR
    (stage='delivery' AND customer_order_id IS NOT NULL AND store_order_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS eta_snapshots_reservation_idx ON eta_snapshots(reservation_id, stage, store_id);
CREATE INDEX IF NOT EXISTS eta_snapshots_order_idx ON eta_snapshots(customer_order_id, stage, store_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS eta_snapshots_checkout_unique ON eta_snapshots(checkout_attempt_id, scope, COALESCE(store_id, 0)) WHERE stage='checkout';
CREATE UNIQUE INDEX IF NOT EXISTS eta_snapshots_reservation_unique ON eta_snapshots(reservation_id, scope, COALESCE(store_id, 0)) WHERE stage='reservation';
CREATE UNIQUE INDEX IF NOT EXISTS eta_snapshots_order_unique ON eta_snapshots(store_order_id, stage, scope, COALESCE(store_id, 0));
