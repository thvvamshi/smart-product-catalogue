import type { ProductResponse } from '../types/product';

const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function fetchProducts(params: URLSearchParams, signal?: AbortSignal): Promise<ProductResponse> {
  const response = await fetch(`${API_URL}/products?${params.toString()}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiError(body?.error?.message || 'Unable to load products', response.status);
  }
  return response.json() as Promise<ProductResponse>;
}
