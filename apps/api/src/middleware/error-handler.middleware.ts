import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
    return;
  }

  // Postgres connection failures → 503 Service Unavailable
  if (isDatabaseError(err)) {
    console.error('[GracefulDegradation] Database connection failure:', err.message);
    res.setHeader('Retry-After', '30');
    res.status(503).json({
      error: {
        message: 'Service temporarily unavailable. Please retry after 30 seconds.',
        code: 'SERVICE_UNAVAILABLE',
      },
    });
    return;
  }

  console.error('Unexpected error:', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  });
};

/**
 * Identifies Postgres connection failures, crashes, or shutdowns
 */
function isDatabaseError(error: any): boolean {
  if (!error) return false;
  const code = error.code;
  const msg = String(error.message || '');
  return (
    code === '57P01' ||        // admin_shutdown
    code === '57P02' ||        // crash_shutdown
    code === '57P03' ||        // cannot_connect_now
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    msg.includes('Connection terminated') ||
    msg.includes('connect ECONNREFUSED')
  );
}
