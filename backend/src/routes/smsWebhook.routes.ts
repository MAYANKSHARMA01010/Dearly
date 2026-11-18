import { Router, raw } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { SmsGateConfig } from '../configs/env';
import { SmsReceiptService } from '../services/smsReceipt.service';
import { smsWebhookController } from '../controllers/smsWebhook.controller';
export function createSmsWebhookRouter(db?: PrismaClient, config?: SmsGateConfig) {
  const router = Router();
  router.post('/', raw({ type: 'application/json', limit: 65536 }), smsWebhookController(db && config ? new SmsReceiptService(db, config) : undefined));
  return router;
}
