import { parseEnvironment } from '../src/configs/env';
import type { Database } from '../src/configs/database';
import type { AppLogger, LogMetadata } from '../src/utils/logger';

export const config = parseEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dearly_test',
  FRONTEND_URL: 'http://localhost:8081',
});

export function fakeDatabase(ready = true): Database {
  return { isReady: async () => ready, disconnect: async () => {} };
}

export function captureLogger() {
  const entries: { event: string; metadata?: LogMetadata }[] = [];
  const record = (event: string, metadata?: LogMetadata) => { entries.push({ event, metadata }); };
  const logger: AppLogger = { info: record, warn: record, error: record };
  return { logger, entries };
}
