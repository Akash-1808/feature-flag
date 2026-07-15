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

export const app = express();

// Security and performance middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Critical: Better Auth catch-all handler MUST be mounted before express.json()
app.all('/api/auth/*', toNodeHandler(auth));

// Body parsing for application API routes
app.use(express.json());

app.use('/api/environments', environmentRouter);
app.use('/api/flags', flagRouter);

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
  });

  // Graceful Shutdown
  const shutdown = async () => {
    console.log('🛑 Shutting down API server...');
    server.close(async () => {
      await pool.end();
      await redis.quit();
      console.log('✔ All connections closed gracefully.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

