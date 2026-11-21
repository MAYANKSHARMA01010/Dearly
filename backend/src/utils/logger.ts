import winston from 'winston';
export interface LogMetadata {
  requestId?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  code?: string;
  port?: number;
}
export interface AppLogger {
  info(event: string, metadata?: LogMetadata): void;
  warn(event: string, metadata?: LogMetadata): void;
  error(event: string, metadata?: LogMetadata): void;
}
const events = new Set([
  'app.event',
  'auth.otp.stage',
  'http.request',
  'http.error',
  'server.started',
  'server.stopping',
  'server.stopped',
  'server.shutdown_failed',
  'sms.callback.started',
  'sms.callback.start_failed',
  'delivery.worker.started',
  'delivery.worker.stopped',
  'delivery.worker.cycle_failed',
  'delivery.worker.shutdown_deadline',
]);
/** Runtime allowlist, including when an untyped library accidentally supplies raw errors. */
export function safeLog(event: string, metadata: unknown) {
  const safe: LogMetadata = {};
  const input =
    metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)
      : {};
  if (
    typeof input.requestId === 'string' &&
    /^[0-9a-f-]{36}$/.test(input.requestId)
  )
    safe.requestId = input.requestId;
  if (
    typeof input.method === 'string' &&
    ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(
      input.method,
    )
  )
    safe.method = input.method;
  if (
    typeof input.code === 'string' &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(input.code)
  )
    safe.code = input.code;
  if (
    typeof input.statusCode === 'number' &&
    Number.isInteger(input.statusCode) &&
    input.statusCode >= 100 &&
    input.statusCode <= 599
  )
    safe.statusCode = input.statusCode;
  if (
    typeof input.durationMs === 'number' &&
    Number.isFinite(input.durationMs) &&
    input.durationMs >= 0 &&
    input.durationMs <= 86400000
  )
    safe.durationMs = input.durationMs;
  if (
    typeof input.port === 'number' &&
    Number.isInteger(input.port) &&
    input.port >= 1 &&
    input.port <= 65535
  )
    safe.port = input.port;
  return { event: events.has(event) ? event : 'app.event', metadata: safe };
}
export function createLogger(
  level: string,
  transports: winston.LoggerOptions['transports'] = [
    new winston.transports.Console(),
  ],
): AppLogger {
  const sink = winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    transports,
  });
  const write = (
    severity: 'info' | 'warn' | 'error',
    event: string,
    metadata?: LogMetadata,
  ) => {
    const clean = safeLog(event, metadata);
    sink.log(severity, clean.event, clean.metadata);
  };
  return {
    info: (e, m) => write('info', e, m),
    warn: (e, m) => write('warn', e, m),
    error: (e, m) => write('error', e, m),
  };
}
