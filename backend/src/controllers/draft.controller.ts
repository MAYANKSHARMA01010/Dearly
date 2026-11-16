import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import type { DraftService } from '../services/draft.service';
import { draftParamsSchema, listDraftsSchema, deleteDraftSchema, type CreateDraftInput, type UpdateDraftInput } from '../validators/draft.validators';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/response';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.',
    result.error.issues.map((issue) => ({ field: issue.path.join('.'), code: issue.code })));
  return result.data;
}

export function draftController(service: DraftService) {
  const action = (work: (req: Request) => Promise<unknown>, status = 200): RequestHandler =>
    (req, res, next) => { void Promise.resolve().then(() => work(req))
      .then((data) => sendSuccess(res.status(status), data, req.requestId)).catch(next); };
  return {
    create: action((req) => service.create(req.auth!.userId, req.body as CreateDraftInput), 201),
    list: action((req) => service.list(req.auth!.userId, parse(listDraftsSchema, req.query))),
    read: action((req) => service.read(req.auth!.userId, parse(draftParamsSchema, req.params).id)),
    update: action((req) => service.update(req.auth!.userId, parse(draftParamsSchema, req.params).id, req.body as UpdateDraftInput)),
    delete: action((req) => service.delete(req.auth!.userId, parse(draftParamsSchema, req.params).id, parse(deleteDraftSchema, req.query).version)),
  };
}
