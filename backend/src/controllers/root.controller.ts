import type { RequestHandler } from 'express';
import { sendSuccess } from '../utils/response';

export const apiInfo: RequestHandler = (req, res) => {
  sendSuccess(res, {
    name: 'Dearly API',
    status: 'running',
    endpoints: {
      docs: '/api/docs',
      openapi: '/api/openapi.json',
      health: '/health',
      databaseHealth: '/health/db',
      liveness: '/health/live',
      readiness: '/health/ready',
      workerHealth: '/health/worker',
    },
  }, req.requestId);
};
