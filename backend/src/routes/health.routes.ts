import { workerStatus } from '../services/workerStatus.service';
import { sendSuccess } from '../utils/response';
import { Router } from 'express';
import type { Database } from '../configs/database';
import { createHealthController } from '../controllers/health.controller';
import { createHealthService } from '../services/health.service';

export function createHealthRouter(database: Database) {
  const router = Router();
  const controller = createHealthController(createHealthService(database));
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/', controller.live);
  router.get('/worker', (req,res,next) => { void workerStatus(database.prisma).then(value=>sendSuccess(res.status(value.status==='running'?200:503),value,req.requestId)).catch(next); });
  router.get('/db', controller.ready);
  router.get('/live', controller.live);
  router.get('/ready', controller.ready);
  return router;
}
