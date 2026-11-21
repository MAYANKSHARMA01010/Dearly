import type { AppLogger } from './logger';
export type OtpStage = 'READINESS' | 'RESERVATION' | 'DISPATCH' | 'FINALIZATION' | 'TOTAL';

/** Measure one execution only; never inspect its input, result or raw failure. */
export async function timeOtpStage<T>(
  stage: OtpStage,
  work: () => Promise<T>,
  logger?: AppLogger,
  requestId?: string,
): Promise<T> {
  const started = performance.now();
  let completed = false;
  try {
    const value = await work();
    completed = true;
    return value;
  } finally {
    try {
      logger?.info('auth.otp.stage', {
        requestId,
        code: `${stage}_${completed ? 'COMPLETED' : 'FAILED'}`,
        durationMs: Math.round(performance.now() - started),
      });
    } catch {
      // Observability must never turn a submitted OTP into a retryable failure.
    }
  }
}
