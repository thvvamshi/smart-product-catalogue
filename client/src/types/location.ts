export type CustomerLocation = {
  label: string;
  area: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: number;
  source: 'browser' | 'manual' | 'demo-area';
};

export type NearestStore = {
  id: string;
  name: string;
  area: string;
  distanceKm: number;
  deliveryRadiusKm: number;
  isDemo: boolean;
};

export type ServiceabilityResponse = {
  data: {
    isServiceable: boolean;
    customerLocation: { latitude: number; longitude: number };
    nearestStore: NearestStore | null;
  };
};

export type NearbyStore = NearestStore & {
  storeCode: string;
  city: string;
  latitude: number;
  longitude: number;
  preparationTimeMinutes: number;
  isServiceable: boolean;
};

export type NearbyStoresResponse = { data: NearbyStore[]; meta: { count: number; searchRadiusKm: number } };
