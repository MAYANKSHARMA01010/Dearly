import { Router } from 'express';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../configs/env';
import type { AuthService } from '../services/auth.service';
import { ExternalAccessService } from '../services/externalAccess.service';
import { externalAccessController } from '../controllers/externalAccess.controller';
import { createObjectStore } from '../providers/storage/createObjectStore';
import { requireSession } from '../middlewares/requireSession';
import { externalViewer, externalScript } from '../views/externalViewer';
import { ApiError } from '../utils/ApiError';
export function createExternalAccessRouter(
  config: AppConfig,
  db?: PrismaClient,
  auth?: AuthService,
) {
  const router = Router();
  router.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' blob:; media-src blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
    });
    if (
      req.headers.origin &&
      req.headers.origin !== config.externalAccess?.publicUrl &&
      !(
        req.path.startsWith('/deliveries/') &&
        config.allowedOrigins.includes(req.headers.origin)
      )
    )
      return next(
        new ApiError(
          403,
          'ORIGIN_NOT_ALLOWED',
          'Request origin is not allowed.',
        ),
      );
    next();
  });
  router.get('/', (_req, res) => res.type('html').send(externalViewer()));
  router.get('/logo.png', (_req, res) => res.type('png').sendFile(join(__dirname, '../../public/dearly-logo.png')));
  router.get('/viewer.js', (_req, res) => res.type('js').send(externalScript));
  if (!db || !config.externalAccess) {
    router.use((_req, _res, next) =>
      next(
        new ApiError(503, 'EMAIL_UNAVAILABLE', 'Email access is unavailable.'),
      ),
    );
    return router;
  }
  const c = externalAccessController(
    new ExternalAccessService(db, config.externalAccess.secret),
    createObjectStore(config),
  );
  router.post('/open', c.open);
  router.post('/file', c.file);
  router.post('/deliveries/:id/revoke', requireSession(auth), c.revoke);
  return router;
}
