import { Router, type RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../configs/env';
import { createObjectStore } from '../providers/storage/createObjectStore';
import { OperationsService } from '../services/operations.service';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/response';
export function operationsCredential(expected?: string): RequestHandler {
    return (req, _res, next) => {
        if (!expected)
            return next(new ApiError(503, 'OPERATIONS_DISABLED', 'This operations endpoint is disabled.'));
        const provided = req.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
        if (!provided || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected)))
            return next(new ApiError(401, 'UNAUTHORIZED', 'A dedicated operations credential is required.'));
        next();
    };
}
export function createOperationsRouter(config: AppConfig, db?: PrismaClient, override?: Pick<OperationsService, 'maintenance' | 'status'>) {
    const router = Router();
    const service = override ?? (db ? new OperationsService(db, config, createObjectStore(config)) : undefined);
    router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
    const enabled: RequestHandler = (_req, _res, next) => service ? next() : next(new ApiError(503, 'OPERATIONS_DISABLED', 'Operations storage is unavailable.'));
    router.get('/status', operationsCredential(config.monitoringToken), rateLimit({ windowMs: 60000, limit: 6, standardHeaders: 'draft-7', legacyHeaders: false }), enabled, (req, res, next) => {
        void service!.status().then(value => sendSuccess(res, value, req.requestId)).catch(next);
    });
    router.post('/maintenance', operationsCredential(config.operationsToken), rateLimit({ windowMs: 3600000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false }), enabled, (req, res, next) => {
        const id = z.string().uuid().safeParse(req.get('X-Operations-Run'));
        if (!id.success || !z.object({}).strict().safeParse(req.body).success)
            return next(new ApiError(400, 'VALIDATION_ERROR', 'Use an empty body and a UUID X-Operations-Run header.'));
        void service!.maintenance(id.data).then(value => sendSuccess(res, value, req.requestId)).catch(next);
    });
    return router;
}
