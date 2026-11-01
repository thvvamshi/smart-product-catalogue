import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cancelOrder, fetchOrderDeliveries } from "../lib/api";
import { useOrder } from "../hooks/useOrders";
import { useDeliveryRealtime } from "../hooks/useDeliveryRealtime";
type TrackingTask = { id: string; taskNumber: string; storeOrderId: string; status: string; storeName?: string; failureReason?: string | null; capturedAt?: string | null; receivedAt?: string | null; locationFresh?: boolean; latitude?: number | null; longitude?: number | null; accuracyMeters?: number | null };

const storeLabels: Record<string, string> = { pending_acceptance: "Waiting for store confirmation", accepted: "Store accepted", preparing: "Preparing your order", ready_for_pickup: "Ready for pickup", delivered: "Delivered", rejected: "Store could not fulfil this item", cancelled: "Cancelled" };
const deliveryLabels: Record<string, string> = { pending_assignment: "Waiting for a delivery partner", assigned: "Delivery partner assigned", heading_to_store: "Delivery partner heading to store", arrived_at_store: "Delivery partner at store", picked_up: "Order picked up", out_for_delivery: "Out for delivery", delivered: "Delivered", delivery_failed: "Delivery could not be completed", cancelled: "Cancelled" };
const orderLabels: Record<string, string> = { placed: "Order placed", partially_accepted: "Some stores confirmed", confirmed: "Stores confirmed", partially_rejected: "Partially fulfilled", rejected: "Could not be fulfilled", cancelled: "Cancelled", completed: "Delivered" };
const steps = ["pending_acceptance", "accepted", "preparing", "ready_for_pickup", "delivered"];

