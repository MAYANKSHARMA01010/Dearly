import type { Request, RequestHandler } from 'express';
import type { AttachmentService } from '../services/attachment.service';
import { attachmentParams, type Reservation } from '../validators/attachment.validators';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/response';

function params(req: Request) {
  const parsed = attachmentParams.safeParse(req.params);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid attachment address.');
  return parsed.data;
}
export function attachmentController(service: AttachmentService) {
  const action = (work: (req: Request, draftId: string, id: string) => Promise<unknown>, status = 200): RequestHandler => (req, res, next) => {
    void Promise.resolve().then(() => { const { draftId, id } = params(req); return work(req, draftId, id ?? ''); })
      .then((data) => sendSuccess(res.status(status), data, req.requestId)).catch(next);
  };
  return {
    list: action((req, draftId) => service.list(req.auth!.userId, draftId)),
    reserve: action((req, draftId) => service.reserve(req.auth!.userId, draftId, req.body as Reservation), 201),
    read: action((req, draftId, id) => service.read(req.auth!.userId, draftId, id)),
    finalize: action((req, draftId, id) => service.finalize(req.auth!.userId, draftId, id)),
    remove: action((req, draftId, id) => service.remove(req.auth!.userId, draftId, id)),
    upload: action(async (req, draftId, id) => {
      if (req.get('content-type')?.split(';')[0] !== 'application/octet-stream' || req.get('content-encoding')) throw new ApiError(415, 'ATTACHMENT_TYPE', 'Upload raw, unencoded file bytes.');
      return service.upload(req.auth!.userId, draftId, id, req);
    }),
    access: action((req, draftId, id) => service.access(req.auth!.userId, draftId, id)),
    content: ((req, res, next) => {
      void Promise.resolve().then(async () => {
        const { draftId, id } = params(req);
        const file = await service.content(req.auth!.userId, draftId, id!);
        res.type(file.mime);
        res.set('Content-Disposition', file.mime === 'application/pdf' || file.mime === 'text/plain' ? 'attachment' : 'inline');
        res.sendFile(file.path, { cacheControl: false, dotfiles: 'deny' }, (error) => { if (error) next(new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment content is unavailable.')); });
      }).catch(next);
    }) as RequestHandler,
  };
}
