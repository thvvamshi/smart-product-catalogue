CREATE TABLE categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
  slug VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX categories_parent_active_idx ON categories (parent_id, is_active, sort_order, id);

ALTER TABLE products ADD COLUMN category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX products_category_id_idx ON products (category_id, id);

CREATE TABLE product_variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku VARCHAR(96) NOT NULL UNIQUE,
  gender VARCHAR(16) CHECK (gender IS NULL OR gender IN ('men', 'women', 'unisex', 'kids')),
  size VARCHAR(32),
  size_system VARCHAR(24),
  color VARCHAR(64),
  color_code VARCHAR(7) CHECK (color_code IS NULL OR color_code ~ '^#[0-9A-Fa-f]{6}$'),
  material VARCHAR(100),
  fit VARCHAR(64),
  style VARCHAR(100),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX product_variants_product_active_idx ON product_variants (product_id, is_active, id);
CREATE INDEX product_variants_gender_idx ON product_variants (gender) WHERE is_active;
CREATE INDEX product_variants_size_idx ON product_variants (size_system, size) WHERE is_active;
CREATE INDEX product_variants_color_idx ON product_variants (color) WHERE is_active;
CREATE INDEX product_variants_material_idx ON product_variants (material) WHERE is_active;
CREATE INDEX product_variants_attributes_gin_idx ON product_variants USING GIN (attributes jsonb_path_ops);

INSERT INTO product_variants (product_id, sku, attributes)
SELECT id, sku, '{}'::jsonb FROM products
ON CONFLICT (sku) DO NOTHING;

ALTER TABLE store_inventory ADD COLUMN variant_id BIGINT;

UPDATE store_inventory inventory
SET variant_id = variant.id
FROM product_variants variant
WHERE variant.product_id = inventory.product_id AND variant.sku = (SELECT sku FROM products WHERE id = inventory.product_id);

ALTER TABLE store_inventory ALTER COLUMN variant_id SET NOT NULL;
ALTER TABLE store_inventory ADD CONSTRAINT store_inventory_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
ALTER TABLE store_inventory DROP CONSTRAINT store_inventory_store_product_key;
ALTER TABLE store_inventory ADD CONSTRAINT store_inventory_store_variant_key UNIQUE (store_id, variant_id);

CREATE INDEX store_inventory_variant_store_idx ON store_inventory (variant_id, store_id);
CREATE INDEX store_inventory_fulfilment_idx ON store_inventory (variant_id, is_available, stock_quantity, selling_price, store_id);

CREATE FUNCTION enforce_store_inventory_variant_product() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  variant_product_id BIGINT;
BEGIN
  SELECT product_id INTO variant_product_id FROM product_variants WHERE id = NEW.variant_id;
  IF variant_product_id IS NULL OR variant_product_id <> NEW.product_id THEN
    RAISE EXCEPTION 'store inventory product_id must match variant product_id' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER store_inventory_variant_product_check
BEFORE INSERT OR UPDATE OF product_id, variant_id ON store_inventory
FOR EACH ROW EXECUTE FUNCTION enforce_store_inventory_variant_product();