function StoreTimeline({ status }: { status: string }) {
  if (status === "rejected" || status === "cancelled") return <p className="order-state" role="alert">{storeLabels[status] ?? status}</p>;
  const current = Math.max(0, steps.indexOf(status));
  return <ol className="order-timeline">{steps.map((step, index) => <li className={index <= current ? "complete" : ""} key={step}>{storeLabels[step]}</li>)}</ol>;
}

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const { order, history, loading, error, refresh } = useOrder(orderId);
  const [deliveries, setDeliveries] = useState<TrackingTask[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const eventIds = useRef(new Set<string>());
  const refreshDeliveries = useCallback(() => { if (order) void fetchOrderDeliveries(order.id).then((result) => setDeliveries(result.data)).catch(() => setDeliveries([])); }, [order]);
  const handleEvent = useCallback((event: Record<string, unknown>) => { const eventId = String(event.eventId || ""); if (eventId && eventIds.current.has(eventId)) return; if (eventId) eventIds.current.add(eventId); void refresh(); refreshDeliveries(); }, [refresh, refreshDeliveries]);
  const connected = useDeliveryRealtime(order?.id || "", handleEvent);
  useEffect(() => { refreshDeliveries(); }, [refreshDeliveries]);
  useEffect(() => { if (connected || !order || ["completed", "cancelled", "rejected"].includes(order.status)) return; const timer = setInterval(() => { void refresh(); refreshDeliveries(); }, 15000); return () => clearInterval(timer); }, [connected, order, refresh, refreshDeliveries]);
  if (loading && !order) return <main className="commerce-page"><p role="status">Loading order…</p></main>;
  if (error || !order) return <main className="commerce-page"><p role="alert">{error || "Order not found"}</p><Link to="/orders">Back to orders</Link></main>;
  const onTheWay = deliveries.some((delivery) => ["picked_up", "out_for_delivery"].includes(delivery.status));
  const canCancel = !["completed", "cancelled", "rejected"].includes(order.status) && !deliveries.some((delivery) => ["picked_up", "out_for_delivery", "delivered"].includes(delivery.status)) && order.storeOrders.some((store) => ["pending_acceptance", "accepted", "preparing", "ready_for_pickup"].includes(store.status));
  const cancel = async () => { setCancelling(true); setCancelError(""); try { await cancelOrder(order.id); setConfirmCancel(false); await refresh(); refreshDeliveries(); } catch (reason) { setCancelError(reason instanceof Error ? reason.message : "Unable to cancel order"); } finally { setCancelling(false); } };
  return <main className="commerce-page">
    <header className={`commerce-hero ${onTheWay ? "delivery-on-way" : ""}`}><p className="eyebrow">Order tracking</p><h1>{onTheWay ? "Your order is on the way!" : order.orderNumber}</h1><p><strong>{onTheWay ? "Delivery partner has picked up your order." : orderLabels[order.status] ?? order.status.replaceAll("_", " ")}</strong> · Total ₹{order.total}</p>{order.eta ? <p className="checkout-eta">Estimated delivery: {order.eta.minEtaMinutes}–{order.eta.maxEtaMinutes} min</p> : <p>We’ll share a delivery estimate when one is available.</p>}</header>
    <section className="order-address"><h2>Delivery address</h2><p>{String(order.addressSnapshot.recipientName)} · {String(order.addressSnapshot.addressLine1)}, {String(order.addressSnapshot.city)}</p></section>
    <section aria-label="Order progress"><h2>Track your order</h2><p>Store confirmations and delivery updates appear here automatically.</p>{canCancel ? <button type="button" onClick={() => setConfirmCancel(true)}>Cancel order</button> : <small>{onTheWay ? "Your order is already on its way. Direct cancellation is no longer available." : null}</small>}{cancelError ? <p role="alert">{cancelError}</p> : null}</section>
    {order.storeOrders.map((store) => { const delivery = deliveries.find((item) => item.storeOrderId === store.id); return <section className="checkout-group" key={store.id}><header><h2>{store.storeName || `Store ${store.storeId}`}</h2><strong>{delivery ? deliveryLabels[delivery.status] ?? delivery.status.replaceAll("_", " ") : storeLabels[store.status] ?? store.status.replaceAll("_", " ")}</strong></header>{store.eta ? <p className="checkout-eta">Estimated delivery: {store.eta.minEtaMinutes}–{store.eta.maxEtaMinutes} min</p> : null}<StoreTimeline status={store.status}/>{delivery && ["picked_up", "out_for_delivery"].includes(delivery.status) ? <section className="live-tracking-area" aria-label={`Live delivery tracking for ${store.storeName ?? "store"}`}><h3>Your order is on the way!</h3>{delivery.locationFresh && delivery.latitude !== null && delivery.longitude !== null && delivery.latitude !== undefined && delivery.longitude !== undefined ? <><p>Live delivery-partner location is available.</p><p className="location-coordinate">Location: {delivery.latitude.toFixed(5)}, {delivery.longitude.toFixed(5)}</p><small>Last updated {delivery.receivedAt ? new Date(delivery.receivedAt).toLocaleTimeString() : "just now"}{delivery.accuracyMeters ? ` · accuracy ${Math.round(delivery.accuracyMeters)} m` : ""}</small></> : <p>Delivery partner location is not currently available.</p>}</section> : null}{delivery?.status === "delivery_failed" ? <p role="alert">Delivery could not be completed{delivery.failureReason ? `: ${delivery.failureReason}` : "."}</p> : null}{store.rejectionReasonCode ? <p role="alert">This store could not fulfil its items: {store.rejectionReasonCode.replaceAll("_", " ")}{store.rejectionNote ? ` — ${store.rejectionNote}` : ""}</p> : null}{store.items?.map((item) => <p key={item.id}>{item.productName} · {item.sku} × {item.quantity} · ₹{item.lineTotal}</p>)}</section>; })}
    <section><h2>Delivery updates</h2>{deliveries.length ? <ul>{deliveries.map((delivery) => <li key={delivery.id}>{delivery.storeName || "Store"}: {deliveryLabels[delivery.status] ?? delivery.status.replaceAll("_", " ")}</li>)}</ul> : <p>Waiting for store confirmation. Tracking will continue here before a delivery partner is assigned.</p>}</section>
    <section><h2>Order history</h2><ul>{history.map((item) => <li key={item.id}>{orderLabels[item.toStatus] ?? storeLabels[item.toStatus] ?? item.toStatus.replaceAll("_", " ")}{item.note ? ` — ${item.note}` : ""}</li>)}</ul></section>
    {confirmCancel ? <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Cancel this order"><section className="modal"><h2>Cancel this order?</h2><p>Are you sure you want to cancel your order? This action cannot be undone.</p><button type="button" onClick={() => setConfirmCancel(false)} disabled={cancelling}>Keep order</button><button type="button" className="primary-action" onClick={() => void cancel()} disabled={cancelling}>{cancelling ? "Cancelling…" : "Confirm cancellation"}</button></section></div> : null}
  </main>;
}
