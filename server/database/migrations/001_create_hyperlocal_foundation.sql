CREATE TABLE IF NOT EXISTS stores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  address_line TEXT NOT NULL DEFAULT '',
  landmark VARCHAR(255),
  area VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(16) NOT NULL,
  latitude NUMERIC(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  delivery_radius_km NUMERIC(6,2) NOT NULL CHECK (delivery_radius_km > 0),
  preparation_time_minutes INTEGER NOT NULL CHECK (preparation_time_minutes >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stores_city_active_idx ON stores (city, is_active);
CREATE INDEX IF NOT EXISTS stores_coordinates_idx ON stores (latitude, longitude);

CREATE TABLE IF NOT EXISTS store_inventory (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  stock_quantity INTEGER NOT NULL CHECK (stock_quantity >= 0),
  selling_price NUMERIC(12,2) NOT NULL CHECK (selling_price >= 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_inventory_store_product_key UNIQUE (store_id, product_id)
);

CREATE INDEX IF NOT EXISTS store_inventory_store_idx ON store_inventory (store_id, product_id);
CREATE INDEX IF NOT EXISTS store_inventory_product_idx ON store_inventory (product_id, store_id);
