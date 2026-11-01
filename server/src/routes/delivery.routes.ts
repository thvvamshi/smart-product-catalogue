import { Router } from "express";
import * as controller from "../controllers/delivery.controller.js";
import { requireAgent, requireDispatcher } from "../middleware/delivery-auth.js";
import { requireGuestSession } from "../middleware/guest-session.js";
import { validateBody, validateParam, validateQuery } from "../middleware/validate-request.js";
import { agentCreateSchema, agentIdSchema, agentPatchSchema, assignSchema, availabilitySchema, deliveryListQuerySchema, failSchema, locationSchema, taskIdSchema } from "../schemas/delivery.schema.js";
import { demoSettingsSchema } from "../schemas/demo-settings.schema.js";
import * as demoSettings from "../controllers/demo-settings.controller.js";

export const deliveryAgentRouter = Router();
deliveryAgentRouter.use(requireDispatcher(["admin"]));
deliveryAgentRouter.post("/", validateBody(agentCreateSchema), controller.createAgent);
deliveryAgentRouter.get("/", controller.listAgents);
deliveryAgentRouter.get("/:id", validateParam("id", agentIdSchema), controller.getAgent);
deliveryAgentRouter.patch("/:id", validateParam("id", agentIdSchema), validateBody(agentPatchSchema), controller.patchAgent);
deliveryAgentRouter.patch("/:id/availability", validateParam("id", agentIdSchema), validateBody(availabilitySchema), controller.availability);

export const dispatchRouter = Router();
dispatchRouter.use(requireDispatcher());
dispatchRouter.get("/settings", demoSettings.get);
dispatchRouter.patch("/settings", validateBody(demoSettingsSchema), demoSettings.update);
dispatchRouter.get("/tasks", validateQuery(deliveryListQuerySchema), controller.tasks);
dispatchRouter.get("/diagnostics", controller.diagnostics);
dispatchRouter.get("/tasks/:id", validateParam("id", taskIdSchema), controller.task);
dispatchRouter.post("/tasks/:id/assign", validateParam("id", taskIdSchema), validateBody(assignSchema), controller.assign);
dispatchRouter.post("/tasks/:id/reassign", validateParam("id", taskIdSchema), validateBody(assignSchema), controller.reassign);
dispatchRouter.get("/agents", controller.listAgents);

export const agentRouter = Router();
agentRouter.use(requireAgent);
agentRouter.get("/deliveries", controller.agentDeliveries);
agentRouter.get("/deliveries/:id", validateParam("id", taskIdSchema), controller.agentDelivery);
agentRouter.post("/deliveries/:id/heading-to-store", validateParam("id", taskIdSchema), controller.heading);
agentRouter.post("/deliveries/:id/arrived-at-store", validateParam("id", taskIdSchema), controller.arrived);
agentRouter.post("/deliveries/:id/pickup", validateParam("id", taskIdSchema), controller.pickup);
agentRouter.post("/deliveries/:id/out-for-delivery", validateParam("id", taskIdSchema), controller.out);
agentRouter.post("/deliveries/:id/delivered", validateParam("id", taskIdSchema), controller.delivered);
agentRouter.post("/deliveries/:id/failed", validateParam("id", taskIdSchema), validateBody(failSchema), controller.failed);
agentRouter.post("/deliveries/:id/location", validateParam("id", taskIdSchema), validateBody(locationSchema), controller.location);

export const customerDeliveryRouter = Router();
customerDeliveryRouter.get("/orders/:id/deliveries", requireGuestSession, validateParam("id", taskIdSchema), controller.customerDeliveries);
customerDeliveryRouter.get("/deliveries/:id/tracking", requireGuestSession, validateParam("id", taskIdSchema), controller.tracking);
