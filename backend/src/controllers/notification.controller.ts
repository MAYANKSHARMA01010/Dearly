import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { NotificationService } from '../services/notification.service';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/response';
import {
  deviceInput,
  notificationId,
  notificationQuery,
  preferencesInput,
} from '../validators/notification.validators';
export function notificationController(
  service: NotificationService,
  projectId?: string,
) {
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const r = schema.safeParse(value);
    if (!r.success)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Check notification settings.',
      );
    return r.data;
  };
  const action =
    (work: (r: Request) => Promise<unknown>): RequestHandler =>
    (r, s, n) => {
      void Promise.resolve()
        .then(() => work(r))
        .then((v) => sendSuccess(s, v, r.requestId))
        .catch(n);
    };
  return {
    list: action((r) =>
      service.list(r.auth!.userId, parse(notificationQuery, r.query).cursor),
    ),
    resolve: action((r) =>
      service.resolve(r.auth!.userId, parse(notificationId, r.params).id),
    ),
    read: action((r) =>
      service.markRead(r.auth!.userId, parse(notificationId, r.params).id),
    ),
    preferences: action((r) => service.preferences(r.auth!.userId)),
    update: action((r) =>
      service.update(r.auth!.userId, parse(preferencesInput, r.body)),
    ),
    register: action((r) => {
      const d = parse(deviceInput, r.body);
      if (d.projectId !== projectId)
        throw new ApiError(
          503,
          'PUSH_UNAVAILABLE',
          'Push project is not configured.',
        );
      return service.register(r.auth!.userId, r.auth!.sessionId, {
        id: d.id,
        token: d.token,
        platform: d.platform,
      });
    }),
    remove: action((r) =>
      service.remove(
        r.auth!.userId,
        r.auth!.sessionId,
        parse(notificationId, r.params).id,
      ),
    ),
  };
}
