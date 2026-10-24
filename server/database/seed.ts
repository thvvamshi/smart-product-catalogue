
import pg from 'pg';
import { env } from '../src/config/env.js';

const categories = [
  'Electronics',
  'Home',
  'Books',
  'Sports',
  'Fashion',
  'Beauty',
  'Toys',
  'Garden',
];

const brands = [
  'NovaTech',
  'Aster',
  'BluePeak',
  'Cedar & Co',
  'Drift',
  'Everwell',
  'Flux',
  'GreenLeaf',
];

const nouns = [
  'Headphones',
  'Lamp',
  'Backpack',
  'Keyboard',
  'Bottle',
  'Speaker',
  'Camera',
  'Watch',
  'Blender',
  'Notebook',
];

const adjectives = [
  'Wireless',
  'Compact',
  'Premium',
  'Everyday',
  'Smart',
  'Classic',
  'Portable',
  'Eco',
];

const known = [
  [
    'FIX-ALPHA-100',
    'Alpha 100% Cotton Tee',
    'Literal percent fixture with breathable cotton',
    'Aster',
    'Fashion',
    29.99,
    4.5,
    true,
  ],
  [
    'FIX-UNDER_SCORE',
    'Coder_Desk Lamp',
    'Literal underscore fixture for focused work',
    'NovaTech',
    'Home',
    49.5,
    4.8,
    false,
  ],
  [
    'FIX-BS\\SLASH',
    'Backslash Utility Kit',
    'Durable repair kit for field work',
    'BluePeak',
    'Sports',
    79.0,
    4.2,
    true,
  ],
  [
    'SQL-SAFE-001',
    'Robert Tabletop Stand',
    'Safe fixture for injection test coverage',
    'Cedar & Co',
    'Home',
    100.0,
    4.0,
    true,
  ],
] as const;

const generated = Array.from({ length: 1000 }, (_, i) => {
  const n = i + 1;
  const category = categories[i % categories.length]!;
  const brand = brands[(i * 3) % brands.length]!;
  const name = `${adjectives[(i * 5) % adjectives.length]} ${
    nouns[(i * 7) % nouns.length]
  } ${n}`;

  return [
    `SKU-${String(n).padStart(5, '0')}`,
    name,
    `${name} by ${brand}, designed for reliable everyday use in ${category.toLowerCase()}.`,
    brand,
    category,
    Number((5 + ((i * 7919) % 99500) / 100).toFixed(2)),
    Number((2.5 + ((i * 17) % 26) / 10).toFixed(1)),
    i % 5 !== 0,
  ] as const;
});

const products = [...known, ...generated] as const;

const columns = [
  'sku',
  'name',
  'description',
  'brand',
  'category',
  'price',
  'rating',
  'in_stock',
  'created_at',
  'image_url',
] as const;

const batchSize = 100;

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl:
    env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
});

let transactionStarted = false;

try {
  console.log(`Connecting to PostgreSQL...`);
  await client.connect();

  console.log(`Connected. Preparing to seed ${products.length} products...`);

  await client.query('BEGIN');
  transactionStarted = true;

  for (let start = 0; start < products.length; start += batchSize) {
    const batch = products.slice(start, start + batchSize);
    const values: unknown[] = [];

    const placeholders = batch.map((item, batchIndex) => {
      const [
        sku,
        name,
        description,
        brand,
        category,
        price,
        rating,
        inStock,
      ] = item;

      const rowValues = [
        sku,
        name,
        description,
        brand,
        category,
        price,
        rating,
        inStock,
        new Date(
          Date.UTC(2024, 0, 1) +
            (start + batchIndex) * 3_600_000,
        ),
        `https://placehold.co/600x400?text=${encodeURIComponent(name)}`,
      ];

      const offset = values.length;
      values.push(...rowValues);

      return `(${rowValues
        .map((_, index) => `$${offset + index + 1}`)
        .join(', ')})`;
    });

    await client.query(
      `INSERT INTO products (${columns.join(', ')})
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         brand = EXCLUDED.brand,
         category = EXCLUDED.category,
         price = EXCLUDED.price,
         rating = EXCLUDED.rating,
         in_stock = EXCLUDED.in_stock,
         created_at = EXCLUDED.created_at,
         image_url = EXCLUDED.image_url`,
      values,
    );

    const completed = Math.min(start + batch.length, products.length);

    console.log(`Seed progress: ${completed}/${products.length}`);
  }

  await client.query('COMMIT');
  transactionStarted = false;

  const result = await client.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM products',
  );

  console.log(
    `Seed complete. Products in database: ${result.rows[0]?.count ?? 'unknown'}`,
  );
} catch (error) {
  if (transactionStarted) {
    try {
      await client.query('ROLLBACK');
      console.error('Seed transaction rolled back.');
    } catch (rollbackError) {
      console.error('Failed to roll back seed transaction:', rollbackError);
    }
  }

  console.error('Product seeding failed:', error);
  process.exitCode = 1;
} finally {
  await client.end().catch((error: unknown) => {
    console.error('Failed to close PostgreSQL connection:', error);
    process.exitCode = 1;
  });
}
