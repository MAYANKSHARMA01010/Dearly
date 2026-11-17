import type { RequestHandler } from 'express';
import type { WahaReceiptService } from '../services/wahaReceipt.service';
import { ApiError } from '../utils/ApiError';
export function wahaWebhookController(
  service?: WahaReceiptService,
): RequestHandler {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!service)
      return next(
        new ApiError(
          503,
          'WHATSAPP_UNAVAILABLE',
          'WhatsApp callbacks are unavailable.',
        ),
      );
    if (!Buffer.isBuffer(req.body))
      return next(
        new ApiError(400, 'INVALID_CALLBACK', 'Use a JSON callback body.'),
      );
    void service
      .ingest(
        req.body,
        req.get('X-Webhook-Hmac'),
        req.get('X-Webhook-Hmac-Algorithm'),
      )
      .then((value) => res.status(202).json(value))
      .catch(next);
  };
}
