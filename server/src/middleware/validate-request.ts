import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export function validateQuery(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    try {
      res.locals.validatedQuery = schema.parse(req.query);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateParam(name: string, schema: ZodType): RequestHandler {
  return (req, res, next) => {
    try {
      res.locals.validatedParams = {
        ...(res.locals.validatedParams as Record<string, unknown> | undefined),
        [name]: schema.parse(req.params[name]),
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
