CREATE TABLE customer_addresses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id VARCHAR(128),
  session_id VARCHAR(128) NOT NULL,
  label VARCHAR(80) NOT NULL,
  recipient_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL CHECK (phone ~ '^[0-9+ -]{8,20}$'),
  address_line1 TEXT NOT NULL,
  address_line2 TEXT NOT NULL DEFAULT '',
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(6) NOT NULL CHECK (postal_code ~ '^[0-9]{6}$'),
  latitude NUMERIC(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX customer_addresses_session_idx ON customer_addresses(session_id, id);
CREATE UNIQUE INDEX customer_addresses_one_default_session_idx ON customer_addresses(session_id) WHERE is_default;

CREATE TABLE carts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id VARCHAR(128),
  session_id VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','checkout','abandoned')),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX carts_one_active_session_idx ON carts(session_id) WHERE status='active';
CREATE INDEX carts_session_status_idx ON carts(session_id,status,id);

CREATE TABLE cart_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id BIGINT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_price_snapshot NUMERIC(12,2) NOT NULL CHECK (unit_price_snapshot >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cart_items_cart_variant_key UNIQUE(cart_id,variant_id),
  CONSTRAINT cart_items_inventory_fkey FOREIGN KEY(store_id,variant_id)
    REFERENCES store_inventory(store_id,variant_id) ON DELETE RESTRICT
);
CREATE INDEX cart_items_cart_store_idx ON cart_items(cart_id,store_id,id);
CREATE INDEX cart_items_inventory_idx ON cart_items(store_id,variant_id);

CREATE TABLE checkout_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id BIGINT NOT NULL REFERENCES carts(id) ON DELETE RESTRICT,
  session_id VARCHAR(128) NOT NULL,
  address_id BIGINT NOT NULL REFERENCES customer_addresses(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reserved','failed','expired','completed')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee NUMERIC(12,2) CHECK (delivery_fee IS NULL OR delivery_fee >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency='INR'),
  failure_issues JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(failure_issues)='array'),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT checkout_attempts_session_key UNIQUE(session_id,idempotency_key)
);
CREATE INDEX checkout_attempts_cart_idx ON checkout_attempts(cart_id,created_at DESC);

CREATE TABLE inventory_reservations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checkout_attempt_id BIGINT NOT NULL UNIQUE REFERENCES checkout_attempts(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','expired','consumed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX inventory_reservations_expiry_idx ON inventory_reservations(expires_at,id) WHERE status='active';

CREATE TABLE inventory_reservation_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES inventory_reservations(id) ON DELETE RESTRICT,
  store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reservation_items_line_key UNIQUE(reservation_id,store_id,variant_id),
  CONSTRAINT reservation_items_inventory_fkey FOREIGN KEY(store_id,variant_id)
    REFERENCES store_inventory(store_id,variant_id) ON DELETE RESTRICT
);
CREATE INDEX reservation_items_inventory_idx ON inventory_reservation_items(store_id,variant_id);
