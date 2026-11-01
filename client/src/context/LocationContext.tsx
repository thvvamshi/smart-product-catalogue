import { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchNearbyStores, fetchServiceability } from '../lib/api';
import type { CustomerLocation, NearbyStore, ServiceabilityResponse } from '../types/location';
import { LocationContext } from './location-context';

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<CustomerLocation | null>(null);
  const [serviceability, setServiceability] = useState<ServiceabilityResponse['data'] | null>(null);
  const [nearbyStores, setNearbyStores] = useState<NearbyStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const selectLocation = useCallback(async (nextLocation: CustomerLocation) => {
    const generation = ++requestGeneration.current;
    setLocation(nextLocation);
    setLoading(true);
    setError(null);
    setServiceability(null);
    setNearbyStores([]);
    try {
      const [serviceabilityResult, nearbyResult] = await Promise.all([
        fetchServiceability(nextLocation.latitude, nextLocation.longitude),
        fetchNearbyStores(nextLocation.latitude, nextLocation.longitude),
      ]);
      if (generation !== requestGeneration.current) return;
      setServiceability(serviceabilityResult.data);
      setNearbyStores(nearbyResult.data);
    } catch (reason) {
      if (generation !== requestGeneration.current) return;
      setError(reason instanceof Error ? reason.message : 'Unable to check delivery for this location');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, []);

  const value = useMemo(() => ({ location, serviceability, nearbyStores, loading, error, selectLocation }),
    [location, serviceability, nearbyStores, loading, error, selectLocation]);
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationSelection() {
  const value = useContext(LocationContext);
  if (!value) throw new Error('useLocationSelection must be used inside LocationProvider');
  return value;
}
