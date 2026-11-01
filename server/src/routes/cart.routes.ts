import { Router } from "express";
import * as controller from "../controllers/cart.controller.js";
import { validateBody, validateParam, validateQuery } from "../middleware/validate-request.js";
import { requireGuestSession } from "../middleware/guest-session.js";
import {
  commerceIdSchema,
  itemSchema,
  quantitySchema,
  cartEtaSchema,
} from "../schemas/commerce.schema.js";
export const cartRouter = Router();
cartRouter.use(requireGuestSession);
cartRouter.get("/", controller.get);
cartRouter.get("/eta", validateQuery(cartEtaSchema), controller.eta);
cartRouter.post("/items", validateBody(itemSchema), controller.add);
cartRouter.patch(
  "/items/:itemId",
  validateParam("itemId", commerceIdSchema),
  validateBody(quantitySchema),
  controller.update,
);
cartRouter.delete(
  "/items/:itemId",
  validateParam("itemId", commerceIdSchema),
  controller.remove,
);
cartRouter.delete("/", controller.clear);
