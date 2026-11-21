import type { RequestHandler } from 'express';
import type { InboxService } from '../services/inbox.service';
import { inboxList, inboxParams } from '../validators/inbox.validators';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/response';
export function inboxController(service: InboxService) {
  const list: RequestHandler = (req, res, next) => {
    void Promise.resolve()
      .then(() => {
        const input = inboxList.safeParse(req.query);
        if (!input.success)
          throw new ApiError(400, 'VALIDATION_ERROR', 'Check inbox filters.');
        return service.list(req.auth!.userId, input.data);
      })
      .then((value) => sendSuccess(res, value, req.requestId))
      .catch(next);
  };
  const read: RequestHandler = (req, res, next) => {
    void Promise.resolve()
      .then(() => {
        const input = inboxParams.safeParse(req.params);
        if (!input.success)
          throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid inbox address.');
        return service.read(req.auth!.userId, input.data.id);
      })
      .then((value) => sendSuccess(res, value, req.requestId))
      .catch(next);
  };
  const access: RequestHandler = (req, res, next) => {
    void Promise.resolve().then(async () => {
      const input = inboxParams.safeParse(req.params);
      if (!input.success || !input.data.attachmentId) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid attachment address.');
      return service.access(req.auth!.userId, input.data.id, input.data.attachmentId);
    }).then(value => sendSuccess(res, value, req.requestId)).catch(next);
  };
  const content: RequestHandler = (req, res, next) => {
    void Promise.resolve()
      .then(async () => {
        const input = inboxParams.safeParse(req.params);
        if (!input.success || !input.data.attachmentId)
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'Invalid attachment address.',
          );
        const file = await service.content(
          req.auth!.userId,
          input.data.id,
          input.data.attachmentId,
        );
        res.type(file.mime);
        res.set(
          'Content-Disposition',
          file.mime === 'text/plain' || file.mime === 'application/pdf'
            ? 'attachment'
            : 'inline',
        );
        res.sendFile(
          file.path,
          { cacheControl: false, dotfiles: 'deny' },
          (error) => {
            if (error)
              next(
                new ApiError(
                  404,
                  'ATTACHMENT_NOT_FOUND',
                  'Attachment content is unavailable.',
                ),
              );
          },
        );
      })
      .catch(next);
  };
  const open: RequestHandler = (req, res, next) => {
    void Promise.resolve()
      .then(() => {
        const p = inboxParams.safeParse(req.params);
        if (
          !p.success ||
          !req.body ||
          typeof req.body !== 'object' ||
          Array.isArray(req.body) ||
          Object.keys(req.body).length
        )
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'Use an empty body to mark this inbox item opened.',
          );
        return service.open(req.auth!.userId, p.data.id);
      })
      .then((value) => sendSuccess(res, value, req.requestId))
      .catch(next);
  };
  return { list, read, content, access, open };
}
