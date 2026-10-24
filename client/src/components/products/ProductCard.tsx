import type { Product } from "../../types/product";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <div className="image-wrap">
        <img
          src={product.imageUrl || "https://placehold.co/600x400?text=Product"}
          alt=""
          loading="lazy"
        />
      </div>
      <div className="card-body">
        <div className="eyebrow">
          {product.category} · {product.brand}
        </div>
        <h3>{product.name}</h3>
        <p className="description">{product.description}</p>
        <div className="card-meta">
          <strong>
            ₹
            {product.price.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
            })}
          </strong>
          <span aria-label={`${product.rating} out of 5 stars`}>
            ★ {product.rating.toFixed(1)}
          </span>
        </div>
        <div className="card-footer">
          <code>{product.sku}</code>
          <span className={product.inStock ? "stock in" : "stock out"}>
            {product.inStock ? "In stock" : "Out of stock"}
          </span>
        </div>
      </div>
    </article>
  );
}
