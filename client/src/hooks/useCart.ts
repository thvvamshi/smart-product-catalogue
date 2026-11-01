import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearCart,
  fetchCart,
  removeCartItem,
  updateCartItem,
  notifyCartChanged,
} from "../lib/api";
import type { Cart } from "../types/commerce";
export function useCart() {
  const [cart, setCart] = useState<Cart | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    try {
      const response = await fetchCart(controller.signal);
      if (current === generation.current) setCart(response.data);
    } catch (reason) {
      if (current === generation.current && reason instanceof Error)
        setError(reason.message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
    return () => controller.abort();
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const mutate = async (action: () => Promise<{ data: Cart }>) => {
    setLoading(true);
    setError("");
    try {
      setCart((await action()).data);
      notifyCartChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cart update failed");
    } finally {
      setLoading(false);
    }
  };
  return {
    cart,
    loading,
    error,
    retry: load,
    update: (id: string, q: number) => mutate(() => updateCartItem(id, q)),
    remove: (id: string) => mutate(() => removeCartItem(id)),
    clear: () => mutate(clearCart),
  };
}
