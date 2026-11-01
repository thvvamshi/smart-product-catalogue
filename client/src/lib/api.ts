import type { ProductResponse } from "../types/product";
import type {
  NearbyStoresResponse,
  ServiceabilityResponse,
} from "../types/location";
import type {
  DiscoveryCategory,
  DiscoveryDetail,
  DiscoveryFilters,
  DiscoveryResponse,
  DiscoverySuggestion,
  VariantStore,
} from "../types/discovery";
import type {
  Address,
  Cart,
  CartEta,
  CheckoutValidation,
  Reservation,
} from "../types/commerce";
import { guestSession } from "./guest-session";
import type { Order, OrderSummary, StoreOrder } from "../types/order";
import type { DeliveryAgent, DeliveryTask } from "../types/delivery";

const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function fetchProducts(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<ProductResponse> {
  const response = await fetch(`${API_URL}/products?${params.toString()}`, {
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new ApiError(
      body?.error?.message || "Unable to load products",
      response.status,
    );
  }
  return response.json() as Promise<ProductResponse>;
}

async function getJson<T>(path: string, params: URLSearchParams): Promise<T> {
  const response = await fetch(`${API_URL}${path}?${params.toString()}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new ApiError(
      body?.error?.message || "Unable to check delivery location",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}
export function fetchDiscovery(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<DiscoveryResponse> {
  return fetch(`${API_URL}/discovery/products?${params}`, { signal }).then(
    async (response) => {
      if (!response.ok)
        throw new ApiError(
          (
            (await response.json().catch(() => null)) as {
              error?: { message?: string };
            } | null
          )?.error?.message || "Unable to discover products",
          response.status,
        );
      return response.json() as Promise<DiscoveryResponse>;
    },
  );
}
export function fetchDiscoveryDetail(
  id: string,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<DiscoveryDetail> {
  return fetch(`${API_URL}/discovery/products/${id}?${params}`, {
    signal,
  }).then(async (response) => {
    if (!response.ok)
      throw new ApiError(
        response.status === 404
          ? "Product not found"
          : "Unable to load product",
        response.status,
      );
    return response.json() as Promise<DiscoveryDetail>;
  });
}
async function fetchDiscoveryResource<T>(
  path: string,
  params?: URLSearchParams,
  signal?: AbortSignal,
): Promise<T> {
  const suffix = params?.toString() ? `?${params}` : "";
  const response = await fetch(`${API_URL}${path}${suffix}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new ApiError(
      body?.error?.message || "Unable to load discovery data",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}
export const fetchDiscoveryCategories = (signal?: AbortSignal) =>
  fetchDiscoveryResource<{ data: DiscoveryCategory[] }>(
    "/discovery/categories",
    undefined,
    signal,
  );
export const fetchDiscoveryFilters = (
  category?: string,
  signal?: AbortSignal,
) =>
  fetchDiscoveryResource<{ data: DiscoveryFilters }>(
    "/discovery/filters",
    category ? new URLSearchParams({ category }) : undefined,
    signal,
  );
export const fetchDiscoverySuggestions = (
  params: URLSearchParams,
  signal?: AbortSignal,
) =>
  fetchDiscoveryResource<{ data: DiscoverySuggestion[] }>(
    "/discovery/suggestions",
    params,
    signal,
  );
export const fetchVariantStores = (
  variantId: string,
  params: URLSearchParams,
  signal?: AbortSignal,
) =>
  fetchDiscoveryResource<{ data: VariantStore[] }>(
    `/discovery/variants/${variantId}/stores`,
    params,
    signal,
  );
async function commerce<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Cart-Session": guestSession(),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as T & {
    error?: { message?: string; issues?: unknown[] };
  };
  if (!response.ok)
    throw new ApiError(
      body?.error?.message || "Commerce request failed",
      response.status,
    );
  return body;
}
export const fetchCart = (signal?: AbortSignal) =>
  commerce<{ data: Cart }>("/cart", { signal });
export const fetchCartEta = (latitude: number, longitude: number, signal?: AbortSignal) =>
  commerce<{ data: CartEta }>(`/cart/eta?${new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) })}`, { signal });
export const notifyCartChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("cart:changed"));
};
export const notifyOrderCreated = (orderId: string) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("order:created", { detail: { orderId } }));
};
export const addCartItem = (variantId: string, storeId: string, quantity = 1) =>
  commerce<{ data: Cart }>("/cart/items", {
    method: "POST",
    body: JSON.stringify({ variantId, storeId, quantity }),
  });
