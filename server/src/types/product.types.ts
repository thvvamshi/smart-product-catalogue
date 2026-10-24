export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  price: number;
  rating: number;
  inStock: boolean;
  createdAt: string;
  imageUrl: string | null;
};

export type ProductSort = 'price_asc' | 'price_desc' | 'rating_desc' | 'newest' | 'name_asc';

export type ProductCursor = {
  version: 1;
  sort: ProductSort;
  key: string;
  id: string;
};

export type ProductQuery = {
  q: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  sort: ProductSort;
  limit: number;
  cursor?: ProductCursor;
};

export type ProductSearchCandidate = {
  product: Product;
  cursorKey: string;
};

export type ProductSearchResponse = {
  data: Product[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasNextPage: boolean;
  };
};
