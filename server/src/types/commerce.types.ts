export type AddressInput={label:string;recipientName:string;phone:string;addressLine1:string;addressLine2:string;city:string;state:string;postalCode:string;latitude:number;longitude:number;isDefault:boolean};
export type CartMutation={variantId:string;storeId:string;quantity:number};
export type CartLine={id:string;variantId:string;storeId:string;productId:string;name:string;brand:string;imageUrl:string|null;sku:string;size:string|null;color:string|null;quantity:number;priceSnapshot:string;currentPrice:string;stockQuantity:number;available:boolean;priceChanged:boolean;storeName:string;lineSubtotal:string};
export type ValidationIssue={code:string;message:string;itemId?:string;storeId?:string;variantId?:string};
