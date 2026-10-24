import type { NextFunction, Request, Response } from 'express';
import { getProduct, listProducts } from '../services/product.service.js';
import type { ProductQuery } from '../types/product.types.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = res.locals.validatedQuery as ProductQuery;
    return res.status(200).json(await listProducts(query));
  } catch (error) {
    return next(error);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const params = res.locals.validatedParams as { id: string };
    const product = await getProduct(params.id);
    if (!product) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
    return res.status(200).json({ data: product });
  } catch (error) {
    return next(error);
  }
}
