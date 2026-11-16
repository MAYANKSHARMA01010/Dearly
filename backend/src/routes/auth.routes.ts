import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthService } from '../services/auth.service';
import { authController } from '../controllers/auth.controller';
import { validateBody } from '../middlewares/validateBody';
import { profileSchema, refreshSchema, requestOtpSchema, resendOtpSchema, verifyOtpSchema } from '../validators/auth.validators';
import { ApiError } from '../utils/ApiError';

export function createAuthRouter(service?: AuthService) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use((_req, _res, next) => {
    if (!service) return next(new ApiError(503, 'AUTH_DISABLED', 'Authentication is not enabled.'));
    next();
  });
  if (!service) return router;
  // Supplement durable per-phone throttles. In-memory IP budget is per process.
  router.use(rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, 'AUTH_RATE_LIMITED', 'Too many attempts. Try again later.')),
  }));
  const c = authController(service);
  router.post('/otp/request', validateBody(requestOtpSchema), c.request);
  router.post('/otp/resend', validateBody(resendOtpSchema), c.resend);
  router.post('/otp/verify', validateBody(verifyOtpSchema), c.verify);
  router.post('/refresh', validateBody(refreshSchema), c.refresh);
  router.post('/logout', c.requireSession, c.logout);
  router.get('/me', c.requireSession, c.profile);
  router.patch('/me', c.requireSession, validateBody(profileSchema), c.updateProfile);
  return router;
}
