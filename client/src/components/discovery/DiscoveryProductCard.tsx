import { useState } from "react";
import { Link } from "react-router-dom";
import type { DiscoveryItem } from "../../types/discovery";
import { addCartItem, notifyCartChanged } from "../../lib/api";
export function DiscoveryProductCard({ item }: { item: DiscoveryItem }) {
  const [status, setStatus] = useState<"idle" | "adding" | "added" | "error">("idle");
  const [message, setMessage] = useState("");
  const unavailable = !item.fulfilment || !item.inventory || !item.inventory.inStock || item.inventory.availableQuantity < 1;
  const add = async () => {
    if (unavailable || status === "adding" || !item.fulfilment) return;
    setStatus("adding");
    setMessage("");
    try {
      await addCartItem(item.variant.id, item.fulfilment.storeId, 1);
      notifyCartChanged();
      setStatus("added");
      setMessage("Added to cart");
    } catch (reason) {
      setStatus("error");
      setMessage(reason instanceof Error ? reason.message : "Unable to add to cart");
    }
  };
  return (
    <article className="fashion-card">
      <Link to={`/fashion/${item.product.id}`}>
        <div className="fashion-image">
          {item.product.images[0] ? (
            <img src={item.product.images[0]} alt="" />
          ) : (
            <span>Fashion</span>
          )}
        </div>
        <p className="eyebrow">{item.product.brand}</p>
        <h3>{item.product.name}</h3>
      </Link>
      <p>
        {[item.variant.attributes.color, item.variant.attributes.size]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {item.inventory ? <strong>₹{item.inventory.price.toFixed(2)}</strong> : <strong>Catalogue item</strong>}
      <small>{item.fulfilment && item.inventory ? `${item.fulfilment.storeName} · ${item.fulfilment.distanceKm} km · ${item.inventory.availableQuantity} available` : "Select a delivery location for local availability"}</small>
      <p className="variant-summary" aria-label="Selected variant">
        {[item.variant.attributes.color, item.variant.attributes.size]
          .filter(Boolean)
          .join(" · ") || item.variant.sku}
      </p>
      <button
        type="button"
        className="primary-action add-cart"
        disabled={unavailable || status === "adding"}
        onClick={() => void add()}
        aria-label={unavailable ? `${item.product.name} is unavailable` : `Add ${item.product.name} to cart`}
      >
        {status === "adding" ? "Adding…" : unavailable ? "Unavailable" : status === "added" ? "Added" : "Add to cart"}
      </button>
      {message ? <p role={status === "error" ? "alert" : "status"}>{message} {status === "added" ? <Link to="/cart">Go to cart</Link> : null}</p> : null}
    </article>
  );
}
