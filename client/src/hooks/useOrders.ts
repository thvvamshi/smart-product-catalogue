import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOrder, fetchOrderHistory, fetchOrders } from "../lib/api";
import type { Order, OrderSummary } from "../types/order";

export function useOrders() {
  const [orders, setOrders] = useState<OrderSummary[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [nextCursor, setNextCursor] = useState<string | null>(null), [hasNext, setHasNext] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async (cursor?: string) => { const current = ++generation.current; setLoading(true); setError(""); try { const result = await fetchOrders(cursor ? new URLSearchParams({ cursor, limit: "20" }) : new URLSearchParams({ limit: "20" })); if (current !== generation.current) return; setOrders((value) => cursor ? [...value, ...result.data] : result.data); setNextCursor(result.pagination.nextCursor); setHasNext(result.pagination.hasNextPage); } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : "Unable to load orders"); } finally { if (current === generation.current) setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return { orders, loading, error, hasNext, loadMore: () => nextCursor ? load(nextCursor) : Promise.resolve(), retry: () => load() };
}

export function useOrder(id: string) {
  const [order, setOrder] = useState<Order | null>(null), [history, setHistory] = useState<Array<{ id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => { setLoading(true); try { const [o, h] = await Promise.all([fetchOrder(id, signal), fetchOrderHistory(id, signal)]); setOrder(o.data); setHistory(h.data); setError(""); } catch (e) { if ((e as {name?:string}).name !== "AbortError") setError(e instanceof Error ? e.message : "Unable to load order"); } finally { if (!signal?.aborted) setLoading(false); } }, [id]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  return { order, history, loading, error, refresh };
}
