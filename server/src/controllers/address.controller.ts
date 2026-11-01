import type { NextFunction, Request, Response } from "express";
import * as service from "../services/address.service.js";
import type { AddressInput } from "../types/commerce.types.js";
export async function list(_r: Request, res: Response, next: NextFunction) {
  try {
    return res.json({ data: await service.list(res.locals.sessionId) });
  } catch (e) {
    next(e);
  }
}
export async function create(_r: Request, res: Response, next: NextFunction) {
  try {
    return res
      .status(201)
      .json({
        data: await service.create(
          res.locals.sessionId,
          res.locals.validatedBody as AddressInput,
        ),
      });
  } catch (e) {
    next(e);
  }
}
