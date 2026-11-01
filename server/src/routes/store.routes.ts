import { Router } from 'express';
import { detail, inventory, nearby, serviceability } from '../controllers/store.controller.js';
import { validateParam, validateQuery } from '../middleware/validate-request.js';
import { nearbyStoresQuerySchema, serviceabilityQuerySchema, storeIdSchema, storeInventoryQuerySchema } from '../schemas/store.schema.js';

export const storeRouter = Router();
storeRouter.get('/nearby', validateQuery(nearbyStoresQuerySchema), nearby);
storeRouter.get('/serviceability', validateQuery(serviceabilityQuerySchema), serviceability);
storeRouter.get('/:storeId/inventory', validateParam('storeId', storeIdSchema), validateQuery(storeInventoryQuerySchema), inventory);
storeRouter.get('/:storeId', validateParam('storeId', storeIdSchema), detail);
