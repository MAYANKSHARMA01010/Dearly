import type { RequestHandler } from 'express';
import type { SmsReceiptService } from '../services/smsReceipt.service';
import { ApiError } from '../utils/ApiError';
export function smsWebhookController(service?: SmsReceiptService): RequestHandler {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!service) return next(new ApiError(503, 'SMS_UNAVAILABLE', 'SMS callbacks are unavailable.'));
    if (!Buffer.isBuffer(req.body)) return next(new ApiError(400, 'INVALID_CALLBACK', 'Use a JSON callback body.'));
    void service.ingest(req.body, req.get('X-Timestamp'), req.get('X-Signature'))
      .then((r) => res.status(202).json(r)).catch(next);
  };
}
