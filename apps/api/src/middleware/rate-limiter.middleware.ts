import { Request, Response, NextFunction } from "express";
import { redis } from '../cache/redis.js'

interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    keyPrefix: string;
}

const memoryStore = new Map<string, { count: number; expiresAt: number }>();

export const rateLimiter = (config: RateLimitConfig) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const identifier = req.apiKey?.id || (req as any).session?.user?.id || req.ip || req.headers["x-forwarded-for"] || "anonymous";
            const redisKey = `ratelimit:${config.keyPrefix}:${identifier}`;
            const now = Date.now();
            if (redis.status === 'ready') {
                const count = await redis.incr(redisKey);
                if (count === 1) {
                    await redis.pexpire(redisKey, config.windowMs);
                }
                const ttl = await redis.pttl(redisKey);
                res.setHeader("X-RateLimit-Limit", config.maxRequests);
                res.setHeader("X-RateLimit-Remaining", Math.max(0, config.maxRequests - count));

                if (count > config.maxRequests) {
                    res.setHeader("Retry-After", Math.ceil((ttl > 0 ? ttl : config.windowMs) / 1000));
                    res.status(429).json({
                        error: 'Too many requests',
                        message: `Rate limit exceeded (${config.maxRequests} requests per ${config.windowMs / 1000}s)`
                    });
                    return;
                }


            }
            else {
                const record = memoryStore.get(redisKey);
                if (!record || now > record.expiresAt) {
                    memoryStore.set(redisKey, { count: 1, expiresAt: now + config.windowMs })
                }
                else {
                    record.count++;
                    if (record.count > config.maxRequests) {
                        res.status(429).json({
                            error: "Too Many Requests",
                            message: "Rate limit exceeded."
                        });
                        return;
                    }
                }
            }

            next();

        } catch (error) {
            next();
        }
    }
};

export const authRateLimiter = rateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: "auth",
});


export const sdkRateLimiter = rateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 50000,
    keyPrefix: "sdk",
});

export const dashboardRateLimiter = rateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 60,
    keyPrefix: "dashboard",
})