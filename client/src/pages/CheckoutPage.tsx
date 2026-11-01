import { Link } from "react-router-dom";
import { AddressSelector } from "../components/checkout/AddressSelector";
import { useLocationSelection } from "../context/LocationContext";
import { useCheckout } from "../hooks/useCheckout";
export function CheckoutPage() {
  const { location } = useLocationSelection();
  const checkout = useCheckout();
  const overallEtaFresh = checkout.validation?.eta
    ? Date.parse(checkout.validation.eta.validUntil) > Date.now()
    : false;
  return (
    <main className="commerce-page">
      <header className="commerce-hero">
        <p className="eyebrow">Secure checkout</p>
        <h1>Review and place your order</h1>
        <p>We confirm stock across every selected store when you place your order.</p>
      </header>
      <AddressSelector
        addresses={checkout.addresses}
        value={checkout.addressId}
        location={location}
        onChange={checkout.setAddressId}
        onCreated={checkout.refreshAddresses}
      />
      {checkout.error ? <p role="alert">{checkout.error}</p> : null}
      <button
        className="primary-action checkout-action"
        disabled={!checkout.addressId || checkout.loading}
        onClick={() => void checkout.validate()}
      >
        {checkout.loading ? "Checking…" : "Validate cart"}
      </button>
      {checkout.validation ? (
        <section className="checkout-validation">
          <h2>
            {checkout.validation.valid
              ? "Ready to place your order"
              : "Cart needs attention"}
          </h2>
          {checkout.validation.issues.length ? (
            <ul className="inventory-issues">
              {checkout.validation.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  <strong>{issue.code.replaceAll("_", " ")}</strong>{" "}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          {checkout.validation.groups.map((group) => (
            <section className="checkout-group" key={group.store.id}>
              <header>
                <h3>{group.store.name}</h3>
                <span>
                  {group.store.distanceKm} km ·{" "}
                  {group.store.serviceable ? "Serviceable" : "Not serviceable"}
                </span>
              </header>
              {group.eta && group.store.serviceable && Date.parse(group.eta.validUntil) > Date.now() ? (
                <p className="checkout-eta" aria-label={`Estimated delivery for ${group.store.name}`}>
                  Estimated delivery: {group.eta.minEtaMinutes}–{group.eta.maxEtaMinutes} min · provisional distance estimate
                </p>
              ) : null}
              {group.items.map((item) => (
                <p key={item.itemId}>
                  {item.name} — {item.color} {item.size} × {item.quantity}{" "}
                  <strong>₹{item.lineSubtotal}</strong>
                </p>
              ))}
              <strong>Store subtotal ₹{group.subtotal}</strong>
            </section>
          ))}
          <div className="checkout-total">
            <span>Delivery fee: Not charged in this demo</span>
            <strong>Total ₹{checkout.validation.total}</strong>
            {checkout.validation.eta && overallEtaFresh ? (
              <span aria-label="Overall estimated delivery">
                Overall ETA: {checkout.validation.eta.minEtaMinutes}–{checkout.validation.eta.maxEtaMinutes} min
              </span>
            ) : checkout.validation.eta ? <span role="status">ETA expired — refreshing estimate…</span> : null}
          </div>
          {checkout.validation.valid ? (
            !checkout.order ? <button className="primary-action" disabled={checkout.loading} onClick={() => void checkout.placeOrder()}>
              {checkout.loading ? "Placing order…" : "Place order"}
            </button> : <section className="reservation-confirmation" role="status"><h2>Your order has been placed.</h2><p>Order <Link to={`/orders/${checkout.order.id}`}>{checkout.order.orderNumber}</Link> is waiting for store confirmation.</p><Link className="primary-action" to={`/orders/${checkout.order.id}`}>Track order</Link> <Link to="/discover">Continue shopping</Link></section>
          ) : (
            <Link to="/cart">Correct cart</Link>
          )}
        </section>
      ) : null}
    </main>
  );
}
