import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.service';
import type { AppConfig } from '../configs/env';
import { requireSession } from '../middlewares/requireSession';
import { ApiError } from '../utils/ApiError';
import { InboxService } from '../services/inbox.service';
import { AttachmentService } from '../services/attachment.service';
import { createObjectStore } from '../providers/storage/createObjectStore';
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
        createObjectStore(config),
        config.ffprobePath,
      ),
    ),
  );
  r.get('/', c.list);
  r.get('/:id', c.read);
  r.post('/:id/open', c.open);
  r.get('/:id/attachments/:attachmentId/content/access', c.access);
  r.get('/:id/attachments/:attachmentId/content', c.content);
  return r;
}
