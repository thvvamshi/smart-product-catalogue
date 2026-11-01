import { z } from "zod";
export const demoSettingsSchema = z.object({
  simulationEnabled: z.boolean().optional(),
  speedKmh: z.number().finite().min(1).max(100).optional(),
  tickIntervalMs: z.number().int().min(1000).max(300000).optional(),
  preparationDurationSeconds: z.number().int().min(1).max(3600).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one setting is required");
