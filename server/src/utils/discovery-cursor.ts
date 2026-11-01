import type { DiscoveryCursor, DiscoverySort } from '../types/discovery.types.js';
export function encodeDiscoveryCursor(value: DiscoveryCursor) { return Buffer.from(JSON.stringify({ v:1,...value })).toString('base64url'); }
export function decodeDiscoveryCursor(raw:string, sort:DiscoverySort): DiscoveryCursor | null {
  try {
    const value:unknown=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));
    if (!value || typeof value!=='object') return null;
    const cursor=value as Record<string,unknown>;
    if (cursor.v!==1 || cursor.sort!==sort || typeof cursor.key!=='number' || !Number.isFinite(cursor.key) || typeof cursor.productId!=='string' || !/^[1-9]\d*$/.test(cursor.productId)) return null;
    return { sort, key:cursor.key, productId:cursor.productId };
  } catch { return null; }
}
