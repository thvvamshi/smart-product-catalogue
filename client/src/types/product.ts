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

export type ProductResponse = {
  data: Product[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasNextPage: boolean;
  };
};

export type Filters = {
  q: string;
  category: string;
  brand: string;
  minPrice: string;
  maxPrice: string;
  minRating: string;
  inStock: string;
  sort: string;
};
