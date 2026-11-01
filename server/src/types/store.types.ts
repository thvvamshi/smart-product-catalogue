export type Coordinates = { latitude: number; longitude: number };

export type NearbyStoreQuery = Coordinates & { radiusKm: number; limit: number };
export type ServiceabilityQuery = Coordinates;

export type InventoryCursor = { version: 1; productId: string };
export type StoreInventoryQuery = {
  q: string;
  available?: boolean;
  limit: number;
  cursor?: InventoryCursor;
};

export type Store = {
  id: string;
  storeCode: string;
  name: string;
  description: string;
  addressLine: string;
  landmark: string | null;
  area: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  deliveryRadiusKm: number;
  preparationTimeMinutes: number;
  isDemo: boolean;
};

export type NearbyStore = Pick<Store, 'id' | 'storeCode' | 'name' | 'area' | 'city' | 'latitude' | 'longitude' | 'deliveryRadiusKm' | 'preparationTimeMinutes' | 'isDemo'> & {
  distanceKm: number;
  isServiceable: boolean;
};

export type StoreInventoryItem = {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  cataloguePrice: number;
  sellingPrice: number;
  stockQuantity: number;
  isAvailable: boolean;
};

export type StoreInventoryCandidate = { item: StoreInventoryItem; productId: string };
