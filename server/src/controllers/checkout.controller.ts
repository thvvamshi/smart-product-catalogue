import type { NextFunction, Request, Response } from "express";
import * as service from "../services/checkout.service.js";
export async function validate(_r: Request, res: Response, next: NextFunction) {
  try {
    return res.json({
      data: await service.validate(
        res.locals.sessionId,
        (res.locals.validatedBody as { addressId: string }).addressId,
      ),
    });
  } catch (e) {
    next(e);
  }
}
export async function reserve(req: Request, res: Response, next: NextFunction) {
  try {
    const key = req.header("Idempotency-Key");
    if (!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key))
      return res
        .status(400)
        .json({
          error: {
            code: "INVALID_IDEMPOTENCY_KEY",
            message: "A valid Idempotency-Key header is required",
          },
        });
    const result = await service.reserve(
      res.locals.sessionId,
      (res.locals.validatedBody as { addressId: string }).addressId,
      key,
    );
    if (result.validation)
      return res
        .status(409)
        .json({
          error: {
            code: "CHECKOUT_VALIDATION_FAILED",
            message: "Cart validation failed",
            issues: result.validation.issues,
          },
          data: result.validation,
        });
    return res.status(result.created ? 201 : 200).json({ data: result.data });
  } catch (e) {
    next(e);
  }
}
export async function placeOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const key = req.header("Idempotency-Key");
    if (!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) return res.status(400).json({ error: { code: "INVALID_IDEMPOTENCY_KEY", message: "A valid Idempotency-Key header is required" } });
    const result = await service.placeOrder(res.locals.sessionId, (res.locals.validatedBody as { addressId: string }).addressId, key);
    if ("validation" in result) {
      const validation = result.validation;
      if (validation) return res.status(409).json({ error: { code: "CHECKOUT_VALIDATION_FAILED", message: "One or more items are no longer available in the selected store. Please review your cart.", issues: validation.issues }, data: validation });
    }
    if ("data" in result) return res.status(result.created ? 201 : 200).json({ data: result.data });
    return res.status(500).json({ error: { code: "CHECKOUT_PLACE_ORDER_FAILED", message: "Unable to place order" } });
  } catch (e) { next(e); }
}
export async function get(_r: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.get(
      res.locals.sessionId,
      (res.locals.validatedParams as { id: string }).id,
    );
    return result
      ? res.json({ data: result })
      : res
          .status(404)
          .json({
            error: { code: "NOT_FOUND", message: "Reservation not found" },
          });
  } catch (e) {
    next(e);
  }
}
export async function release(_r: Request, res: Response, next: NextFunction) {
  try {
    return res.json({
      data: await service.release(
        res.locals.sessionId,
        (res.locals.validatedParams as { id: string }).id,
      ),
    });
  } catch (e) {
    next(e);
  }
}
