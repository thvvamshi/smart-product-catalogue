export type DiscoverySort = 'relevance' | 'price_asc' | 'price_desc' | 'nearest';
export type DiscoveryCursor = { sort: DiscoverySort; key: number; productId: string };
export type DiscoveryQuery = {
  latitude?:number; longitude?:number; search:string; category?:string; brand?:string; gender?:string;
  size?:string; sizeSystem?:string; color?:string; material?:string; minPrice?:number; maxPrice?:number;
  availability?:boolean; maxDistanceKm:number; sort:DiscoverySort; limit:number; cursor?:DiscoveryCursor;
};
export type DiscoveryItem = {
  product:{ id:string; name:string; brand:string; category:string; description:string; images:string[] };
  variant:{ id:string; sku:string; attributes:Record<string, unknown> & { gender?:string; size?:string; sizeSystem?:string; color?:string; colorCode?:string; material?:string; fit?:string; style?:string } };
  fulfilment:{ storeId:string; storeName:string; distanceKm:number } | null;
  inventory:{ price:number; availableQuantity:number; inStock:boolean } | null;
};
