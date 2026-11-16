import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.service';
import { DraftService } from '../services/draft.service';
import { requireSession } from '../middlewares/requireSession';
import { validateBody } from '../middlewares/validateBody';
import { createDraftSchema, updateDraftSchema } from '../validators/draft.validators';
import { draftController } from '../controllers/draft.controller';
import { ApiError } from '../utils/ApiError';

export function createDraftRouter(prisma?: PrismaClient, auth?: AuthService) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(requireSession(auth));
  if (!prisma) { router.use((_req, _res, next) => next(new ApiError(503, 'DRAFTS_UNAVAILABLE', 'Draft storage is unavailable.'))); return router; }
  const c = draftController(new DraftService(prisma));
  router.post('/', validateBody(createDraftSchema), c.create);
  router.get('/', c.list);
  router.get('/:id', c.read);
  router.patch('/:id', validateBody(updateDraftSchema), c.update);
  router.delete('/:id', c.delete);
  return router;
}
