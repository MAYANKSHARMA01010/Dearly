import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.service';
import type { AppConfig } from '../configs/env';
import { requireSession } from '../middlewares/requireSession';
import { validateBody } from '../middlewares/validateBody';
import { reserveAttachment } from '../validators/attachment.validators';
import { attachmentController } from '../controllers/attachment.controller';
import { AttachmentService } from '../services/attachment.service';
import { createObjectStore } from '../providers/storage/createObjectStore';
import { ApiError } from '../utils/ApiError';
export function createAttachmentRouter(config: AppConfig, prisma?: PrismaClient, auth?: AuthService) {
  const router = Router({ mergeParams: true });
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.use(requireSession(auth));
  if (!prisma) { router.use((_req, _res, next) => next(new ApiError(503, 'MEDIA_UNAVAILABLE', 'Attachment storage is unavailable.'))); return router; }
  const c = attachmentController(new AttachmentService(prisma, createObjectStore(config), config.ffprobePath));
  router.get('/', c.list); router.post('/', validateBody(reserveAttachment), c.reserve);
  router.get('/:id', c.read); router.put('/:id/content', c.upload); router.get('/:id/content/access', c.access); router.get('/:id/content', c.content);
  router.post('/:id/finalize', c.finalize); router.delete('/:id', c.remove);
  return router;
}
