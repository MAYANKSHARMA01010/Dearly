import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.service';
import { requireSession } from '../middlewares/requireSession';
import { ApiError } from '../utils/ApiError';
import { NotificationService } from '../services/notification.service';
import { notificationController } from '../controllers/notification.controller';
export function createNotificationRouter(
  db?: PrismaClient,
  auth?: AuthService,
  projectId?: string,
) {
  const r = Router();
  r.use((_q, s, n) => {
    s.set('Cache-Control', 'private, no-store');
    n();
  });
  r.use(requireSession(auth));
  if (!db) {
    r.use((_q, _s, n) =>
      n(
        new ApiError(
          503,
          'NOTIFICATIONS_UNAVAILABLE',
          'Notifications unavailable.',
        ),
      ),
    );
    return r;
  }
  const c = notificationController(new NotificationService(db), projectId);
  r.get('/', c.list);
  r.post('/:id/read', c.read);
  r.get('/preferences', c.preferences);
  r.patch('/preferences', c.update);
  r.put('/devices', c.register);
  r.delete('/devices/:id', c.remove);
  r.get('/:id', c.resolve);
  return r;
}
