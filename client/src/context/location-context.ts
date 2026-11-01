import { createContext } from 'react';
import type { CustomerLocation, NearbyStore, ServiceabilityResponse } from '../types/location';

export type LocationContextValue = {
  location: CustomerLocation | null;
  serviceability: ServiceabilityResponse['data'] | null;
  nearbyStores: NearbyStore[];
  loading: boolean;
  error: string | null;
  selectLocation: (location: CustomerLocation) => Promise<void>;
};

export const LocationContext = createContext<LocationContextValue | null>(null);
