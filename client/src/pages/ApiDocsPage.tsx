import { useId, useState } from "react";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || `${window.location.origin}/api`
).replace(/\/$/, "");

const queryParameters = [
  [
    "q",
    "string",
    "Empty",
    "Case-insensitive partial search across name, description, brand, category, and SKU.",
  ],
  ["category", "string", "—", "Exact category match."],
  ["brand", "string", "—", "Exact brand match."],
  ["minPrice", "decimal ≥ 0", "—", "Inclusive minimum price."],
  ["maxPrice", "decimal ≥ 0", "—", "Inclusive maximum price."],
  ["minRating", "decimal 0–5", "—", "Inclusive minimum rating."],
  [
    "inStock",
    "boolean",
    "—",
    "Use true for in-stock or false for out-of-stock products.",
  ],
  [
    "sort",
    "enum",
    "newest",
    "price_asc, price_desc, rating_desc, newest, or name_asc.",
  ],
  [
    "cursor",
    "opaque string",
    "—",
    "Position returned by the previous response. Omit for the first page.",
  ],
  ["limit", "integer 1–100", "20", "Products returned per page."],
] as const;

const requestExample = `API_BASE_URL="${API_BASE_URL}"

curl -G "$API_BASE_URL/products" \\
  --data-urlencode "q=wireless" \\
  --data-urlencode "category=Electronics" \\
  --data-urlencode "minRating=4" \\
  --data-urlencode "sort=rating_desc" \\
  --data-urlencode "limit=20"`;

const followUpRequestExample = `curl -G "$API_BASE_URL/products" \\
  --data-urlencode "q=wireless" \\
  --data-urlencode "category=Electronics" \\
  --data-urlencode "minRating=4" \\
  --data-urlencode "sort=rating_desc" \\
  --data-urlencode "limit=20" \\
  --data-urlencode "cursor=NEXT_CURSOR_FROM_RESPONSE"`;

const successResponse = `{
  "data": [
    {
      "id": "42",
      "sku": "SKU-00042",
      "name": "Wireless Headphones",
      "description": "Wireless over-ear headphones",
      "brand": "NovaTech",
      "category": "Electronics",
      "price": 1299,
      "rating": 4.7,
      "inStock": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "imageUrl": null
    }
  ],
  "pagination": {
    "limit": 20,
    "nextCursor": "eyJ2ZXJzaW9uIjoxLCJzb3J0IjoicmF0aW5nX2Rlc2MiLCJrZXkiOiI0LjciLCJpZCI6IjQyIn0",
    "hasNextPage": true
  }
}`;

const emptyResponse = `{
  "data": [],
  "pagination": {
    "limit": 20,
    "nextCursor": null,
    "hasNextPage": false
  }
}`;

const validationError = `{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "path": "minPrice",
        "message": "minPrice must be less than or equal to maxPrice"
      }
    ]
  }
}`;

type CopyState = "idle" | "copied" | "failed";

