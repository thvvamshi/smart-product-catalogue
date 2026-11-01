import { z } from "zod";
const id = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().regex(/^[1-9]\d*$/));
export const itemSchema = z
  .object({
    variantId: id,
    storeId: id,
    quantity: z.number().int().min(1).max(99),
  })
  .strict();
export const quantitySchema = z
  .object({ quantity: z.number().int().min(1).max(99) })
  .strict();
export const addressSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    recipientName: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+ -]{8,20}$/),
    addressLine1: z.string().trim().min(3).max(300),
    addressLine2: z.string().trim().max(300).default(""),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    postalCode: z.string().regex(/^\d{6}$/),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    isDefault: z.boolean().default(false),
  })
  .strict();
export const checkoutSchema = z.object({ addressId: id }).strict();
export const cartEtaSchema = z.object({
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
}).strict();
export const commerceIdSchema = z.string().regex(/^[1-9]\d*$/);
