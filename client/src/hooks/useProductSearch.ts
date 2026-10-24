import { useCallback, useEffect, useRef, useState } from "react";
import { fetchProducts } from "../lib/api";
import type { Product, ProductResponse } from "../types/product";

function appendUnique(current: Product[], incoming: Product[]): Product[] {
  const ids = new Set(current.map((product) => product.id));
  const merged = [...current];
  for (const product of incoming) {
    if (ids.has(product.id)) continue;
    ids.add(product.id);
    merged.push(product);
  }
  return merged;
}

export function useProductSearch(params: URLSearchParams) {
  const [result, setResult] = useState<ProductResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const resultRef = useRef<ProductResponse | null>(null);
  const initialLoadingRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const completedCursors = useRef(new Set<string>());
  const key = params.toString();

  useEffect(() => {
    const requestGeneration = ++generation.current;
    const requestController = new AbortController();
    controller.current?.abort();
    controller.current = requestController;
    completedCursors.current.clear();
    resultRef.current = null;
    initialLoadingRef.current = true;
    loadingMoreRef.current = false;
    setResult(null);
    setInitialLoading(true);
    setLoadingMore(false);
    setInitialError(null);
    setLoadMoreError(null);

    void fetchProducts(new URLSearchParams(key), requestController.signal)
      .then((data) => {
        if (requestGeneration !== generation.current || requestController.signal.aborted) return;
        resultRef.current = data;
        setResult(data);
      })
      .catch((reason: unknown) => {
        if (requestGeneration !== generation.current || requestController.signal.aborted) return;
        setInitialError(reason instanceof Error ? reason.message : "Unable to load products");
      })
      .finally(() => {
        if (requestGeneration !== generation.current || requestController.signal.aborted) return;
        initialLoadingRef.current = false;
        setInitialLoading(false);
      });

    return () => requestController.abort();
  }, [key, retryVersion]);

  const loadMore = useCallback(() => {
    const current = resultRef.current;
    const cursor = current?.pagination.nextCursor;
    if (
      initialLoadingRef.current || loadingMoreRef.current ||
      !current?.pagination.hasNextPage || !cursor ||
      completedCursors.current.has(cursor)
    ) return;

    const requestGeneration = generation.current;
    const requestController = new AbortController();
    controller.current = requestController;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    const nextParams = new URLSearchParams(key);
    nextParams.set("cursor", cursor);

    void fetchProducts(nextParams, requestController.signal)
      .then((data) => {
        if (requestGeneration !== generation.current || requestController.signal.aborted) return;
        completedCursors.current.add(cursor);
        setResult((previous) => {
          if (!previous) {
            resultRef.current = data;
            return data;
          }
          const merged = { data: appendUnique(previous.data, data.data), pagination: data.pagination };
          resultRef.current = merged;
          return merged;
        });
      })
      .catch((reason: unknown) => {
        if (requestGeneration !== generation.current || requestController.signal.aborted) return;
        setLoadMoreError(reason instanceof Error ? reason.message : "Unable to load more products");
      })
      .finally(() => {
        if (requestGeneration !== generation.current || requestController.signal.aborted) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [key]);

  return {
    result, initialLoading, loadingMore, initialError, loadMoreError, loadMore,
    retryInitial: useCallback(() => setRetryVersion((value) => value + 1), []),
    retryLoadMore: loadMore,
  };
}
