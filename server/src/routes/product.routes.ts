import { Router } from 'express';
import { detail, list } from '../controllers/product.controller.js';
import { validateParam, validateQuery } from '../middleware/validate-request.js';
import { productIdSchema, productQuerySchema } from '../schemas/product.schema.js';

export const productRouter = Router();

productRouter.get('/', validateQuery(productQuerySchema), list);
productRouter.get('/:id', validateParam('id', productIdSchema), detail);
