import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.service';
import { requireSession } from '../middlewares/requireSession';
import { MailboxService } from '../services/mailbox.service';
import { mailboxController } from '../controllers/mailbox.controller';
import { ApiError } from '../utils/ApiError';
export function createMailboxRouter(db?: PrismaClient, auth?: AuthService) {
  const r = Router();
  r.use(['/dashboard', '/mailboxes'], (_q, s, n) => {
    s.set('Cache-Control', 'private, no-store');
    n();
  });
  r.use(['/dashboard', '/mailboxes'], requireSession(auth));
  if (!db) {
    r.use(['/dashboard', '/mailboxes'], (_q, _s, n) =>
      n(new ApiError(503, 'MAILBOX_UNAVAILABLE', 'Mailboxes are unavailable.')),
    );
    return r;
  }
  const c = mailboxController(new MailboxService(db));
  r.get('/dashboard', c.dashboard);
  r.get('/mailboxes', c.list);
  r.get('/mailboxes/owned/:id', c.read);
  r.get('/mailboxes/owned/:id/history', c.history);
  return r;
}
