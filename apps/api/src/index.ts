import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { pool } from './db/pool.js';
import { redis } from './cache/redis.js';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.middleware.js';
import environmentRouter from './routes/environment.routes.js';
import flagRouter from './routes/flag.routes.js';
import sdkRouter from './routes/sdk.routes.js';
import apiKeyRouter from './routes/api-key.routes.js';
import auditRouter from './routes/audit.routes.js';
import staleRouter from './routes/stale-flags.routes.js';
import orgRouter from './routes/org.routes.js';
import { authRateLimiter } from './middleware/rate-limiter.middleware.js';
import { metricsWatcher } from './jobs/metrics-watcher.js';
import { staleFlagDetector } from './jobs/stale-flag-detector.js';
import metricsRouter from './routes/metrics.routes.js';

export const app = express();

// Security and performance middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Critical: Better Auth catch-all handler MUST be mounted before express.json()
app.all('/api/auth/*', toNodeHandler(auth));
app.use("/api/auth", authRateLimiter);


// Body parsing for application API routes
app.use(express.json());

app.use('/api/organizations', orgRouter);
app.use('/api/environments', environmentRouter);
app.use('/api/flags', flagRouter);
app.use('/api/api-keys', apiKeyRouter);
app.use('/api/audit', auditRouter);
app.use('/sdk', sdkRouter);
app.use('/api/stale-flags', staleRouter);
app.use('/api/metrics', metricsRouter);

// Health Check Endpoint
app.get('/health', async (_req, res) => {
  let dbStatus = 'down';
  let redisStatus = 'down';

  try {
    const result = await pool.query('SELECT 1 as ok');
    if (result.rows[0]?.ok === 1) dbStatus = 'up';
  } catch (err) {
    dbStatus = 'error';
  }

  try {
    const ping = await redis.ping();
    if (ping === 'PONG') redisStatus = 'up';
  } catch (err) {
    redisStatus = 'error';
  }

  const status = dbStatus === 'up' && redisStatus === 'up' ? 'ok' : 'degraded';

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
    timestamp: new Date().toISOString(),
  });
});

// Global Error Handler
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  const port = config.PORT;

  const server = app.listen(port, () => {
    console.log(`🚀 API Server listening on port ${port}`);
    metricsWatcher.startPeriodicWatch(30000); // Check every 30 seconds
    staleFlagDetector.startPreiodicScan(24 * 60 * 60 * 1000, 30);
  });

  // Graceful Shutdown
  const shutdown = async () => {
    console.log('🛑 Shutting down API server...');
    server.close(async () => {
      metricsWatcher.stopPeriodicWatch();
      staleFlagDetector.stopPeriodicScan();
      await pool.end();
      await redis.quit();
      console.log('✔ All connections closed gracefully.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

