import { Router, raw } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { WahaConfig } from '../configs/env';
import { WahaReceiptService } from '../services/wahaReceipt.service';
import { wahaWebhookController } from '../controllers/wahaWebhook.controller';
export function createWahaWebhookRouter(
  db?: PrismaClient,
  config?: WahaConfig,
) {
  const router = Router();
  router.post(
    '/',
    raw({ type: 'application/json', limit: 65536 }),
    wahaWebhookController(
      db && config ? new WahaReceiptService(db, config) : undefined,
    ),
  );
  return router;
}
