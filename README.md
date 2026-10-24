# Smart Product Search & Catalogue

A deployment-ready React/Express/PostgreSQL catalogue built for the Getto India Full Stack Developer assessment. It focuses on correct combined filtering, safe partial search, stable database pagination, explicit validation, and automated behavior tests.

## Architecture

- **Client:** React 19, TypeScript, Vite, React Router. The URL query string is the source of truth for filters and sort. An `IntersectionObserver` starts each 20-product cursor request near the end of the grid and successful batches are appended. Search input is debounced by 300 ms; request generations and `AbortController` prevent stale results from being appended.
- **API:** Express 5 and TypeScript using Model–Controller–Service–Route layers. Routes attach Zod validation middleware, controllers translate HTTP requests and responses, services apply cursor-pagination behavior, and models own parameterized PostgreSQL queries.
- **Database:** PostgreSQL 16 through `pg`. Filtering, sorting, and keyset pagination stay in SQL. The API fetches `limit + 1` rows to determine whether another page exists and does not run a separate count query. PostgreSQL `NUMERIC` values are deliberately serialized as JSON numbers; product IDs remain strings to avoid JavaScript `BIGINT` precision loss.
- **Deployment:** One monorepo, a Render web service for `server`, a Render static site for `client`, and Neon PostgreSQL.

```text
client/                   React application and tests
server/src/models/        Product SQL, filters, sorting, and keyset queries
server/src/controllers/   HTTP request/response handling
server/src/services/      Product-search and cursor-pagination behavior
server/src/routes/        Product, health, and aggregate API routers
server/src/schemas/       Zod request schemas
server/src/types/         Shared backend product types
server/src/middleware/    Validation and centralized HTTP error handling
server/database/          Reproducible schema and deterministic seed
server/tests/             PostgreSQL integration tests
docker-compose.yml        Development and isolated test databases
```

## Prerequisites

- Node.js 20+
- npm 10+
- Docker with Compose

## Local setup

```bash
npm install
docker compose up -d postgres postgres-test
copy server\.env.example server\.env
npm run db:schema -w server
npm run db:seed -w server
npm run db:verify-count -w server
npm run dev
```

The client is at `http://localhost:5173`, API at `http://localhost:4000/api`, PostgreSQL at `localhost:5432`, and the isolated test PostgreSQL at `localhost:5433`. On macOS/Linux use `cp` instead of `copy`.

The development database uses the named `catalogue_postgres_data` volume. Stop services with `docker compose down`. Adding `-v` deletes the local database volume, so do that only when a full local reset is intended.

## Environment variables

Backend (`server/.env`):

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | API listener port (Render supplies this) |
| `DATABASE_URL` | PostgreSQL connection string, backend only |
| `CLIENT_URL` | Allowed CORS origin; comma-separated origins are supported |
| `TEST_DATABASE_URL` | Dedicated integration database; its name must contain `test` |

Frontend (`client/.env`): `VITE_API_URL` is the public API base including `/api`. Leave it empty locally to use Vite's proxy. Never place secrets in a `VITE_*` variable. Examples contain local/placeholding values only; `.env` files are ignored.

## Database and seed

```bash
npm run db:schema -w server
npm run db:seed -w server
```

The schema command is additive/idempotent. The seed targets 1,004 deterministic records, upserts by SKU, preserves unrelated records, and never truncates data. It includes literal `%`, `_`, and backslash fixtures. `db:verify-count` performs a read-only `COUNT(*)` and fails when fewer than the required 500 products exist. **Neither schema nor seed runs automatically during production deployment.** Apply the schema, review it, and run the seed once against Neon when desired.

The table enforces unique SKU, non-negative price, a 0–5 rating, required descriptive fields, stock state, and timestamps. B-tree indexes cover exact category/brand filters, price, and each stable sort. Individual GIN trigram indexes cover `name`, `description`, `brand`, `category`, and `sku`, matching the five-way `OR` search better than assuming a combined expression index can serve each branch.

PostgreSQL may choose a sequential scan for this small seed or search terms shorter than roughly three characters; trigram indexes become more useful as data/selectivity increase. Verify on representative production-like data rather than claiming index use:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM products
WHERE name ILIKE '%wireless%' ESCAPE '\'
   OR description ILIKE '%wireless%' ESCAPE '\'
