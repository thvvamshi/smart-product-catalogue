export type DiscoveryItem={product:{id:string;name:string;brand:string;category:string;description:string;images:string[]};variant:{id:string;sku:string;attributes:Record<string,string>};fulfilment:{storeId:string;storeName:string;distanceKm:number}|null;inventory:{price:number;availableQuantity:number;inStock:boolean}|null};
export type DiscoveryResponse={data:DiscoveryItem[];pagination:{limit:number;nextCursor:string|null;hasMore:boolean}};
export type DiscoveryVariant=DiscoveryItem['variant']&{fulfilment:DiscoveryItem['fulfilment']|null;inventory:{price:number|null;availableQuantity:number;inStock:boolean}};
export type DiscoveryDetail={data:{product:DiscoveryItem['product'];variants:DiscoveryVariant[]}};
export type DiscoveryCategory={id:string;slug:string;name:string;children:Array<{id:string;slug:string;name:string}>};
export type DiscoveryFilters={brands:string[];genders:string[];sizes:string[];sizeSystems:string[];colors:string[];materials:string[]};
export type DiscoverySuggestion={id:string;name:string;brand:string};
export type VariantStore={store_id:string;store_name:string;distance_km:number;price:number;stock_quantity:number;eta?:{minEtaMinutes:number;maxEtaMinutes:number;etaSource:string}|null};
