import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { productRouter } from './product.routes.js';
import { storeRouter } from './store.routes.js';
import { discoveryRouter } from './discovery.routes.js';
import { addressRouter } from './address.routes.js';
import { cartRouter } from './cart.routes.js';
import { checkoutRouter } from './checkout.routes.js';
import { orderRouter, storeOrderRouter } from './order.routes.js';
import { deliveryAgentRouter, dispatchRouter, agentRouter, customerDeliveryRouter } from './delivery.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/stores', storeRouter);
apiRouter.use('/discovery', discoveryRouter);
apiRouter.use('/addresses', addressRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/checkout', checkoutRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/store-orders', storeOrderRouter);
apiRouter.use('/delivery-agents', deliveryAgentRouter);
apiRouter.use('/dispatch', dispatchRouter);
apiRouter.use('/agent', agentRouter);
apiRouter.use(customerDeliveryRouter);
