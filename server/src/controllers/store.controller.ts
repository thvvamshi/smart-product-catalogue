import type { NextFunction, Request, Response } from 'express';
import { checkServiceability, getStore, listNearbyStores, listStoreInventory } from '../services/store.service.js';
import type { NearbyStoreQuery, ServiceabilityQuery, StoreInventoryQuery } from '../types/store.types.js';

export async function nearby(_req: Request, res: Response, next: NextFunction) {
  try { return res.status(200).json(await listNearbyStores(res.locals.validatedQuery as NearbyStoreQuery)); }
  catch (error) { return next(error); }
}
export async function serviceability(_req: Request, res: Response, next: NextFunction) {
  try { return res.status(200).json(await checkServiceability(res.locals.validatedQuery as ServiceabilityQuery)); }
  catch (error) { return next(error); }
}
export async function detail(_req: Request, res: Response, next: NextFunction) {
  try {
    const store = await getStore((res.locals.validatedParams as { storeId: string }).storeId);
    if (!store) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Store not found' } });
    return res.status(200).json({ data: store });
  } catch (error) { return next(error); }
}
export async function inventory(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listStoreInventory((res.locals.validatedParams as { storeId: string }).storeId, res.locals.validatedQuery as StoreInventoryQuery);
    if (!result) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Store not found' } });
    return res.status(200).json(result);
  } catch (error) { return next(error); }
}
