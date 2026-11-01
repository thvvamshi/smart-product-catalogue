CREATE TABLE IF NOT EXISTS store_operators (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operator_key VARCHAR(128) NOT NULL UNIQUE,
  store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_operators_store_idx
  ON store_operators(store_id, is_active, id);

CREATE TABLE IF NOT EXISTS customer_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number VARCHAR(32) NOT NULL UNIQUE,
  session_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  reservation_id BIGINT NOT NULL UNIQUE REFERENCES inventory_reservations(id) ON DELETE RESTRICT,
  address_id BIGINT REFERENCES customer_addresses(id) ON DELETE RESTRICT,
  address_snapshot JSONB NOT NULL CHECK (jsonb_typeof(address_snapshot) = 'object'),
  status VARCHAR(24) NOT NULL DEFAULT 'placed' CHECK (status IN ('placed','partially_accepted','confirmed','partially_rejected','rejected','cancelled','completed')),
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_orders_session_key UNIQUE(session_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS customer_orders_session_idx
  ON customer_orders(session_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS store_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_order_id BIGINT NOT NULL REFERENCES customer_orders(id) ON DELETE RESTRICT,
  store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  store_order_number VARCHAR(40) NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'pending_acceptance' CHECK (status IN ('pending_acceptance','accepted','rejected','preparing','ready_for_pickup','cancelled')),
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  rejection_reason_code VARCHAR(32),
  rejection_note TEXT,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  preparation_started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_orders_customer_store_key UNIQUE(customer_order_id, store_id),
  CONSTRAINT store_orders_rejection_code_check CHECK (rejection_reason_code IS NULL OR rejection_reason_code IN ('OUT_OF_STOCK','DAMAGED_ITEM','VARIANT_UNAVAILABLE','STORE_UNABLE_TO_FULFIL','OTHER'))
);

CREATE INDEX IF NOT EXISTS store_orders_store_status_idx
  ON store_orders(store_id, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS store_orders_customer_order_idx
  ON store_orders(customer_order_id, id);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_order_id BIGINT NOT NULL REFERENCES store_orders(id) ON DELETE RESTRICT,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  inventory_id BIGINT NOT NULL REFERENCES store_inventory(id) ON DELETE RESTRICT,
  sku VARCHAR(96) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  image_url TEXT,
  variant_attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(variant_attributes) = 'object'),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_items_store_order_idx ON order_items(store_order_id, id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_order_id BIGINT NOT NULL REFERENCES customer_orders(id) ON DELETE RESTRICT,
  from_status VARCHAR(24),
  to_status VARCHAR(24) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_status_history_order_idx
  ON order_status_history(customer_order_id, created_at, id);

CREATE TABLE IF NOT EXISTS store_order_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_order_id BIGINT NOT NULL REFERENCES store_orders(id) ON DELETE RESTRICT,
  from_status VARCHAR(24),
  to_status VARCHAR(24) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_order_status_history_order_idx
  ON store_order_status_history(store_order_id, created_at, id);

CREATE TABLE IF NOT EXISTS order_inventory_adjustments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  inventory_id BIGINT NOT NULL REFERENCES store_inventory(id) ON DELETE RESTRICT,
  adjustment_type VARCHAR(24) NOT NULL CHECK (adjustment_type IN ('REJECTION_RESTORE')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_inventory_adjustment_once UNIQUE(order_item_id, adjustment_type)
);

CREATE INDEX IF NOT EXISTS order_inventory_adjustments_inventory_idx
  ON order_inventory_adjustments(inventory_id, created_at);
