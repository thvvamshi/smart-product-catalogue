import { Router } from "express";
import * as controller from "../controllers/address.controller.js";
import { validateBody } from "../middleware/validate-request.js";
import { requireGuestSession } from "../middleware/guest-session.js";
import { addressSchema } from "../schemas/commerce.schema.js";
export const addressRouter = Router();
addressRouter.use(requireGuestSession);
addressRouter.get("/", controller.list);
addressRouter.post("/", validateBody(addressSchema), controller.create);
