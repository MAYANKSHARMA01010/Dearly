import type { RequestHandler } from 'express';
import type { createHealthService } from '../services/health.service';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/response';

export function createHealthController(service: ReturnType<typeof createHealthService>) {
  const live: RequestHandler = (req, res) => {
    sendSuccess(res, { status: 'alive' }, req.requestId);
  };
  const ready: RequestHandler = (req, res, next) => {
    void service.isReady().then((available) => {
      if (!available) return next(new ApiError(503, 'NOT_READY', 'Database is unavailable.'));
      sendSuccess(res, { status: 'ready' }, req.requestId);
    }).catch(next);
  };
  return { live, ready };
}
