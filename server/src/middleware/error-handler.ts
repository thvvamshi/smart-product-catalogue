import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { CommerceError } from '../utils/commerce-error.js';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameters', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) },
    });
    return;
  }
  if(error instanceof CommerceError){res.status(error.status).json({error:{code:error.code,message:error.message,...(error.issues.length?{issues:error.issues}:{})}});return}
  console.error('Unhandled request error:', error instanceof Error ? error.message : 'Unknown error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
};
