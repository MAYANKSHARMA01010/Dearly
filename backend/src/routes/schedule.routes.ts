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
  const c = scheduleController(new ScheduleService(prisma, secret));
  router.get('/capabilities', (req, res) =>
    sendSuccess(res, scheduleCapabilities, req.requestId),
  );
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
