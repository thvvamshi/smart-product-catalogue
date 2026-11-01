import { z } from 'zod';
import { decodeInventoryCursor } from '../utils/inventory-cursor.js';

const numberString = (name: string) => z.string().trim()
  .regex(/^-?\d+(?:\.\d+)?$/, `${name} must be a number`)
  .transform(Number)
  .refine(Number.isFinite, `${name} must be finite`);
const boundedNumber = (name: string, minimum: number, maximum: number) => numberString(name)
  .refine((value) => value >= minimum && value <= maximum, `${name} must be between ${minimum} and ${maximum}`);
const positiveNumber = (name: string, maximum: number, defaultValue: number) => numberString(name)
  .refine((value) => value > 0 && value <= maximum, `${name} must be greater than 0 and at most ${maximum}`)
  .default(defaultValue);
const positiveInteger = (name: string, maximum: number, defaultValue: number) => z.string().trim()
  .regex(/^\d+$/, `${name} must be a positive integer`)
  .transform(Number)
  .refine((value) => value >= 1 && value <= maximum, `${name} must be between 1 and ${maximum}`)
  .default(defaultValue);

export const nearbyStoresQuerySchema = z.object({
  latitude: boundedNumber('latitude', -90, 90),
  longitude: boundedNumber('longitude', -180, 180),
  radiusKm: positiveNumber('radiusKm', 50, 10),
  limit: positiveInteger('limit', 50, 10),
}).strict();

export const serviceabilityQuerySchema = z.object({
  latitude: boundedNumber('latitude', -90, 90),
  longitude: boundedNumber('longitude', -180, 180),
}).strict();

export const storeIdSchema = z.string().regex(/^[1-9]\d*$/, 'Store id must be a positive integer');

export const storeInventoryQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  available: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  limit: positiveInteger('limit', 100, 20),
  cursor: z.string().trim().min(1).max(512).optional(),
}).strict().superRefine((value, context) => {
  if (value.cursor && !decodeInventoryCursor(value.cursor)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['cursor'], message: 'cursor is malformed' });
  }
}).transform((value) => ({
  ...value,
  cursor: value.cursor ? decodeInventoryCursor(value.cursor) ?? undefined : undefined,
}));
