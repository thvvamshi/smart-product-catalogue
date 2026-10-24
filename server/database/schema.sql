CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  brand VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  rating NUMERIC(2,1) NOT NULL CHECK (rating >= 0 AND rating <= 5),
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  image_url TEXT
);

CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
CREATE INDEX IF NOT EXISTS products_brand_idx ON products (brand);
CREATE INDEX IF NOT EXISTS products_price_idx ON products (price);
CREATE INDEX IF NOT EXISTS products_price_id_idx ON products (price ASC, id ASC);
CREATE INDEX IF NOT EXISTS products_rating_id_idx ON products (rating DESC, id ASC);
CREATE INDEX IF NOT EXISTS products_rating_keyset_idx ON products ((-rating) ASC, id ASC);
CREATE INDEX IF NOT EXISTS products_created_id_idx ON products (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS products_name_id_idx ON products (name ASC, id ASC);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_description_trgm_idx ON products USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_brand_trgm_idx ON products USING GIN (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_category_trgm_idx ON products USING GIN (category gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_sku_trgm_idx ON products USING GIN (sku gin_trgm_ops);
