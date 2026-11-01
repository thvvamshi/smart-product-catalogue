import { Router } from "express";
import * as controller from "../controllers/order.controller.js";
import { requireGuestSession } from "../middleware/guest-session.js";
import { requireStoreOperator } from "../middleware/store-operator.js";
import { validateBody, validateParam, validateQuery } from "../middleware/validate-request.js";
import { commerceIdSchema } from "../schemas/commerce.schema.js";
import { createOrderSchema, orderListQuerySchema, rejectStoreOrderSchema, storeOrderListQuerySchema } from "../schemas/order.schema.js";

export const orderRouter = Router();
orderRouter.post("/", requireGuestSession, validateBody(createOrderSchema), controller.create);
orderRouter.get("/", requireGuestSession, validateQuery(orderListQuerySchema), controller.list);
orderRouter.get("/:id", requireGuestSession, validateParam("id", commerceIdSchema), controller.detail);
orderRouter.get("/:id/history", requireGuestSession, validateParam("id", commerceIdSchema), controller.history);
orderRouter.post("/:id/cancel", requireGuestSession, validateParam("id", commerceIdSchema), controller.cancel);

export const storeOrderRouter = Router();
storeOrderRouter.use(requireStoreOperator);
storeOrderRouter.get("/", validateQuery(storeOrderListQuerySchema), controller.storeList);
storeOrderRouter.get("/:id", validateParam("id", commerceIdSchema), controller.storeDetail);
storeOrderRouter.get("/:id/history", validateParam("id", commerceIdSchema), controller.storeHistory);
storeOrderRouter.post("/:id/accept", validateParam("id", commerceIdSchema), controller.accept);
storeOrderRouter.post("/:id/reject", validateParam("id", commerceIdSchema), validateBody(rejectStoreOrderSchema), controller.reject);
storeOrderRouter.post("/:id/start-preparation", validateParam("id", commerceIdSchema), controller.prepare);
storeOrderRouter.post("/:id/ready", validateParam("id", commerceIdSchema), controller.ready);
