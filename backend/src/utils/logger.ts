import winston from 'winston';

// Allowlist metadata instead of passing request bodies, headers, URLs, or errors.
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

export function createLogger(level: string): AppLogger {
  return winston.createLogger({
    level,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
  });
}
