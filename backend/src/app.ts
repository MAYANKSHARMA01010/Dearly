import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from './configs/env';
import type { Database } from './configs/database';
import { errorHandler, notFound } from './middlewares/errorHandler';
import { requestContext } from './middlewares/requestContext';
import { createHealthRouter } from './routes/health.routes';
import { createRootRouter } from './routes/root.routes';
import { ApiError } from './utils/ApiError';
import type { AppLogger } from './utils/logger';

export function createApp(config: AppConfig, database: Database, logger: AppLogger) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use(requestContext(logger));
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      // Native apps and local tools often send no Origin header.
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      callback(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.'));
    },
    exposedHeaders: ['X-Request-Id'],
  }));
  app.use(rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD'].includes(req.method) && /^\/health(?:\/live)?\/?$/i.test(req.path),
    handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again later.')),
  }));
  app.use(express.json({ limit: config.bodyLimitBytes }));
  app.use('/', createRootRouter());
  app.use('/health', createHealthRouter(database));
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
