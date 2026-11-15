import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.',
        result.error.issues.map((issue) => ({ field: issue.path.join('.'), code: issue.code }))));
    }
    req.body = result.data;
    next();
  };
}
