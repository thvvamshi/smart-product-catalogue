import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOrders } from "../../lib/api";
import { connectOrderSocket } from "../../lib/realtime";
import type { OrderSummary } from "../../types/order";

const labels: Record<string, string> = { placed: "Your order is waiting for store confirmation.", partially_accepted: "Part of your order has been confirmed.", confirmed: "Your order is being prepared.", partially_rejected: "Your order is partially fulfilled.", assigned: "A delivery partner has been assigned.", heading_to_store: "Delivery partner is heading to the store.", arrived_at_store: "Delivery partner has arrived at the store.", picked_up: "Your order is on the way!", out_for_delivery: "Your order is on the way!" };
const terminal = new Set(["completed", "cancelled", "rejected"]);

export function ActiveOrderBanner() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const load = useCallback((signal?: AbortSignal) => void fetchOrders(new URLSearchParams({ limit: "5" }), signal).then((result) => setOrders(result.data.filter((order): order is OrderSummary => typeof order.id === "string" && typeof order.orderNumber === "string" && typeof order.status === "string" && !terminal.has(order.status)))).catch(() => setOrders([])), []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); const timer = window.setInterval(() => load(), 30000); return () => { controller.abort(); window.clearInterval(timer); }; }, [load]);
  useEffect(() => { const refresh = () => load(); window.addEventListener("order:created", refresh); return () => window.removeEventListener("order:created", refresh); }, [load]);
  useEffect(() => {
    const stops = orders.map((order) => connectOrderSocket(order.id, () => load(), () => undefined));
    return () => stops.forEach((stop) => stop());
  }, [orders, load]);
  if (!orders.length) return null;
  return <aside className="active-order-banner" aria-label="Active orders">{orders.map((order) => <Link to={`/orders/${order.id}`} key={order.id}><span><strong>Order {order.orderNumber.slice(-8)}</strong><small>{labels[order.trackingStatus ?? order.status] ?? labels[order.status] ?? "Your order is in progress."}</small></span><span>Track order →</span></Link>)}</aside>;
}
