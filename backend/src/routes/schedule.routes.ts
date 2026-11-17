import type { WahaConfig } from '../configs/env';
import { WahaProvider } from '../providers/whatsapp/waha.provider';
import { workerStatus } from '../services/workerStatus.service';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.service';
import {
  ScheduleService,
  scheduleCapabilities,
} from '../services/schedule.service';
import { requireSession } from '../middlewares/requireSession';
import { scheduleController } from '../controllers/schedule.controller';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/response';
export function createScheduleRouter(
  prisma?: PrismaClient,
  auth?: AuthService,
  secret?: string,
  emailEnabled = false,
  emailLocalOnly = false,
  whatsapp?: WahaConfig,
  externalAccessEnabled = false,
) {
  const router = Router();
  router.use((_r, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireSession(auth));
  if (!prisma || !secret) {
    router.use((_r, _s, next) =>
      next(
        new ApiError(
          503,
          'SCHEDULES_UNAVAILABLE',
          'Scheduling is unavailable.',
        ),
      ),
    );
    return router;
  }
  const c = scheduleController(
    new ScheduleService(
      prisma,
      secret,
      undefined,
      emailEnabled,
      Boolean(whatsapp && externalAccessEnabled),
    ),
  );
  router.get('/capabilities', (req, res, next) => {
    void Promise.all([
      workerStatus(prisma),
      whatsapp
        ? new WahaProvider(whatsapp).readiness()
        : Promise.resolve('DISABLED'),
    ])
      .then(([worker, whatsappStatus]) =>
        sendSuccess(
          res,
          {
            ...scheduleCapabilities,
            emailLocalOnly,
            externalLocalOnly: emailLocalOnly,
            whatsappStatus,
            channels: scheduleCapabilities.channels.map((c) =>
              c.channel === 'EMAIL'
                ? { channel: 'EMAIL', available: emailEnabled, mode: 'SMTP' }
                : c.channel === 'WHATSAPP'
                  ? {
                      channel: 'WHATSAPP',
                      available: Boolean(whatsapp && externalAccessEnabled),
                      mode: 'WAHA_CORE',
                    }
                  : c,
            ),
            worker,
          },
          req.requestId,
        ),
      )
      .catch(next);
  });
  router.get('/', c.list);
  router.get('/:id', c.read);
  router.patch('/:id', c.edit);
  router.post('/:id/preview', c.preview);
  router.post('/:id/confirm', c.confirm);
  router.post('/:id/reschedule/preview', c.reschedulePreview);
  router.post('/:id/reschedule', c.reschedule);
  router.post('/:id/cancel', c.cancel);
  router.post('/:id/reopen', c.reopen);
  return router;
}
