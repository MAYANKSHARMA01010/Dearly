import { Router } from 'express';
import type { Database } from '../configs/database';
import { createHealthController } from '../controllers/health.controller';
import { createHealthService } from '../services/health.service';

export function createHealthRouter(database: Database) {
  const router = Router();
  const controller = createHealthController(createHealthService(database));
  router.get('/live', controller.live);
  router.get('/ready', controller.ready);
  return router;
}
