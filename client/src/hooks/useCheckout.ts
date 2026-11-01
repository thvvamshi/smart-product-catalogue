import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  fetchAddresses,
  notifyCartChanged,
  notifyOrderCreated,
  placeCheckoutOrder,
  validateCheckout,
} from "../lib/api";
import type {
  Address,
  CheckoutValidation,
} from "../types/commerce";
import type { Order } from "../types/order";
export function useCheckout() {
  const [addresses, setAddresses] = useState<Address[]>([]),
    [addressId, setAddressId] = useState(""),
    [validation, setValidation] = useState<CheckoutValidation | null>(null),
    [order, setOrder] = useState<Order | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    orderKey = useRef(""),
    controllerRef = useRef<AbortController | null>(null),
    validationTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    inFlight = useRef(false);
  const refreshAddresses = async () => {
    const result = await fetchAddresses();
    setAddresses(result.data);
    setAddressId(
      (current) =>
        current ||
        result.data.find((a) => a.isDefault)?.id ||
        result.data[0]?.id ||
        "",
    );
  };
  useEffect(() => {
    void refreshAddresses().catch((e) => setError(e.message));
  }, []);
  const invalidate = useCallback(() => {
    generation.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setValidation(null);
    setOrder(null);
    orderKey.current = "";
  }, []);
  const validate = useCallback(async () => {
    if (!addressId) return;
    if (inFlight.current) return;
    if (validationTimer.current) {
      clearTimeout(validationTimer.current);
      validationTimer.current = null;
    }
    controllerRef.current?.abort();
    const current = ++generation.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    inFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await validateCheckout(addressId, controller.signal);
      if (current === generation.current) setValidation(result.data);
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      if (current === generation.current) {
        setLoading(false);
        controllerRef.current = null;
        inFlight.current = false;
      }
    }
  }, [addressId]);
  const scheduleValidation = useCallback(() => {
    if (!addressId) return;
    if (validationTimer.current) clearTimeout(validationTimer.current);
    validationTimer.current = setTimeout(() => {
      validationTimer.current = null;
      void validate();
    }, 300);
  }, [addressId, validate]);
  useEffect(() => {
    invalidate();
    scheduleValidation();
    return () => {
      if (validationTimer.current) clearTimeout(validationTimer.current);
      controllerRef.current?.abort();
    };
  }, [addressId, invalidate, scheduleValidation]);
  useEffect(() => {
    const handleCartChanged = () => {
      invalidate();
      scheduleValidation();
    };
    window.addEventListener("cart:changed", handleCartChanged);
    return () => window.removeEventListener("cart:changed", handleCartChanged);
  }, [invalidate, scheduleValidation]);
  useEffect(() => {
    const validUntil = validation?.eta?.validUntil;
    if (!validUntil) return;
    const delay = Math.max(0, Date.parse(validUntil) - Date.now());
    const timer = setTimeout(() => {
      invalidate();
      scheduleValidation();
    }, delay);
    return () => clearTimeout(timer);
  }, [validation?.eta?.validUntil, invalidate, scheduleValidation]);
  const placeOrder = async () => {
    if (!addressId || !validation?.valid || loading) return;
    orderKey.current ||= `order_${crypto.randomUUID().replaceAll("-", "")}`;
    setLoading(true);
    setError("");
    try {
      const placed = (await placeCheckoutOrder(addressId, orderKey.current)).data;
      notifyCartChanged();
      notifyOrderCreated(placed.id);
      // Cart invalidation is synchronous; set the confirmation afterward so a
      // successful order is not immediately cleared by its own cart refresh.
      setOrder(placed);
    }
    catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("One or more items are no longer available in the selected store. Please review your cart.");
        try { setValidation((await validateCheckout(addressId)).data); } catch { /* The actionable checkout error remains visible. */ }
      } else setError(e instanceof Error ? "We couldn't confirm your order. Please check your orders before trying again." : "We couldn't confirm your order. Please check your orders before trying again.");
    }
    finally { setLoading(false); }
  };
  return {
    addresses,
    addressId,
    setAddressId,
    validation,
    order,
    loading,
    error,
    validate,
    placeOrder,
    refreshAddresses,
  };
}
