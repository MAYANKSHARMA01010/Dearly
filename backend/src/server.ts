import { loadEnvironment } from './configs/loadEnvironment';
import { EnvironmentError } from './configs/env';
import { createDatabase } from './configs/database';
import { createLogger } from './utils/logger';
import { startServer } from './serverLifecycle';

async function main() {
  const config = loadEnvironment();
  const logger = createLogger(config.logLevel);
  const database = createDatabase(config.databaseUrl);
  const runtime = await startServer(config, database, logger);
  const stop = () => {
    void runtime.shutdown().catch(() => {
      logger.error('server.shutdown_failed');
      process.exit(1);
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  // Lazy Prisma connection keeps liveness independent of database availability.
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Never print Prisma errors or environment objects: they may contain secrets.
    process.stderr.write(error instanceof EnvironmentError ? `${error.message}\n`
      : 'Backend startup failed. Check environment fields and address availability.\n');
    process.exitCode = 1;
  });
}
