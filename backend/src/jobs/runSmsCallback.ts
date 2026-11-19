import { loadEnvironment } from '../configs/loadEnvironment';
import { parseEnvironment } from '../configs/env';
import { createDatabase } from '../configs/database';
import { createLogger } from '../utils/logger';
import { createSmsCallbackApp } from '../smsCallbackApp';

async function main() {
  loadEnvironment();
  // Validate sender settings without enabling SMS in the main app/worker .env.
  const config = parseEnvironment({ ...process.env, SMS_PROVIDER: 'smsgate' });
  if (config.nodeEnv === 'production' || !config.sms) throw Error('Development callback receiver only');
  const database = createDatabase(config.databaseUrl), logger = createLogger(config.logLevel);
  const server = createSmsCallbackApp(database.prisma!, config.sms, logger).listen(8082, '127.0.0.1');
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('listening', () => logger.info('sms.callback.started', { port: 8082 }));
  server.on('error', () => { logger.error('sms.callback.start_failed'); void database.disconnect().finally(() => { process.exitCode = 1; }); });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => { server.closeAllConnections(); void database.disconnect().finally(() => process.exit(1)); }, 20000);
    timer.unref();
    server.close(() => { clearTimeout(timer); void database.disconnect(); });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
void main().catch(() => { console.error('SMS callback receiver unavailable. Check private sender settings.'); process.exitCode = 1; });
