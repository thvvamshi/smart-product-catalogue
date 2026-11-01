import { z } from "zod";

const id = z.string().regex(/^\d+$/, "must be a valid numeric id");
const idempotency = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const createOrderSchema = z.object({ reservationId: id });
export const orderIdSchema = id;
export const storeOrderIdSchema = id;
export const rejectStoreOrderSchema = z.object({
  reasonCode: z.enum(["OUT_OF_STOCK", "DAMAGED_ITEM", "VARIANT_UNAVAILABLE", "STORE_UNABLE_TO_FULFIL", "OTHER"]),
  note: z.string().trim().max(500).optional().default(""),
});
export const idempotencyKeySchema = idempotency;
export const orderListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().regex(/^\d+$/).optional(),
});
export const storeOrderListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
