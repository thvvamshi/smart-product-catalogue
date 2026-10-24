import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameters', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) },
    });
    return;
  }
  console.error('Unhandled request error:', error instanceof Error ? error.message : 'Unknown error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
};
