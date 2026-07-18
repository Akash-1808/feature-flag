import { redis } from "../cache/redis.js";
import { pool } from "../db/pool.js";
import { Request, Response, NextFunction } from "express";

declare global {
    namespace Express {
        interface Request {
            isRedisDegraded?: boolean;
        }
    }
}

export const gracefulDegradationMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (redis.status !== 'ready' && redis.status !== 'connect' && redis.status !== 'connecting') {
        req.isRedisDegraded = true;
    }
    try {
        next();
    } catch (err) {
        if (isDatabaseError(err)) {
            res.setHeader('Retry-After', '30');
            res.status(503).json({
                error: {
                    code: 'SERVICE_UNAVAILABLE',
                    message: 'Database service is temporarily unavailable. Please retry after 30 seconds.'
                }
            });
            return;
        }
        next(err);
    }
}


/**
 * Helper to identify Postgres connection failures, crashes, or shutdowns
 */
function isDatabaseError(error: any): boolean {
    if (!error) return false;
    const code = error.code;
    const msg = String(error.message || '');
    return (
        code === '57P01' || // admin_shutdown
        code === '57P02' || // crash_shutdown
        code === '57P03' || // cannot_connect_now
        code === 'ECONNREFUSED' ||
        code === 'ENOTFOUND' ||
        msg.includes('Connection terminated') ||
        msg.includes('connect ECONNREFUSED') ||
        msg.includes('Client has already been connected')
    );
}