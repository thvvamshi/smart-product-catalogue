import type { NextFunction, Request, Response } from "express";

export function requireStoreOperator(req: Request, res: Response, next: NextFunction) {
  const key = req.header("X-Store-Operator");
  if (!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
    res.status(401).json({ error: { code: "STORE_AUTH_REQUIRED", message: "An authorized store operator is required" } });
    return;
  }
  res.locals.operatorKey = key;
  next();
}
