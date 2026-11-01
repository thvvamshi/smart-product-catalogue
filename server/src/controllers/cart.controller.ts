import type { NextFunction, Request, Response } from "express";
import * as service from "../services/cart.service.js";
import type { CartMutation } from "../types/commerce.types.js";
export async function get(_r: Request, res: Response, next: NextFunction) {
  try {
    return res.json(await service.getCart(res.locals.sessionId));
  } catch (e) {
    next(e);
  }
}
export async function eta(_r: Request, res: Response, next: NextFunction) {
  try {
    const value = res.locals.validatedQuery as { latitude: number; longitude: number };
    return res.json(await service.estimateDelivery(res.locals.sessionId, value.latitude, value.longitude));
  } catch (e) {
    next(e);
  }
}
export async function add(_r: Request, res: Response, next: NextFunction) {
  try {
    return res
      .status(201)
      .json(
        await service.add(
          res.locals.sessionId,
          res.locals.validatedBody as CartMutation,
        ),
      );
  } catch (e) {
    next(e);
  }
}
export async function update(_r: Request, res: Response, next: NextFunction) {
  try {
    return res.json(
      await service.update(
        res.locals.sessionId,
        (res.locals.validatedParams as { itemId: string }).itemId,
        (res.locals.validatedBody as { quantity: number }).quantity,
      ),
    );
  } catch (e) {
    next(e);
  }
}
export async function remove(_r: Request, res: Response, next: NextFunction) {
  try {
    return res.json(
      await service.remove(
        res.locals.sessionId,
        (res.locals.validatedParams as { itemId: string }).itemId,
      ),
    );
  } catch (e) {
    next(e);
  }
}
export async function clear(_r: Request, res: Response, next: NextFunction) {
  try {
    return res.json(await service.clear(res.locals.sessionId));
  } catch (e) {
    next(e);
  }
}
