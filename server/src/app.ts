import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { apiRouter } from './routes/index.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL.split(',').map((value) => value.trim()), methods: ['GET'] }));
app.use(express.json({ limit: '16kb' }));
app.use('/api', apiRouter);
app.use(notFound);
app.use(errorHandler);
