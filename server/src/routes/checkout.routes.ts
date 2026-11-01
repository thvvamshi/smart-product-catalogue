import { Router } from "express";
import * as controller from "../controllers/checkout.controller.js";
import { requireGuestSession } from "../middleware/guest-session.js";
import { validateBody, validateParam } from "../middleware/validate-request.js";
import {
  checkoutSchema,
  commerceIdSchema,
} from "../schemas/commerce.schema.js";
export const checkoutRouter = Router();
checkoutRouter.use(requireGuestSession);
checkoutRouter.post(
  "/validate",
  validateBody(checkoutSchema),
  controller.validate,
);
checkoutRouter.post(
  "/reservations",
  validateBody(checkoutSchema),
  controller.reserve,
);
checkoutRouter.post(
  "/place-order",
  validateBody(checkoutSchema),
  controller.placeOrder,
);
checkoutRouter.get(
  "/reservations/:id",
  validateParam("id", commerceIdSchema),
  controller.get,
);
checkoutRouter.post(
  "/reservations/:id/release",
  validateParam("id", commerceIdSchema),
  controller.release,
);
