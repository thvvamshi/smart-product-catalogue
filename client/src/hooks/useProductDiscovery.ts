import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDiscovery } from '../lib/api';
import type { DiscoveryItem } from '../types/discovery';
export function useProductDiscovery(params: URLSearchParams | null) {
  const [items, setItems] = useState<DiscoveryItem[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const generation = useRef(0); const active = useRef<AbortController | null>(null); const pending = useRef(false); const key = params?.toString() ?? '';
  const load = useCallback(async (next: string | null, append: boolean) => {
    if (!params || pending.current) return;
    pending.current = true; const run = generation.current; const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams(params); query.set('limit', '20'); if (next) query.set('cursor', next);
      const response = await fetchDiscovery(query, controller.signal); if (run !== generation.current) return;
      setItems((old) => append ? [...new Map([...old, ...response.data].map((item) => [item.product.id, item])).values()] : response.data);
      setCursor(response.pagination.nextCursor); setHasMore(response.pagination.hasMore);
    } catch (reason) {
      if (run === generation.current && !(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : 'Unable to load fashion');
    } finally {
      if (active.current === controller) { pending.current = false; active.current = null; }
      if (run === generation.current) setLoading(false);
    }
  }, [key]);
  useEffect(() => { generation.current++; active.current?.abort(); active.current = null; pending.current = false; setItems([]); setCursor(null); setHasMore(false); setError(null); if (params) void load(null, false); return () => active.current?.abort(); }, [key, load]);
  return { items, loading, error, hasMore, loadMore: () => cursor && load(cursor, true), retry: () => load(items.length ? cursor : null, items.length > 0) };
}
