import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { ExternalAccessService } from '../services/externalAccess.service';
import type { ObjectStore } from '../providers/storage/local.storage';
import { sendSuccess } from '../utils/response';
import { ApiError } from '../utils/ApiError';
const input = z
  .object({
    token: z.string().min(1).max(100),
    handle: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict();
export function externalAccessController(
  service: ExternalAccessService,
  store: ObjectStore,
) {
  const open: RequestHandler = (req, res, next) => {
    void Promise.resolve()
      .then(async () => {
        const p = input.safeParse(req.body);
        if (!p.success || p.data.handle)
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'Use a valid message link.',
          );
        res.json(await service.open(p.data.token));
      })
      .catch(next);
  };
  const file: RequestHandler = (req, res, next) => {
    void Promise.resolve()
      .then(async () => {
        const p = input.safeParse(req.body);
        if (!p.success || !p.data.handle)
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'Use a valid attachment.',
          );
        const f = await service.file(p.data.token, p.data.handle);
        res.type(f.mime).set('Content-Disposition', 'attachment');
        res.sendFile(
          store.path(f.id),
          { cacheControl: false, dotfiles: 'deny' },
          (error) => {
            if (error)
              next(
                new ApiError(
                  404,
                  'LINK_UNAVAILABLE',
                  'Attachment unavailable.',
                ),
              );
          },
        );
      })
      .catch(next);
  };
  const revoke: RequestHandler = (req, res, next) => {
    void Promise.resolve()
      .then(async () => {
        const id = z.string().uuid().safeParse(req.params.id);
        if (!id.success)
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid delivery.');
        sendSuccess(
          res,
          await service.revoke(req.auth!.userId, id.data),
          req.requestId,
        );
      })
      .catch(next);
  };
  return { open, file, revoke };
}