function CodeBlock({
  code,
  language,
  label,
}: {
  code: string;
  language: string;
  label: string;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const statusId = useId();

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const buttonText =
    copyState === "copied"
      ? "Copied!"
      : copyState === "failed"
        ? "Copy failed"
        : "Copy";

  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language}</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy ${label}`}
          aria-describedby={statusId}
        >
          {buttonText}
        </button>
      </div>
      <pre tabIndex={0} aria-label={label}>
        <code>{code}</code>
      </pre>
      <span id={statusId} className="sr-only" role="status" aria-live="polite">
        {copyState === "copied"
          ? `${label} copied to clipboard`
          : copyState === "failed"
            ? `Could not copy ${label}`
            : ""}
      </span>
    </div>
  );
}

function Endpoint({ method, path }: { method: string; path: string }) {
  return (
    <div className="endpoint">
      <span>{method}</span>
      <code>{path}</code>
    </div>
  );
}

export function ApiDocsPage() {
  return (
    <main className="docs page">
      <header className="docs-hero">
        <p className="kicker">REST API</p>
        <h1>API Documentation</h1>
        <p>
          The Smart Catalogue exposes a read-only REST API for searching
          products and retrieving product details.
        </p>
      </header>

      <section aria-labelledby="overview">
        <h2 id="overview">Overview and base URL</h2>
        <p>
          All endpoints return JSON. The base URL is environment-configurable
          and is currently:
        </p>
        <div className="base-url">
          <code>{API_BASE_URL}</code>
        </div>
      </section>

      <section aria-labelledby="search-endpoint">
        <h2 id="search-endpoint">Product search endpoint</h2>
        <Endpoint method="GET" path="/products" />
        <p>
          Search and filter the catalogue with server-side sorting and
          cursor-based infinite loading. Every supplied filter is combined with{" "}
          <strong>AND</strong>. Search is case-insensitive and partial; category
          and brand are exact matches. Search wildcard characters are treated
          literally.
        </p>
      </section>

      <section aria-labelledby="parameters">
        <h2 id="parameters">Query parameter reference</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col">Type</th>
                <th scope="col">Default</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {queryParameters.map(
                ([parameter, type, defaultValue, description]) => (
                  <tr key={parameter}>
                    <th scope="row">
                      <code>{parameter}</code>
                    </th>
                    <td>{type}</td>
                    <td>{defaultValue}</td>
                    <td>{description}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="sorting">
        <h2 id="sorting">Sorting and infinite loading</h2>
        <p>
          Supported sort values are <code>price_asc</code>,{" "}
          <code>price_desc</code>, <code>rating_desc</code>, <code>newest</code>
          , and <code>name_asc</code>. The API returns 20 products per
          request by default and accepts at most 100. The initial request omits
          <code>cursor</code>. When <code>hasNextPage</code> is true, send the
          returned <code>nextCursor</code> as the next request&apos;s <code>cursor</code>
          and append that response&apos;s products. Stop when <code>hasNextPage</code>
          is false and <code>nextCursor</code> is null.
          Cursors are opaque and tied to the selected sort. Each keyset query
          uses the active sort key plus the unique product ID, so equal values
          remain deterministic without <code>OFFSET</code>. Exact totals are
          omitted so each page does not require a separate full count query.
        </p>
      </section>

      <section aria-labelledby="example-request">
        <h2 id="example-request">Example request</h2>
        <CodeBlock
          language="bash"
          label="example product search request"
          code={requestExample}
        />
        <h3>Follow-up request</h3>
        <p>Replace the placeholder with the exact opaque cursor returned by the preceding response and keep every filter and sort value unchanged.</p>
        <CodeBlock
          language="bash"
          label="follow-up product search request"
          code={followUpRequestExample}
        />
      </section>
      <section aria-labelledby="success-response">
        <h2 id="success-response">Success response</h2>
        <p>
          Product IDs are strings to preserve PostgreSQL <code>BIGINT</code>{" "}
          precision. Prices and ratings are JSON numbers.
        </p>
        <CodeBlock
          language="json"
          label="successful product search response"
          code={successResponse}
        />
      </section>
      <section aria-labelledby="empty-response">
        <h2 id="empty-response">Empty response</h2>
        <p>
          No matches return HTTP 200 with an empty array and no next cursor.
        </p>
        <CodeBlock
          language="json"
          label="empty product search response"
          code={emptyResponse}
        />
      </section>
      <section aria-labelledby="validation-error">
        <h2 id="validation-error">Validation error</h2>
        <p>
          Malformed parameters and invalid ranges return HTTP 400 with
          field-level details.
        </p>
        <CodeBlock
          language="json"
          label="validation error response"
          code={validationError}
        />
      </section>

      <section aria-labelledby="product-details">
        <h2 id="product-details">Product details endpoint</h2>
        <Endpoint method="GET" path="/products/:id" />
        <p>
          Returns <code>{'{ "data": product }'}</code> for a positive integer
          ID. An unknown product returns a 404 <code>NOT_FOUND</code> error.
        </p>
        <CodeBlock
          language="bash"
          label="product details request"
          code={`curl "${API_BASE_URL}/products/42"`}
        />
      </section>

      <section aria-labelledby="health">
        <h2 id="health">Health endpoints</h2>
        <div className="endpoint-list">
          <Endpoint method="GET" path="/health" />
          <p>Checks that the API process is responding.</p>
          <Endpoint method="GET" path="/health/db" />
          <p>Checks the API and PostgreSQL connection.</p>
        </div>
      </section>

      <section aria-labelledby="catalogue-data">
        <h2 id="catalogue-data">Catalogue data</h2>
        <p>
          The assessment requires at least 500 products. The deterministic local
          seed targets 1,004 products and upserts by SKU, preserving unrelated
          records. Schema and seed operations are never run automatically in production.
        </p>
        <CodeBlock
          language="bash"
          label="database seed commands"
          code={`npm run db:schema -w server\nnpm run db:seed -w server\nnpm run db:verify-count -w server`}
        />
      </section>

      <section aria-labelledby="statuses">
        <h2 id="statuses">HTTP status codes</h2>
        <dl className="status-list">
          <div>
            <dt>200</dt>
            <dd>Successful request, including an empty search.</dd>
          </div>
          <div>
            <dt>400</dt>
            <dd>Invalid query parameters or product ID.</dd>
          </div>
          <div>
            <dt>404</dt>
            <dd>Product or route not found.</dd>
          </div>
          <div>
            <dt>500</dt>
            <dd>
              Unexpected server or database failure, returned without internal
              details.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
