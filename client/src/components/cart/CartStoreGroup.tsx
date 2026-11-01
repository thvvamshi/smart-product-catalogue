import type { Cart } from "../../types/commerce";
import type { EtaEstimate } from "../../types/commerce";
export function CartStoreGroup({
  group,
  onUpdate,
  onRemove,
  eta,
}: {
  group: Cart["groups"][number];
  onUpdate: (id: string, q: number) => void;
  onRemove: (id: string) => void;
  eta: EtaEstimate | null;
}) {
  return (
    <section className="cart-store">
      <header>
        <div>
          <p className="eyebrow">Fulfilled by</p>
          <h2>{group.store.name}</h2>
        </div>
        <strong>₹{group.subtotal}</strong>
      </header>
      {eta ? <p className="cart-store-eta">Estimated delivery: {eta.minEtaMinutes}–{eta.maxEtaMinutes} min</p> : null}
      {group.items.map((item) => (
        <article className="cart-item" key={item.id}>
          <div className="cart-thumb">
            {item.imageUrl ? <img src={item.imageUrl} alt="" /> : "Fashion"}
          </div>
          <div>
            <h3>{item.name}</h3>
            <p>
              {item.brand} · {item.sku}
            </p>
            <p>{[item.color, item.size].filter(Boolean).join(" · ")}</p>
            {!item.available ? (
              <p className="cart-warning">
                Requested quantity is currently unavailable.
              </p>
            ) : null}
            {item.priceChanged ? (
              <p className="cart-warning">
                Price changed from ₹{item.priceSnapshot} to ₹{item.currentPrice}.{" "}
                <button onClick={() => onUpdate(item.id, item.quantity)}>Accept current price</button>
              </p>
            ) : null}
          </div>
          <div className="cart-item-actions">
            <label>
              Quantity
              <select
                aria-label={`Quantity for ${item.name}`}
                value={item.quantity}
                onChange={(e) => onUpdate(item.id, Number(e.target.value))}
              >
                {Array.from(
                  { length: Math.min(10, Math.max(1, item.stockQuantity)) },
                  (_, i) => i + 1,
                ).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <strong>₹{item.lineSubtotal}</strong>
            <button onClick={() => onRemove(item.id)}>Remove</button>
          </div>
        </article>
      ))}
    </section>
  );
}