ORDER BY created_at DESC, id DESC LIMIT 20;
```

## Commands

```bash
npm run dev          # client + server
npm test             # backend integration + frontend behavior tests
npm run typecheck
npm run build
```

Tests refuse destructive setup unless the selected database name contains `test`. Test setup truncates only that dedicated database. Never point `TEST_DATABASE_URL` at development or production.

## API

All responses are JSON. Interactive-style reference content is available at `/docs` in the React app.

### `GET /api/products`

Parameters: `q`, `category`, `brand`, `minPrice`, `maxPrice`, `minRating`, `inStock`, `sort`, optional opaque `cursor`, and `limit` (default 20, maximum 100). Sort values are `price_asc`, `price_desc`, `rating_desc`, `newest`, and `name_asc`.

```bash
curl "http://localhost:4000/api/products?q=wireless&category=Electronics&minRating=4&inStock=true&sort=rating_desc&limit=20"
curl "http://localhost:4000/api/products/1"
curl "http://localhost:4000/api/health/db"
```

Search is case-insensitive and partial across name, description, brand, category, and SKU. `%`, `_`, and `\` are escaped before binding, so user input cannot introduce wildcard semantics. All filters use `AND`; SQL values are placeholders. Sort fragments come only from a server allowlist.

Success uses `{ "data": [...], "pagination": { "limit": 20, "nextCursor": "...", "hasNextPage": true } }`. The catalogue makes its first request without a cursor. As the sentinel approaches the viewport, it sends `nextCursor` as `cursor` with the same filters and sort, then appends the returned products. Loading stops when `hasNextPage` is false and `nextCursor` is null. Cursors encode the selected sort, the last sort-key value, and the unique ID, and are validated before use. Exact totals and page numbers are intentionally omitted to avoid a full `COUNT(*)` on every request. Errors use `{ "error": { "code": "...", "message": "...", "details": [...] } }`. Statuses are 200, 400, 404, and safe 500 responses.

## Security considerations

- Parameterized query values and allowlisted sort clauses; literal wildcard escaping.
- Strict Zod objects reject unknown or malformed parameters.
- Helmet headers, explicit GET-only CORS origins, small JSON body limit, and no Express signature.
- Database errors are logged without query values and returned as generic messages.
- Secrets remain server-side. Production enables TLS for the managed database.
- For a public high-traffic service, add edge/API rate limiting and structured secret-redacted logging.

## Deploy to Neon and Render

1. Create a Neon project (free tier availability and limits can change). Copy its pooled PostgreSQL URL into the backend's `DATABASE_URL`; do not commit it.
2. Locally set that URL temporarily, run `npm run db:schema -w server`, and optionally run the idempotent seed once. Confirm the target before doing so.
3. Push this monorepo to GitHub.
4. Create a Render **Web Service** with root `server`, build `npm ci && npm run build`, start `npm start`, and health path `/api/health`. Set `NODE_ENV=production`, `DATABASE_URL`, and `CLIENT_URL`. Render supplies `PORT`.
5. Create a Render **Static Site** with root `client`, build `npm ci && npm run build`, publish `dist`, and set `VITE_API_URL=https://YOUR-API.onrender.com/api`. `public/_redirects` supplies SPA fallback.
6. Update backend `CLIENT_URL` to the exact static-site origin and redeploy. Verify `/`, `/docs`, direct refreshes, and both health endpoints.

Deployment URLs (fill in after credentials are available):

- Frontend: _not deployed_
- Backend: _not deployed_

Render/Neon free plans may sleep, cold-start, cap compute/storage, or change terms. Consult current provider limits before submission.

## Screenshots

Add final desktop/mobile screenshots here after deployment.

## Scalability and known limitations

At 100,000+ products, inspect actual plans with `EXPLAIN (ANALYZE, BUFFERS)`, refresh statistics, and consider composite indexes that reflect observed filter/sort combinations. Infinite loading uses sort-specific keyset predicates rather than increasingly expensive offsets. Loaded products remain in browser memory for the current criteria; very long sessions could use list virtualization or discard distant rendered rows. The five-field `OR` search is intentionally simple—larger catalogues may benefit from a weighted `tsvector` or a dedicated search service. Product images currently use remote placeholders. Facet values are static in the client and should become a database-backed metadata endpoint if catalogue taxonomy changes frequently.
