import type { Response } from 'express';

export function sendSuccess(res: Response, data: unknown, requestId: string) {
  return res.json({ success: true, data, requestId });
}
