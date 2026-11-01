import type { InventoryCursor } from '../types/store.types.js';

export function encodeInventoryCursor(cursor: InventoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeInventoryCursor(value: string): InventoryCursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (Object.keys(parsed).length !== 2 || parsed.version !== 1 || typeof parsed.productId !== 'string' || !/^[1-9]\d*$/.test(parsed.productId)) return null;
    return { version: 1, productId: parsed.productId };
  } catch {
    return null;
  }
}
