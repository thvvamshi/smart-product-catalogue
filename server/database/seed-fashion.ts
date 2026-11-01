import pg from 'pg';
import { env } from '../src/config/env.js';
import { fashionCategories, fashionProducts, type FashionProductSeed } from './fashion-data.js';

const target = new URL(env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname) && !process.argv.includes('--allow-remote')) {
  throw new Error('Refusing to seed fashion demo data into a non-local database without --allow-remote.');
}

const colors = [{ name: 'Black', code: '#111111' }, { name: 'Ivory', code: '#F4F0E6' }] as const;
function variants(product: FashionProductSeed) {
  if (product.variantKind === 'color-only') return colors.map((color, index) => ({ suffix: color.name.slice(0, 3).toUpperCase(), color, size: null, sizeSystem: null, attributes: product.categorySlug === 'bags' ? { capacity: index === 0 ? '14L' : '16L' } : product.categorySlug === 'watches' ? { strapMaterial: index === 0 ? 'Leather' : 'Metal', dialSize: '40mm' } : {} }));
  const sizes = product.variantKind === 'footwear' ? ['8', '9'] : ['M', 'L'];
  return colors.flatMap((color) => sizes.map((size) => ({ suffix: `${color.name.slice(0, 3).toUpperCase()}-${size}`, color, size, sizeSystem: product.variantKind === 'footwear' ? 'UK' : 'Alpha', attributes: {} })));
}

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
try {
  await client.connect();
  await client.query('BEGIN');
  for (const category of fashionCategories.filter(({ parent }) => parent === null)) {
    await client.query(`INSERT INTO categories (slug,name,sort_order) VALUES ($1,$2,$3) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order, is_active=TRUE, updated_at=NOW()`, [category.slug, category.name, category.order]);
  }
  for (const category of fashionCategories.filter(({ parent }) => parent !== null)) {
    await client.query(`INSERT INTO categories (parent_id,slug,name,sort_order) SELECT id,$2,$3,$4 FROM categories WHERE slug=$1 ON CONFLICT (slug) DO UPDATE SET parent_id=EXCLUDED.parent_id, name=EXCLUDED.name, sort_order=EXCLUDED.sort_order, is_active=TRUE, updated_at=NOW()`, [category.parent, category.slug, category.name, category.order]);
  }

  for (const [productIndex, product] of fashionProducts.entries()) {
    const productResult = await client.query<{ id: string }>(
      `INSERT INTO products (sku,name,description,brand,category,category_id,price,rating,in_stock,created_at,image_url)
       SELECT $1,$2,$3,$4,$5,id,$6,$7,TRUE,$8,$9 FROM categories WHERE slug=$10
       ON CONFLICT (sku) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, brand=EXCLUDED.brand, category=EXCLUDED.category, category_id=EXCLUDED.category_id, price=EXCLUDED.price, rating=EXCLUDED.rating, in_stock=TRUE, image_url=EXCLUDED.image_url
       RETURNING id::text`,
      [product.styleSku, product.name, `${product.name} from ${product.brand}. Synthetic fashion demo product.`, product.brand, product.categoryName, product.price, 4 + (productIndex % 9) / 10, new Date(Date.UTC(2025, 0, 1) + productIndex * 3600000), `https://placehold.co/600x800?text=${encodeURIComponent(product.name)}`, product.categorySlug],
    );
    const productId = productResult.rows[0]!.id;
    for (const variant of variants(product)) {
      const variantResult = await client.query<{ id: string }>(
        `INSERT INTO product_variants (product_id,sku,gender,size,size_system,color,color_code,material,fit,style,attributes,is_active,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,TRUE,NOW())
         ON CONFLICT (sku) DO UPDATE SET product_id=EXCLUDED.product_id, gender=EXCLUDED.gender, size=EXCLUDED.size, size_system=EXCLUDED.size_system, color=EXCLUDED.color, color_code=EXCLUDED.color_code, material=EXCLUDED.material, fit=EXCLUDED.fit, style=EXCLUDED.style, attributes=EXCLUDED.attributes, is_active=TRUE, updated_at=NOW()
         RETURNING id::text`,
        [productId, `${product.styleSku}-${variant.suffix}`, product.gender, variant.size, variant.sizeSystem, variant.color.name, variant.color.code, product.material, product.fit ?? null, product.style, JSON.stringify(variant.attributes)],
      );
      const variantId = variantResult.rows[0]!.id;
      await client.query(
        `INSERT INTO store_inventory (store_id,product_id,variant_id,stock_quantity,selling_price,is_available,updated_at)
         SELECT s.id,$1::bigint,$2::bigint,MOD(s.id + $3::bigint + $2::bigint,8)::integer,
                ROUND(($4::numeric * (0.96 + MOD(s.id + $2::bigint,8)::numeric / 100))::numeric,2),
                MOD(s.id + $2::bigint,7) <> 0,NOW()
         FROM stores s WHERE s.is_active AND (MOD(s.id + $3::bigint,3)=0 OR MOD(s.id + $2::bigint,5)=0)
         ON CONFLICT (store_id,variant_id) DO UPDATE SET product_id=EXCLUDED.product_id, stock_quantity=EXCLUDED.stock_quantity, selling_price=EXCLUDED.selling_price, is_available=EXCLUDED.is_available, updated_at=NOW()`,
        [productId, variantId, productIndex + 1, product.price],
      );
    }
  }
  await client.query('COMMIT');
  console.log(`Seeded ${fashionCategories.length} categories and ${fashionProducts.length} synthetic fashion products.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally { await client.end(); }
