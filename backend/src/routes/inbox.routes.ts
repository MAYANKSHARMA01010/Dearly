import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.service';
import type { AppConfig } from '../configs/env';
import { requireSession } from '../middlewares/requireSession';
import { ApiError } from '../utils/ApiError';
import { InboxService } from '../services/inbox.service';
import { AttachmentService } from '../services/attachment.service';
import { LocalStorage } from '../providers/storage/local.storage';
import { inboxController } from '../controllers/inbox.controller';
export function createInboxRouter(
  config: AppConfig,
  db?: PrismaClient,
  auth?: AuthService,
) {
  const r = Router();
  r.use((_q, s, n) => {
    s.set('Cache-Control', 'private, no-store');
    n();
  });
  r.use(requireSession(auth));
  if (!db) {
    r.use((_q, _s, n) =>
      n(new ApiError(503, 'INBOX_UNAVAILABLE', 'Inbox is unavailable.')),
    );
    return r;
  }
  const c = inboxController(
    new InboxService(
      db,
      new AttachmentService(
        db,
        new LocalStorage(config.storageRoot),
        config.ffprobePath,
      ),
    ),
  );
  r.get('/', c.list);
  r.get('/:id', c.read);
  r.get('/:id/attachments/:attachmentId/content', c.content);
  return r;
}
