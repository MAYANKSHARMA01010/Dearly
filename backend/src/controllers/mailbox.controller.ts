import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { MailboxService } from '../services/mailbox.service';
import {
  mailboxQuery,
  ownedMessageParams,
  historyQuery,
} from '../validators/mailbox.validators';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/response';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Check mailbox filters or message address.',
    );
  return r.data;
}
export function mailboxController(service: MailboxService) {
  const action =
    (work: (req: Request) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
      void Promise.resolve()
        .then(() => work(req))
        .then((value) => sendSuccess(res, value, req.requestId))
        .catch(next);
    };
  return {
    dashboard: action((r) => service.dashboard(r.auth!.userId)),
    list: action((r) =>
      service.list(r.auth!.userId, parse(mailboxQuery, r.query)),
    ),
    read: action((r) =>
      service.read(r.auth!.userId, parse(ownedMessageParams, r.params).id),
    ),
    history: action((r) =>
      service.history(
        r.auth!.userId,
        parse(ownedMessageParams, r.params).id,
        parse(historyQuery, r.query),
      ),
    ),
  };
}
