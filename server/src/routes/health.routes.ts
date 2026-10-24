import { Router } from 'express';
import { pool } from '../db/pool.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => res.status(200).json({ status: 'ok' }));
healthRouter.get('/db', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error) {
    return next(error);
  }
});
