import { createOperationsRouter } from './routes/operations.routes';
import { createEmailVerificationRouter } from './routes/emailVerification.routes';
import { createNotificationRouter } from './routes/notification.routes';
import { createSmsWebhookRouter } from './routes/smsWebhook.routes';
import { createWahaWebhookRouter } from './routes/wahaWebhook.routes';
import { createExternalAccessRouter } from './routes/externalAccess.routes';
import { createMailboxRouter } from './routes/mailbox.routes';
import { createInboxRouter } from './routes/inbox.routes';
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
import { whatsappOtpProvider } from './providers/otp/whatsappOtp.provider';
import { WahaProvider } from './providers/whatsapp/waha.provider';
import { createAuthRouter } from './routes/auth.routes';
import { createDraftRouter } from './routes/draft.routes';

export function createApp(
  config: AppConfig,
  database: Database,
  logger: AppLogger,
  authOverride?: AuthService,
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use(requestContext(logger));
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Native apps and local tools often send no Origin header.
        if (
          !origin ||
          config.allowedOrigins.includes(origin) ||
          config.externalAccess?.publicUrl === origin
        )
          return callback(null, true);
        callback(
          new ApiError(
            403,
            'ORIGIN_NOT_ALLOWED',
            'Request origin is not allowed.',
          ),
        );
      },
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (req) =>
        ['GET', 'HEAD'].includes(req.method) &&
        /^\/health(?:\/live)?\/?$/i.test(req.path),
      handler: (_req, _res, next) =>
        next(
          new ApiError(
            429,
            'RATE_LIMITED',
            'Too many requests. Try again later.',
          ),
        ),
    }),
  );
  app.use(
    '/webhooks/waha',
    createWahaWebhookRouter(database.prisma, config.whatsapp),
  );
  app.use('/webhooks/smsgate', createSmsWebhookRouter(database.prisma, config.sms));
  app.use(express.json({ limit: config.bodyLimitBytes }));
  app.use('/', createRootRouter());
  app.use('/internal/operations', createOperationsRouter(config, database.prisma));
  app.use('/health', createHealthRouter(database));
  const auth =
    config.authMode !== 'disabled' &&
    database.prisma &&
    config.otpPepper &&
    (config.authMode === 'development' || config.whatsapp)
      ? new AuthService(
          database.prisma,
          config.otpPepper,
          config.authMode === 'whatsapp' && config.whatsapp
            ? whatsappOtpProvider(
                new WahaProvider(config.whatsapp),
                config.whatsappOtpDailyLimit ?? 20,
              )
            : developmentOtpProvider(),
          undefined,
          undefined,
          logger,
        )
      : undefined;
  const activeAuth =
    config.authMode !== 'disabled' ? (authOverride ?? auth) : undefined;
  app.use('/auth/email', createEmailVerificationRouter(config, database.prisma, activeAuth));
  app.use('/auth', createAuthRouter(activeAuth));
  app.use('/notifications', createNotificationRouter(database.prisma, activeAuth, config.push?.projectId));
  app.use(
    '/external',
    createExternalAccessRouter(config, database.prisma, activeAuth),
  );
  app.use('/messages', createMailboxRouter(database.prisma, activeAuth));
  app.use(
    '/messages/inbox',
    createInboxRouter(config, database.prisma, activeAuth),
  );
  app.use(
    '/messages/schedules',
    createScheduleRouter(
      database.prisma,
      activeAuth,
      config.otpPepper,
      Boolean(config.email && config.externalAccess),
      Boolean(
        config.externalAccess &&
        ['localhost', '127.0.0.1', '[::1]'].includes(
          new URL(config.externalAccess.publicUrl).hostname,
        ),
      ),
      config.whatsapp,
      Boolean(config.externalAccess),
      config.sms,
      config.externalAccess?.publicUrl,
    ),
  );
  app.use(
    '/messages/drafts/:draftId/attachments',
    createAttachmentRouter(config, database.prisma, activeAuth),
  );
  app.use('/messages/drafts', createDraftRouter(database.prisma, activeAuth));
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
