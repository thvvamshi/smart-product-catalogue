import { Router } from "express";
import * as controller from "../controllers/discovery.controller.js";
import {
  validateParam,
  validateQuery,
} from "../middleware/validate-request.js";
import {
  discoveryFiltersSchema,
  discoveryLocationSchema,
  discoveryQuerySchema,
  positiveIdSchema,
  suggestionSchema,
  optionalDiscoveryLocationSchema,
} from "../schemas/discovery.schema.js";
export const discoveryRouter = Router();
discoveryRouter.get(
  "/products",
  validateQuery(discoveryQuerySchema),
  controller.search,
);
discoveryRouter.get(
  "/products/:productId",
  validateParam("productId", positiveIdSchema),
  validateQuery(optionalDiscoveryLocationSchema),
  controller.detail,
);
discoveryRouter.get(
  "/suggestions",
  validateQuery(suggestionSchema),
  controller.suggestions,
);
discoveryRouter.get("/categories", controller.categories);
discoveryRouter.get(
  "/filters",
  validateQuery(discoveryFiltersSchema),
  controller.filters,
);
discoveryRouter.get(
  "/variants/:variantId/stores",
  validateParam("variantId", positiveIdSchema),
  validateQuery(discoveryLocationSchema),
  controller.variantStores,
);
