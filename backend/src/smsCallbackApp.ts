import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';
import type { SmsGateConfig } from './configs/env';
import type { AppLogger } from './utils/logger';
import { requestContext } from './middlewares/requestContext';
import { errorHandler, notFound } from './middlewares/errorHandler';
import { createSmsWebhookRouter } from './routes/smsWebhook.routes';

/** Development receiver for a callback-only tunnel. Never mount the main app. */
export function createSmsCallbackApp(db: PrismaClient, config: SmsGateConfig, logger: AppLogger) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('trust proxy');
  app.use(requestContext(logger));
  app.use(helmet());
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  // One shared loopback bucket is intentional; forwarded IP headers stay untrusted.
  app.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, validate: { xForwardedForHeader: false } }));
  // Exact method/path only; query strings and every other route are unavailable.
  app.use((req, res, next) => {
    if (req.method !== 'POST' || req.originalUrl !== '/webhooks/smsgate') return notFound(req, res, next);
    next();
  });
  app.use('/webhooks/smsgate', createSmsWebhookRouter(db, config));
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
