import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { AppLogger } from '../utils/logger';

export function requestContext(logger: AppLogger): RequestHandler {
  return (req, res, next) => {
    // Generate our own ID; untrusted headers cannot forge IDs in logs.
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const started = performance.now();
    res.on('finish', () => {
      logger.info('http.request', {
        requestId: req.requestId,
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - started),
      });
    });
    next();
  };
}
