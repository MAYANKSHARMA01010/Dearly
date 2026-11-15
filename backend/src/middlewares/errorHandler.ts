import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import type { AppLogger } from '../utils/logger';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found.'));
};

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const type = typeof error === 'object' && error !== null && 'type' in error
    ? error.type : undefined;
  if (type === 'entity.too.large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit.');
  }
  if (type === 'charset.unsupported' || type === 'encoding.unsupported') {
    return new ApiError(415, 'UNSUPPORTED_ENCODING', 'Request encoding is not supported.');
  }
  if (type === 'entity.parse.failed' || type === 'request.aborted' || type === 'request.size.invalid') {
    return new ApiError(400, 'INVALID_BODY', 'Request body is invalid.');
  }
  return new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

export function errorHandler(logger: AppLogger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) return next(error);
    const safe = normalizeError(error);
    if (safe.statusCode >= 500) {
      // Raw errors may include credentials, queries, or message content.
      logger.error('http.error', { requestId: req.requestId, code: safe.code });
    }
    res.status(safe.statusCode).json({
      success: false,
      error: { code: safe.code, message: safe.message, ...(safe.details && { details: safe.details }) },
      requestId: req.requestId,
    });
  };
}
