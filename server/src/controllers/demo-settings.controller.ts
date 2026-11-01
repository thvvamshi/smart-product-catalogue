import type { NextFunction, Request, Response } from "express";
import { getDemoDeliverySettings, updateDemoDeliverySettings } from "../services/demo-settings.service.js";
export function get(_req: Request, res: Response) { return res.json({ data: getDemoDeliverySettings(), demoOnly: true }); }
export function update(_req: Request, res: Response, next: NextFunction) {
  try { return res.json({ data: updateDemoDeliverySettings(res.locals.validatedBody), demoOnly: true }); }
  catch (error) { next(error); }
}
