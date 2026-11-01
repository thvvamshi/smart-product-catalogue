import { z } from "zod";

const id = z.string().regex(/^\d+$/);
const key = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const agentIdSchema = id;
export const taskIdSchema = id;
export const agentCreateSchema = z.object({ agentCode: z.string().trim().min(2).max(64), identityKey: key, name: z.string().trim().min(2).max(160), phone: z.string().trim().regex(/^[0-9+ -]{8,20}$/) }).strict();
export const agentPatchSchema = z.object({ name: z.string().trim().min(2).max(160).optional(), phone: z.string().trim().regex(/^[0-9+ -]{8,20}$/).optional(), status: z.enum(["active", "inactive", "suspended"]).optional() }).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const availabilitySchema = z.object({ availability: z.enum(["available", "unavailable"]) }).strict();
export const assignSchema = z.object({ agentId: id }).strict();
export const failSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export const deliveryListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().regex(/^\d+$/).optional() });
export const locationSchema = z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), accuracyMeters: z.number().finite().min(0).max(10000), headingDegrees: z.number().finite().min(0).max(360).nullable().optional(), speedMps: z.number().finite().min(0).max(100).nullable().optional(), capturedAt: z.string().datetime({ offset: true }) }).strict();
