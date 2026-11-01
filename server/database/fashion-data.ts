export type FashionProductSeed = {
  styleSku: string;
  name: string;
  brand: string;
  categorySlug: string;
  categoryName: string;
  gender: 'men' | 'women' | 'unisex';
  price: number;
  material: string;
  fit?: string;
  style: string;
  variantKind: 'sized' | 'footwear' | 'color-only';
};

export const fashionCategories = [
  { slug: 'men', name: 'Men', parent: null, order: 10 },
  { slug: 'women', name: 'Women', parent: null, order: 20 },
  { slug: 'footwear', name: 'Footwear', parent: null, order: 30 },
  { slug: 'accessories', name: 'Accessories', parent: null, order: 40 },
  { slug: 'men-tshirts', name: 'T-shirts', parent: 'men', order: 11 },
  { slug: 'men-shirts', name: 'Shirts', parent: 'men', order: 12 },
  { slug: 'men-jeans', name: 'Jeans', parent: 'men', order: 13 },
  { slug: 'men-ethnic-wear', name: 'Ethnic wear', parent: 'men', order: 14 },
  { slug: 'women-tops', name: 'Tops', parent: 'women', order: 21 },
  { slug: 'women-dresses', name: 'Dresses', parent: 'women', order: 22 },
  { slug: 'women-jeans', name: 'Jeans', parent: 'women', order: 23 },
  { slug: 'women-kurtis', name: 'Kurtis', parent: 'women', order: 24 },
  { slug: 'sneakers', name: 'Sneakers', parent: 'footwear', order: 31 },
  { slug: 'casual-shoes', name: 'Casual shoes', parent: 'footwear', order: 32 },
  { slug: 'sandals', name: 'Sandals', parent: 'footwear', order: 33 },
  { slug: 'bags', name: 'Bags', parent: 'accessories', order: 41 },
  { slug: 'watches', name: 'Watches', parent: 'accessories', order: 42 },
  { slug: 'belts', name: 'Belts', parent: 'accessories', order: 43 },
  { slug: 'sunglasses', name: 'Sunglasses', parent: 'accessories', order: 44 },
  { slug: 'wallets', name: 'Wallets', parent: 'accessories', order: 45 },
] as const;

export const fashionProducts: readonly FashionProductSeed[] = [
  { styleSku: 'FASH-MTS-001', name: 'Essential Cotton T-shirt', brand: 'ThreadLane', categorySlug: 'men-tshirts', categoryName: 'T-shirts', gender: 'men', price: 699, material: 'Cotton', fit: 'Regular', style: 'Casual', variantKind: 'sized' },
  { styleSku: 'FASH-MTS-002', name: 'Oversized Graphic T-shirt', brand: 'UrbanWeave', categorySlug: 'men-tshirts', categoryName: 'T-shirts', gender: 'men', price: 899, material: 'Cotton', fit: 'Oversized', style: 'Streetwear', variantKind: 'sized' },
  { styleSku: 'FASH-MSH-001', name: 'Linen Blend Shirt', brand: 'North Loom', categorySlug: 'men-shirts', categoryName: 'Shirts', gender: 'men', price: 1499, material: 'Linen blend', fit: 'Slim', style: 'Smart casual', variantKind: 'sized' },
  { styleSku: 'FASH-MJN-001', name: 'Straight Fit Denim Jeans', brand: 'Indigo Mile', categorySlug: 'men-jeans', categoryName: 'Jeans', gender: 'men', price: 1899, material: 'Denim', fit: 'Straight', style: 'Casual', variantKind: 'sized' },
  { styleSku: 'FASH-MEW-001', name: 'Textured Festive Kurta', brand: 'Aangan Studio', categorySlug: 'men-ethnic-wear', categoryName: 'Ethnic wear', gender: 'men', price: 1799, material: 'Cotton blend', fit: 'Regular', style: 'Ethnic', variantKind: 'sized' },
  { styleSku: 'FASH-WTP-001', name: 'Ribbed Everyday Top', brand: 'Mira Edit', categorySlug: 'women-tops', categoryName: 'Tops', gender: 'women', price: 799, material: 'Cotton stretch', fit: 'Fitted', style: 'Casual', variantKind: 'sized' },
  { styleSku: 'FASH-WDR-001', name: 'Flowing Midi Dress', brand: 'Mira Edit', categorySlug: 'women-dresses', categoryName: 'Dresses', gender: 'women', price: 1699, material: 'Viscose', fit: 'Relaxed', style: 'Contemporary', variantKind: 'sized' },
  { styleSku: 'FASH-WJN-001', name: 'High Rise Wide Leg Jeans', brand: 'Indigo Mile', categorySlug: 'women-jeans', categoryName: 'Jeans', gender: 'women', price: 1999, material: 'Denim', fit: 'Wide leg', style: 'Casual', variantKind: 'sized' },
  { styleSku: 'FASH-WKU-001', name: 'Printed Straight Kurti', brand: 'Aangan Studio', categorySlug: 'women-kurtis', categoryName: 'Kurtis', gender: 'women', price: 1299, material: 'Rayon', fit: 'Straight', style: 'Ethnic', variantKind: 'sized' },
  { styleSku: 'FASH-SNK-001', name: 'Metro Court Sneakers', brand: 'StrideWorks', categorySlug: 'sneakers', categoryName: 'Sneakers', gender: 'unisex', price: 2499, material: 'Synthetic leather', style: 'Lifestyle', variantKind: 'footwear' },
  { styleSku: 'FASH-CSH-001', name: 'Everyday Suede Loafers', brand: 'StrideWorks', categorySlug: 'casual-shoes', categoryName: 'Casual shoes', gender: 'men', price: 2799, material: 'Suede', style: 'Smart casual', variantKind: 'footwear' },
  { styleSku: 'FASH-SDL-001', name: 'Minimal Strap Sandals', brand: 'SoleStory', categorySlug: 'sandals', categoryName: 'Sandals', gender: 'women', price: 1299, material: 'Faux leather', style: 'Minimal', variantKind: 'footwear' },
  { styleSku: 'FASH-BAG-001', name: 'Structured City Tote', brand: 'CarryKind', categorySlug: 'bags', categoryName: 'Bags', gender: 'women', price: 2199, material: 'Faux leather', style: 'Structured', variantKind: 'color-only' },
  { styleSku: 'FASH-WAT-001', name: 'Classic Minimal Watch', brand: 'Second Story', categorySlug: 'watches', categoryName: 'Watches', gender: 'unisex', price: 3299, material: 'Stainless steel', style: 'Minimal', variantKind: 'color-only' },
  { styleSku: 'FASH-BLT-001', name: 'Reversible Formal Belt', brand: 'CarryKind', categorySlug: 'belts', categoryName: 'Belts', gender: 'men', price: 999, material: 'Faux leather', style: 'Formal', variantKind: 'sized' },
  { styleSku: 'FASH-SUN-001', name: 'Angular Frame Sunglasses', brand: 'Sunward', categorySlug: 'sunglasses', categoryName: 'Sunglasses', gender: 'unisex', price: 1499, material: 'Acetate', style: 'Angular', variantKind: 'color-only' },
  { styleSku: 'FASH-WAL-001', name: 'Slim Card Wallet', brand: 'CarryKind', categorySlug: 'wallets', categoryName: 'Wallets', gender: 'unisex', price: 799, material: 'Faux leather', style: 'Minimal', variantKind: 'color-only' },
] as const;
