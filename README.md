# Smart Product Search & Catalogue

**Search fast. Filter precisely. Browse seamlessly.**

A full-stack product discovery application built for the **Getto India Full Stack Developer technical assessment**. It combines a React storefront with a Node.js REST API and PostgreSQL to deliver case-insensitive search, composable filters, stable sorting, and cursor-based infinite scrolling.

Designed with practical engineering priorities in mind: validated inputs, parameterized SQL, predictable pagination, database indexes, and automated tests.

> **Project status:** Core functionality is implemented. Production deployment and screenshots are pending. No license has been specified yet; see [License](#license) before reusing or distributing this project.

## Project Overview

| Area | Implementation |
|---|---|
| Assessment | Smart Product Search & Catalogue System |
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL 16 |
| Database access | `pg` with parameterized SQL |
| Validation | Zod |
| Testing | Vitest, Supertest, React Testing Library |
| Local database | Docker Compose |
| Planned production database | Neon PostgreSQL |
| Planned deployment | Render Web Service and Static Site |
| Sample data | 1,004 deterministic products |
| Pagination | Server-side cursor-based keyset pagination |
| Repository | [smart-product-catalogue](https://github.com/thvvamshi/smart-product-catalogue) |

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Design and Seed Data](#database-design-and-seed-data)
- [Search Implementation](#search-implementation)
- [API Documentation](#api-documentation)
- [Pagination and Infinite Scrolling](#pagination-and-infinite-scrolling)
- [Validation and Error Handling](#validation-and-error-handling)
- [Database Indexing and Performance](#database-indexing-and-performance)
- [Testing](#testing)
- [Security](#security)
- [Deployment](#deployment)
- [Screenshots](#screenshots)
- [Scalability Considerations](#scalability-considerations)
- [Known Limitations](#known-limitations)
- [Assessment Alignment](#assessment-alignment)
- [Contributing](#contributing)
- [License](#license)

## Features

### Product catalogue

- Relational PostgreSQL database with more than the required 500 products.
- Unique product IDs and SKUs.
- Product names, descriptions, brands, categories, prices, ratings, stock status, creation dates, and image URLs.
- Seed script with deterministic sample data and repeatable SKU-based upserts.
- Product detail endpoint.
- Responsive catalogue interface with product image fallbacks.

### Search and filtering

- Case-insensitive partial-text search across product name, description, brand, category, and SKU.
- Combined filters for category, brand, minimum price, maximum price, minimum rating, and stock availability.
- All selected filters are applied together using SQL `AND` conditions.
- Sorting by price ascending, price descending, rating descending, newest first, and name A–Z.
- Debounced search input.
- URL-persisted search criteria and sorting.
- Clearable search and filters.
- Loading, empty-result, error, and retry states.
- Protection against stale search responses using request cancellation and request-generation tracking.

### Pagination

- Server-side cursor-based pagination.
- Default batch size of 20 products, with a maximum of 100.
- Automatic loading of subsequent batches using `IntersectionObserver`.
- Stable ordering when multiple products share the same sort value.
- Cursor validation and sort consistency checks.
- No separate total-count query on each catalogue request.

## Architecture

The application uses a layered backend architecture and a client-side catalogue interface.

```text
                    React + TypeScript
                           |
                           v
                 Search / Filters / Sort
                           |
                           v
                 Product Search Hook
             Debounce / URL State / Abort
                           |
                           v
                    REST API Client
                           |
                           v
                 Express API (/api)
                           |
                           v
                   Zod Validation
                           |
                           v
                     Controller
                           |
                           v
                      Service
              Cursor / Response Handling
                           |
                           v
                        Model
            Parameterized PostgreSQL SQL
                           |
                           v
                     PostgreSQL
          Filters / Sorting / Indexes / Cursors
```

### Frontend

The React application is built with TypeScript and Vite. Search criteria and sorting are represented in the URL query string, allowing the current catalogue state to be preserved in the URL.

The product-search hook manages debounced search, request cancellation, loading and error states, and appending subsequent result batches. An `IntersectionObserver` detects when the user approaches the end of the product grid and triggers the next request.

### Backend

The Express API follows a Model–Controller–Service–Route structure:

- **Routes:** Define API endpoints and attach validation middleware.
- **Controllers:** Translate HTTP requests into service calls and HTTP responses.
- **Services:** Implement product-search orchestration and cursor-pagination behavior.
- **Models:** Build parameterized SQL queries, filters, sort expressions, and cursor predicates.
- **Schemas:** Validate and constrain request parameters using Zod.
- **Middleware:** Handle request validation, unknown routes, and application errors.

### Database

PostgreSQL performs the search, filtering, sorting, and pagination. The API retrieves at most `limit + 1` rows to determine whether another batch exists.

Product IDs are serialized as strings to avoid JavaScript precision loss for PostgreSQL `BIGINT` values. PostgreSQL `NUMERIC` fields are converted to JSON numbers in the application response.

## Project Structure

```text
smart-product-catalogue/
├── client/
│   ├── public/
│   │   └── _redirects
│   ├── src/
│   │   ├── components/
│   │   │   ├── filters/
│   │   │   │   └── ProductFilters.tsx
│   │   │   ├── products/
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   └── ProductGrid.tsx
│   │   │   ├── Navbar.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   └── SortSelect.tsx
│   │   ├── hooks/
│   │   │   └── useProductSearch.ts
│   │   ├── lib/
│   │   │   └── api.ts
│   │   ├── pages/
│   │   │   ├── ApiDocsPage.tsx
│   │   │   └── CataloguePage.tsx
│   │   ├── test/
│   │   ├── types/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
├── server/
│   ├── database/
│   │   ├── schema.sql
│   │   ├── apply-schema.ts
│   │   ├── seed.ts
│   │   ├── verify-product-count.ts
│   │   ├── verify-indexes.ts
│   │   └── verify-query-plans.ts
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── db/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/
│   │   ├── fixtures.ts
│   │   ├── global-setup.ts
│   │   ├── products.test.ts
│   │   └── validation.test.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

## Prerequisites

Install the following before starting:

- Node.js 20 or later.
- npm 10 or later.
- Docker Desktop with Docker Compose.
- Git.

The local PostgreSQL instances run through Docker Compose; a separate local PostgreSQL installation is not required.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/thvvamshi/smart-product-catalogue.git
cd smart-product-catalogue
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the local databases

```bash
docker compose up -d postgres postgres-test
```

The development and test databases run separately to prevent automated tests from affecting development data.

### 4. Configure the backend

On Windows PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

On macOS or Linux:

```bash
cp server/.env.example server/.env
```

Review the local database credentials in `server/.env`. They must match the credentials configured in `docker-compose.yml`.

### 5. Initialize and seed the database

Run these commands from the repository root:

```bash
npm run db:schema -w server
npm run db:seed -w server
npm run db:verify-count -w server
```

The schema command creates the required database structures and indexes. The seed command inserts or updates the deterministic sample products. The verification command checks that the catalogue meets the minimum 500-product requirement.

### 6. Start the application

```bash
npm run dev
```

Local endpoints:

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API base URL | http://localhost:4000/api |
| API health | http://localhost:4000/api/health |
| Database health | http://localhost:4000/api/health/db |
| API documentation page | http://localhost:5173/docs |

## Environment Variables

### Backend — `server/.env`

| Variable | Description | Local example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP server port | `4000` |
| `DATABASE_URL` | PostgreSQL connection string | Local development database URL |
| `CLIENT_URL` | Allowed frontend origin(s) for CORS | `http://localhost:5173` |
| `TEST_DATABASE_URL` | Dedicated integration-test database | Local test database URL |

Example configuration is provided in `server/.env.example`. Use the actual database credentials configured for your environment.

### Frontend — `client/.env`

| Variable | Description | Local example |
|---|---|---|
| `VITE_API_URL` | Public API base URL, including `/api` | Empty to use the Vite development proxy |

Example configuration is provided in `client/.env.example`.

**Security note:** Vite exposes `VITE_*` variables to browser code. Never put database URLs, passwords, API keys, or other secrets in frontend environment variables.

The real `.env` files are ignored by Git. Only safe example files should be committed.

## Database Design and Seed Data

### Product fields

Each product contains the following information:

| Field | Purpose |
|---|---|
| `id` | Unique database identifier |
| `sku` | Unique product stock-keeping unit |
| `name` | Product name |
| `description` | Product description |
| `brand` | Brand name |
| `category` | Product category |
| `price` | Non-negative product price |
| `rating` | Product rating between 0 and 5 |
| `in_stock` | Stock availability |
| `created_at` | Product creation timestamp |
| `image_url` | Product image or placeholder URL |

### Schema and constraints

The schema is defined in `server/database/schema.sql`.

It uses PostgreSQL constraints to enforce unique SKUs, valid price and rating ranges, and required fields. Database indexes support filtering, sorting, and partial-text search.

### Seed script

The seed implementation is in `server/database/seed.ts`.

It creates **1,004 deterministic sample products**, exceeding the assessment requirement of at least 500. It uses SKU-based upserts so that rerunning the seed updates the intended sample records without truncating unrelated records.

The seed data also includes search fixtures for special characters such as `%`, `_`, and backslashes, helping verify literal search behavior.

Verify the count at any time:

```bash
npm run db:verify-count -w server
```

The verification command is read-only. Schema and seed operations do not run automatically during production deployment; this avoids unintended database changes during application startup.

## Search Implementation

### Keyword search

The API searches across five product fields:

- `name`
- `description`
- `brand`
- `category`
- `sku`

Search is case-insensitive and supports partial-text matching through PostgreSQL `ILIKE`.

User-provided wildcard characters are escaped so that `%` and `_` are treated literally rather than being allowed to expand the search unexpectedly. Backslashes are escaped consistently with the SQL `ESCAPE` clause.

### Combined filters

Every supplied filter is combined with the others using `AND` logic.

For example:

```http
GET /api/products?brand=NovaTech&category=Electronics&minPrice=10&maxPrice=200&minRating=4&inStock=true
```

The result must satisfy every specified condition. Filtering occurs in PostgreSQL rather than by downloading the full catalogue to the frontend.

### Sorting

The API supports these sort values:

| Value | Ordering |
|---|---|
| `price_asc` | Lowest price first |
| `price_desc` | Highest price first |
| `rating_desc` | Highest rating first |
| `newest` | Newest products first |
| `name_asc` | Product name A–Z |

Each ordering includes a unique product ID as a tie-breaker, making the ordering deterministic when products share the same price, rating, timestamp, or name.

Sort expressions are selected from a server-side allowlist; arbitrary user input is never inserted into the SQL `ORDER BY` clause.

## API Documentation

All API responses use JSON. The API base path is `/api`.

### Health endpoints

#### `GET /api/health`

Checks whether the API is responding.

Example response:

```json
{
  "status": "ok"
}
```

#### `GET /api/health/db`

Checks whether the API can query PostgreSQL.

Example response:

```json
{
  "status": "ok",
  "database": "connected"
}
```

### Search products

#### `GET /api/products`

Returns a filtered, sorted batch of products.

#### Query parameters

| Parameter | Type | Description |
|---|---|---|
| `q` | String | Partial, case-insensitive keyword search |
| `category` | String | Exact category filter |
| `brand` | String | Exact brand filter |
| `minPrice` | Number | Minimum price, inclusive |
| `maxPrice` | Number | Maximum price, inclusive |
| `minRating` | Number | Minimum rating, inclusive |
| `inStock` | Boolean string | `true` or `false` |
| `sort` | Enum | One of the five supported sort values |
| `limit` | Integer | Batch size; defaults to 20, maximum 100 |
| `cursor` | String | Opaque cursor returned by the preceding response |

Unknown parameters and invalid values are rejected by request validation.

#### Example request

```bash
curl "http://localhost:4000/api/products?q=wireless&category=Electronics&minRating=4&inStock=true&sort=rating_desc&limit=20"
```

#### Example response

The following illustrates the response structure; product values and cursor contents depend on the actual database results.

```json
{
  "data": [
    {
      "id": "1004",
      "sku": "FIX-ALPHA-100",
      "name": "Wireless Headphones",
      "description": "Example product description",
      "brand": "NovaTech",
      "category": "Electronics",
      "price": 79.99,
      "rating": 4.5,
      "inStock": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "imageUrl": "https://placehold.co/600x400"
    }
  ],
  "pagination": {
    "limit": 20,
    "nextCursor": "<opaque-cursor-or-null>",
    "hasNextPage": true
  }
}
```

The example product and cursor are illustrative, not a guarantee that this exact product will appear for that query.

### Get a product by ID

#### `GET /api/products/:id`

Example:

```bash
curl "http://localhost:4000/api/products/1004"
```

A successful response contains a `data` object with the product. Invalid identifiers return a validation error; a valid identifier that does not exist returns `404 Not Found`.

### Error response format

Errors use a consistent structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": []
  }
}
```

The `details` array contains validation details when applicable.

Common status codes:

| Status | Meaning |
|---|---|
| `200` | Successful request |
| `400` | Invalid query parameters or cursor |
| `404` | Unknown route or product not found |
| `500` | Unexpected server error |

Internal database details and sensitive error information are not returned to clients.

## Pagination and Infinite Scrolling

The application uses **keyset (cursor-based) pagination** instead of increasingly large SQL `OFFSET` values.

### How it works

1. The frontend requests the first batch without a cursor.
2. The server applies search criteria, filters, sorting, and a page limit in SQL.
3. The server fetches up to `limit + 1` rows to determine whether another batch exists.
4. The response includes `nextCursor` and `hasNextPage`.
5. When the user approaches the end of the product grid, `IntersectionObserver` triggers the next request.
6. The frontend appends the new products and continues until no further results remain.

The cursor encodes the selected sort, the last product's sort-key value, and its unique ID. The API validates the cursor and checks that it matches the selected sort.

### Why keyset pagination?

- Avoids scanning and discarding large numbers of preceding rows as offsets increase.
- Maintains deterministic ordering with unique tie-breakers.
- Preserves the search and filter criteria across subsequent requests.
- Avoids a separate exact-count query on every request.

The API intentionally does not return a total product count or page number. The frontend should distinguish products loaded so far from the total number of matching products.

## Validation and Error Handling

Zod schemas validate query parameters before the product-search logic runs.

Validation includes:

- Positive integer limits within the supported range.
- Non-negative decimal prices.
- Rating values within the valid range.
- Boolean stock values.
- Supported sort values.
- Maximum keyword length.
- Valid cursor format and cursor-sort consistency.
- Minimum-price and maximum-price consistency.
- Rejection of unknown query parameters.

The backend uses centralized error-handling middleware and a not-found handler. Unexpected database failures are logged server-side and converted into safe client-facing responses.

## Database Indexing and Performance

The database schema uses B-tree indexes for common filters and ordering operations, along with PostgreSQL trigram indexes for partial-text search.

### Index strategy

| Index type | Purpose |
|---|---|
| Primary key | Unique product ID lookup |
| Unique SKU index | SKU uniqueness and lookup |
| B-tree category index | Category filtering |
| B-tree brand index | Brand filtering |
| B-tree price index | Price filtering |
| Composite price/ID index | Stable price sorting and cursor traversal |
| Rating/ID index | Rating ordering support |
| Rating keyset index | Rating-descending cursor traversal |
| Creation-time/ID index | Newest-first ordering |
| Name/ID index | Name sorting and cursor traversal |
| GIN trigram indexes | Partial-text search across name, description, brand, category, and SKU |

The schema enables the `pg_trgm` extension for trigram indexing.

### Query-plan verification

The repository includes scripts to verify indexes and inspect query plans:

```bash
npm exec -w server -- tsx database/verify-indexes.ts
npm exec -w server -- tsx database/verify-query-plans.ts
```

Query plans should be evaluated with representative data and actual filter combinations. PostgreSQL may prefer a sequential scan for a small dataset or a low-selectivity search; an index existing in the schema does not guarantee that every query will use it.

Example query-plan inspection:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM products
WHERE name ILIKE '%wireless%' ESCAPE '\'
   OR description ILIKE '%wireless%' ESCAPE '\'
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Execution times depend on database size, hardware, cache state, and query selectivity. Local timings should not be treated as production performance guarantees.

## Testing

The project uses Vitest for automated tests, Supertest for API-level testing, and React Testing Library for frontend behavior.

Run the complete suite:

```bash
npm test
```

Run the server tests:

```bash
npm run test:server
```

Run the client tests:

```bash
npm run test:client
```

Run TypeScript checks:

```bash
npm run typecheck
```

Build both applications:

```bash
npm run build
```

### Test coverage

The automated tests cover important API validation, product-search behavior, and frontend catalogue interactions, including:

- Product search and filtering behavior.
- Request validation and invalid parameters.
- Product API error handling.
- Catalogue rendering and UI behavior.
- API documentation page behavior.
- Frontend loading and result states.

Additional manual verification has covered case-insensitive and partial searches, combined filters, all five sort options, invalid cursors, invalid product IDs, pagination across the seeded dataset, and duplicate-free traversal for each supported sort.

**Latest recorded verification:** 56 automated tests passed (42 server tests and 14 client tests); typechecking and production builds also passed. Rerun the commands above after any code changes to confirm the current result.

### Test database safety

Integration tests use `TEST_DATABASE_URL` and require a dedicated test database whose name contains `test`. The test setup can truncate tables in that database.

Never point `TEST_DATABASE_URL` at a development or production database.

## Security

The application includes the following safeguards:

- Parameterized SQL values to prevent SQL injection.
- Allowlisted sorting expressions.
- Escaped search wildcards.
- Strict request validation.
- Helmet security headers.
- Explicit CORS origins.
- A small JSON request-body limit.
- Centralized error handling with safe client-facing messages.
- Server-side database credentials.
- Production TLS configuration for the managed PostgreSQL connection.

Before a public production launch, consider adding rate limiting, request IDs, structured secret-redacted logging, monitoring, and a backup/restore procedure.

## Deployment

The planned production setup uses Neon PostgreSQL, Render for the backend API, and a Render Static Site for the frontend.

### 1. Create the production database

Create a PostgreSQL project in Neon and obtain its connection string. Use a pooled connection string for the application when appropriate for your workload and provider configuration.

Keep the connection string private.

### 2. Apply the database schema

Review the target database and confirm that it is the intended production database before running schema or seed scripts.

Configure the backend environment with the production `DATABASE_URL`, then apply the schema:

```bash
npm run db:schema -w server
```

If sample data is required in production, run the seed script explicitly after verifying the target:

```bash
npm run db:seed -w server
npm run db:verify-count -w server
```

The application does not automatically seed the production database on startup.

### 3. Deploy the backend to Render

Create a Render Web Service connected to the GitHub repository.

Configure:

| Setting | Value |
|---|---|
| Root directory | Repository root |
| Build command | `npm ci && npm run build -w server` |
| Start command | `npm start -w server` |
| Health check path | `/api/health` |

The repository uses a root-level npm workspace lockfile, so install dependencies from the repository root rather than setting `server` as the service root directory.

Set the following environment variables in Render:

- `NODE_ENV=production`
- `DATABASE_URL` — production PostgreSQL connection string
- `CLIENT_URL` — exact deployed frontend origin
- `PORT` — supplied by Render

Do not add database credentials to source files.

### 4. Deploy the frontend to Render

Create a Render Static Site using the same repository.

Configure:

| Setting | Value |
|---|---|
| Root directory | Repository root |
| Build command | `npm ci && npm run build -w client` |
| Publish directory | `client/dist` |

As with the backend, install dependencies from the repository root so npm can use the workspace lockfile.

Set the frontend environment variable:

```text
VITE_API_URL=https://YOUR-API.onrender.com/api
```

Replace the example host with the actual backend URL. The frontend's `_redirects` file provides the configured single-page application fallback.

### 5. Verify the deployment

After deployment:

- Check `/api/health` on the backend.
- Check `/api/health/db` to verify database connectivity.
- Load the frontend and open the API documentation page.
- Test keyword search and combined filters.
- Verify all sort options.
- Scroll through multiple cursor batches.
- Confirm that direct page refreshes work.
- Check browser console and network requests for CORS or API errors.

Update the backend's `CLIENT_URL` to the exact frontend origin and redeploy if needed.

### Deployment status

- **GitHub:** [smart-product-catalogue](https://github.com/thvvamshi/smart-product-catalogue)
- **Frontend:** Not yet deployed
- **Backend API:** Not yet deployed
- **Database:** Production deployment pending

Replace the deployment placeholders with the actual public URLs after successful deployment.

Free-tier hosting limits, cold starts, database capacity, and provider terms can change. Confirm current provider limits before submission.

## Screenshots

Add screenshots of the working application after completing local or production verification.

Recommended screenshots:

1. Product catalogue with the search bar and product cards.
2. Search results with multiple filters applied.
3. Sorting and infinite scrolling.
4. Empty-result state.
5. Responsive mobile layout.
6. API documentation page.

For example, place screenshots in a `docs/screenshots/` directory and reference them here:

```markdown
![Product catalogue](docs/screenshots/catalogue.png)
![Combined filters](docs/screenshots/combined-filters.png)
![Mobile catalogue](docs/screenshots/mobile-catalogue.png)
```

Only include images that actually exist in the repository.

## Scalability Considerations

The current design supports a small-to-medium catalogue while keeping search and filtering inside PostgreSQL. For a catalogue with 100,000 or more products, the following improvements should be evaluated using real workload measurements:

- Analyze query plans for common and worst-case filter combinations.
- Refresh database statistics and tune indexes based on observed query patterns.
- Evaluate composite indexes for frequent combinations of filters and sort order.
- Benchmark trigram search across all five searchable fields.
- Consider PostgreSQL full-text search with a weighted `tsvector` or a dedicated search service if relevance ranking, typo tolerance, or search throughput becomes a requirement.
- Introduce list virtualization if long infinite-scroll sessions render too many DOM elements.
- Move static brand and category facets to database-backed metadata endpoints if the catalogue taxonomy changes frequently.
- Add connection-pool monitoring, request tracing, rate limiting, and database observability.
- Establish backup, restore, and migration procedures for production.

These are potential improvements rather than claims about features already implemented.

## Known Limitations

- Product images use remote placeholder URLs for sample data.
- Brand and category facets are currently static in the frontend.
- Typo-tolerant search, autocomplete, and matching-term highlighting are not implemented.
- The five-field partial-text search is intentionally straightforward; larger catalogues may require a dedicated search strategy.
- Infinite scrolling keeps loaded products in browser memory for the current search criteria.
- Exact total-result counts are intentionally omitted from the search API.
- Production deployment and live URLs must be added after the hosted application has been verified.

## Assessment Alignment

This project addresses the main requirements of the Getto India assessment:

- [x] React and Node.js/Express application.
- [x] Relational SQL database.
- [x] More than 500 seeded products.
- [x] Partial and case-insensitive search across five fields.
- [x] Combined product filters.
- [x] Five supported sorting modes.
- [x] Server-side cursor pagination.
- [x] Debounced search and protection against stale responses.
- [x] Request validation and parameterized SQL.
- [x] Database indexes and query-plan inspection scripts.
- [x] Automated backend and frontend tests.
- [ ] Production deployment URLs.
- [ ] Final application screenshots or demo recording.

## Contributing

Contributions that improve usability, reliability, accessibility, or documentation are welcome. For a proposed change:

1. Open an issue to discuss larger changes before starting work.
2. Keep pull requests focused and include tests or documentation updates where relevant.
3. Run the checks that apply to your change before submitting:

  ```bash
  npm test
  npm run typecheck
  npm run build
  ```

For local setup, see [Getting Started](#getting-started). Please do not include credentials, `.env` files, or other secrets in issues or pull requests.

## License

No license has been specified yet. Until a license is added, the project is not explicitly offered for reuse or distribution. Add a license file and update this section to make the intended terms clear.
