import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import {
  scheduleChoice,
  scheduleConfirm,
  rescheduleChoice,
  rescheduleConfirm,
  scheduleEdit,
  scheduleVersion,
  scheduleParams,
  scheduleList,
} from '../validators/schedule.validators';
import type { ScheduleService } from '../services/schedule.service';
import { sendSuccess } from '../utils/response';
import { ApiError } from '../utils/ApiError';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_ERROR', 'Check the scheduling fields.');
  return result.data;
}
export function scheduleController(service: ScheduleService) {
  const action =
    (work: (req: Request, id: string) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
      void Promise.resolve()
        .then(() => work(req, parse(scheduleParams, req.params).id))
        .then((data) => sendSuccess(res, data, req.requestId))
        .catch(next);
    };
  const list: RequestHandler = (req, res, next) => {
    void Promise.resolve()
      .then(() =>
        service.list(req.auth!.userId, parse(scheduleList, req.query)),
      )
      .then((data) => sendSuccess(res, data, req.requestId))
      .catch(next);
  };
  return {
    list,
    preview: action((r, id) =>
      service.preview(r.auth!.userId, id, parse(scheduleChoice, r.body)),
    ),
    confirm: action((r, id) =>
      service.confirm(r.auth!.userId, id, parse(scheduleConfirm, r.body)),
    ),
    reschedulePreview: action((r, id) =>
      service.preview(
        r.auth!.userId,
        id,
        parse(rescheduleChoice, r.body),
        true,
      ),
    ),
    reschedule: action((r, id) =>
      service.confirm(
        r.auth!.userId,
        id,
        parse(rescheduleConfirm, r.body),
        true,
      ),
    ),
    read: action((r, id) => service.read(r.auth!.userId, id)),
    edit: action((r, id) =>
      service.edit(r.auth!.userId, id, parse(scheduleEdit, r.body)),
    ),
    cancel: action((r, id) =>
      service.cancel(
        r.auth!.userId,
        id,
        parse(scheduleVersion, r.body).version,
      ),
    ),
    reopen: action((r, id) =>
      service.reopen(
        r.auth!.userId,
        id,
        parse(scheduleVersion, r.body).version,
      ),
    ),
  };
}
