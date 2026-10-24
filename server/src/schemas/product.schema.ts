import { z } from 'zod';
import { decodeProductCursor } from '../utils/product-cursor.js';

const decimal = (name: string, max?: number) => z.string()
  .regex(/^\d+(?:\.\d+)?$/, `${name} must be a non-negative decimal`)
  .transform(Number)
  .refine((value) => Number.isFinite(value) && (max === undefined || value <= max), `${name} is out of range`);

const positiveInteger = (name: string, max?: number) => z.string()
  .regex(/^\d+$/, `${name} must be a positive integer`)
  .transform(Number)
  .refine((value) => value >= 1 && (max === undefined || value <= max), `${name} is out of range`);

export const productQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  category: z.string().trim().min(1).max(100).optional(),
  brand: z.string().trim().min(1).max(100).optional(),
  minPrice: decimal('minPrice').optional(),
  maxPrice: decimal('maxPrice').optional(),
  minRating: decimal('minRating', 5).optional(),
  inStock: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  sort: z.enum(['price_asc', 'price_desc', 'rating_desc', 'newest', 'name_asc']).default('newest'),
  cursor: z.string().trim().min(1).max(2048).optional(),
  limit: positiveInteger('limit', 100).default(20),
}).strict().superRefine((value, ctx) => {
  if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minPrice'], message: 'minPrice must be less than or equal to maxPrice' });
  }
  if (value.cursor) {
    const cursor = decodeProductCursor(value.cursor);
    if (!cursor) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cursor'], message: 'cursor is malformed' });
    else if (cursor.sort !== value.sort) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cursor'], message: 'cursor does not match the selected sort' });
  }
}).transform((value) => ({
  ...value,
  cursor: value.cursor ? decodeProductCursor(value.cursor) ?? undefined : undefined,
}));

export const productIdSchema = z.string().regex(/^[1-9]\d*$/, 'Product id must be a positive integer');