export const updateCartItem = (id: string, quantity: number) =>
  commerce<{ data: Cart }>(`/cart/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
export const removeCartItem = (id: string) =>
  commerce<{ data: Cart }>(`/cart/items/${id}`, { method: "DELETE" });
export const clearCart = () =>
  commerce<{ data: Cart }>("/cart", { method: "DELETE" });
export const fetchAddresses = (signal?: AbortSignal) =>
  commerce<{ data: Address[] }>("/addresses", { signal });
export const createAddress = (input: Omit<Address, "id">) =>
  commerce<{ data: Address }>("/addresses", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const validateCheckout = (addressId: string, signal?: AbortSignal) =>
  commerce<{ data: CheckoutValidation }>("/checkout/validate", {
    method: "POST",
    body: JSON.stringify({ addressId }),
    signal,
  });
export const createReservation = (addressId: string, key: string) =>
  commerce<{ data: Reservation }>("/checkout/reservations", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ addressId }),
  });
export const getReservation = (id: string, signal?: AbortSignal) =>
  commerce<{ data: Reservation }>(`/checkout/reservations/${id}`, { signal });
export const releaseReservation = (id: string) =>
  commerce<{ data: Reservation }>(`/checkout/reservations/${id}/release`, {
    method: "POST",
  });
export const createOrder = (reservationId: string, key: string) =>
  commerce<{ data: Order }>("/orders", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ reservationId }),
  });
export const placeCheckoutOrder = (addressId: string, key: string) =>
  commerce<{ data: Order }>("/checkout/place-order", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ addressId }),
  });
export const fetchOrders = (params = new URLSearchParams(), signal?: AbortSignal) =>
  commerce<{ data: OrderSummary[]; pagination: { limit: number; hasNextPage: boolean; nextCursor: string | null } }>(`/orders${params.toString() ? `?${params}` : ""}`, { signal });
export const fetchOrder = (id: string, signal?: AbortSignal) => commerce<{ data: Order }>(`/orders/${id}`, { signal });
export const fetchOrderHistory = (id: string, signal?: AbortSignal) => commerce<{ data: Array<{ id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }> }>(`/orders/${id}/history`, { signal });
export const cancelOrder = (id: string) => commerce<{ data: Order }>(`/orders/${id}/cancel`, { method: "POST" });
async function storeRequest<T>(path: string, key: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", "X-Store-Operator": key, ...init.headers } });
  const body = await response.json().catch(() => null) as T & { error?: { message?: string } };
  if (!response.ok) throw new ApiError(body?.error?.message || "Store request failed", response.status);
  return body;
}
export type StoreOperatorContext = { id: string; storeCode: string; storeName: string };
export const fetchStoreOrders = (key: string) => storeRequest<{ data: StoreOrder[]; store: StoreOperatorContext }>("/store-orders", key);
export const fetchStoreOrder = (id: string, key: string) => storeRequest<{ data: StoreOrder & { orderNumber?: string; customerOrderId?: string } }>(`/store-orders/${id}`, key);
export const transitionStoreOrder = (id: string, action: "accept" | "reject" | "start-preparation" | "ready", key: string, body?: unknown) => storeRequest<{ data: Order }>(`/store-orders/${id}/${action}`, key, { method: "POST", body: body ? JSON.stringify(body) : undefined });
async function identityRequest<T>(path: string, header: string, identity: string, init: RequestInit = {}) { const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", [header]: identity, ...init.headers } }); const body = await response.json().catch(() => null) as T & { error?: { message?: string } }; if (!response.ok) throw new ApiError(body?.error?.message || "Delivery request failed", response.status); return body; }
export const fetchDispatchTasks = (identity: string) => identityRequest<{data:DeliveryTask[];pagination:unknown}>("/dispatch/tasks", "X-Dispatch-Identity", identity);
export const fetchDispatchAgents = (identity: string) => identityRequest<{data:DeliveryAgent[]}>("/dispatch/agents", "X-Dispatch-Identity", identity);
export const assignDeliveryTask = (id: string, agentId: string, identity: string, reassign = false) => identityRequest<{data:DeliveryTask}>(`/dispatch/tasks/${id}/${reassign ? "reassign" : "assign"}`, "X-Dispatch-Identity", identity, { method: "POST", body: JSON.stringify({ agentId }) });
export type DemoDeliverySettings = { simulationEnabled: boolean; speedKmh: number; tickIntervalMs: number; preparationDurationSeconds: number };
export const fetchDemoDeliverySettings = (identity: string) => identityRequest<{data:DemoDeliverySettings;demoOnly:boolean}>("/dispatch/settings", "X-Dispatch-Identity", identity);
export const updateDemoDeliverySettings = (identity: string, input: Partial<DemoDeliverySettings>) => identityRequest<{data:DemoDeliverySettings;demoOnly:boolean}>("/dispatch/settings", "X-Dispatch-Identity", identity, { method: "PATCH", body: JSON.stringify(input) });
export const fetchAgentDeliveries = (identity: string) => identityRequest<{data:DeliveryTask[]}>("/agent/deliveries", "X-Agent-Identity", identity);
export const fetchAgentDelivery = (id: string, identity: string) => identityRequest<{data:DeliveryTask}>(`/agent/deliveries/${id}`, "X-Agent-Identity", identity);
export const updateAgentDelivery = (id: string, action: string, identity: string, body?: unknown) => identityRequest<{data:DeliveryTask}>(`/agent/deliveries/${id}/${action}`, "X-Agent-Identity", identity, { method: "POST", body: body ? JSON.stringify(body) : undefined });
export const updateAgentLocation = (id: string, identity: string, body: { latitude: number; longitude: number; accuracyMeters: number; headingDegrees?: number | null; speedMps?: number | null; capturedAt: string }) => identityRequest<{data:{accepted:boolean;reason?:string;receivedAt?:string}}>(`/agent/deliveries/${id}/location`, "X-Agent-Identity", identity, { method: "POST", body: JSON.stringify(body) });
export const fetchOrderDeliveries = (orderId: string, signal?: AbortSignal) => commerce<{data:DeliveryTask[]}>(`/orders/${orderId}/deliveries`, { signal });
export const fetchDeliveryTracking = (id: string, signal?: AbortSignal) => commerce<{data:DeliveryTask}>(`/deliveries/${id}/tracking`, { signal });

export function fetchServiceability(
  latitude: number,
  longitude: number,
): Promise<ServiceabilityResponse> {
  return getJson(
    "/stores/serviceability",
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
    }),
  );
}

export function fetchNearbyStores(
  latitude: number,
  longitude: number,
): Promise<NearbyStoresResponse> {
  return getJson(
    "/stores/nearby",
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      radiusKm: "10",
      limit: "10",
    }),
  );
}
