import express from 'express';
import { createScheduleRouter } from './routes/schedule.routes';
import { createAttachmentRouter } from './routes/attachment.routes';
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
import { AuthService } from './services/auth.service';
import { developmentOtpProvider } from './providers/otp/otp.provider';
import { createAuthRouter } from './routes/auth.routes';
import { createDraftRouter } from './routes/draft.routes';

export function createApp(config: AppConfig, database: Database, logger: AppLogger, authOverride?: AuthService) {
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
  const auth = config.authMode === 'development' && database.prisma && config.otpPepper
    ? new AuthService(database.prisma, config.otpPepper, developmentOtpProvider()) : undefined;
  const activeAuth = config.authMode === 'development' ? authOverride ?? auth : undefined;
  app.use('/auth', createAuthRouter(activeAuth));
  app.use('/messages/schedules', createScheduleRouter(database.prisma, activeAuth, config.otpPepper));
  app.use('/messages/drafts/:draftId/attachments', createAttachmentRouter(config, database.prisma, activeAuth));
  app.use('/messages/drafts', createDraftRouter(database.prisma, activeAuth));
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
