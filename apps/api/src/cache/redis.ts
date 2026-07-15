import { Redis } from 'ioredis';
import { config } from '../config.js';

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  console.error('Redis Client Error:', err);
});
