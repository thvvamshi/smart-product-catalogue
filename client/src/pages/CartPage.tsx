import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartStoreGroup } from "../components/cart/CartStoreGroup";
import { useLocationSelection } from "../context/LocationContext";
import { useCart } from "../hooks/useCart";
import { fetchCartEta } from "../lib/api";
import type { CartEta } from "../types/commerce";
export function CartPage() {
  const { cart, loading, error, retry, update, remove, clear } = useCart();
  const { location } = useLocationSelection();
  const [delivery, setDelivery] = useState<CartEta | null>(null);
  useEffect(() => {
    if (!location || !cart?.itemCount) { setDelivery(null); return; }
    const controller = new AbortController();
    void fetchCartEta(location.latitude, location.longitude, controller.signal)
      .then((response) => setDelivery(response.data))
      .catch((reason) => { if (reason?.name !== "AbortError") setDelivery(null); });
    return () => controller.abort();
  }, [cart, location]);
  if (loading && !cart)
    return (
      <main className="commerce-page">
        <p role="status">Loading cart…</p>
      </main>
    );
  if (error && !cart)
    return (
      <main className="commerce-page">
        <div role="alert">
          {error}
          <button onClick={() => void retry()}>Retry</button>
        </div>
      </main>
    );
  if (!cart?.itemCount)
    return (
      <main className="commerce-page cart-empty">
        <h1>Your cart is empty</h1>
        <p>Add an exact size and colour from a nearby demo store.</p>
        <Link className="primary-link" to="/discover">
          Explore fashion
        </Link>
      </main>
    );
  return (
    <main className="commerce-page">
      <header className="commerce-hero">
        <p className="eyebrow">Multi-store cart</p>
        <h1>Your selected looks</h1>
        <p>
          Adding items does not reserve stock. Availability is checked at
          checkout.
        </p>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {cart.groups.map((group) => (
        <CartStoreGroup
          group={group}
          onUpdate={(id, q) => void update(id, q)}
          onRemove={(id) => void remove(id)}
          eta={delivery?.groups.find((eta) => eta.storeId === group.store.id)?.eta ?? null}
          key={group.store.id}
        />
      ))}
      <aside className="cart-summary">
        <span>
          {cart.itemCount} items from {cart.groups.length} stores
        </span>
        <strong>Subtotal ₹{cart.subtotal}</strong>
        {delivery?.eta ? <strong className="cart-eta">Overall estimated delivery: {delivery.eta.minEtaMinutes}–{delivery.eta.maxEtaMinutes} min</strong> : location ? <small>Delivery estimate is unavailable for the selected location.</small> : <small>Select your delivery location to see estimated delivery.</small>}
        {delivery?.groups.length && delivery.groups.length > 1 ? <small>Items from different stores may arrive separately.</small> : null}
        <small>Delivery fee is not defined in this phase.</small>
        <Link className="primary-link" to="/checkout">
          Continue to checkout
        </Link>
        <button onClick={() => { if (window.confirm("Remove all items from your cart?")) void clear(); }}>Clear cart</button>
      </aside>
    </main>
  );
}
