import { createServer, type ServerResponse } from 'node:http';
import type { AppConfig } from './configs/env';
import type { Database } from './configs/database';
import type { AppLogger } from './utils/logger';
import { createApp } from './app';

export async function startServer(config: AppConfig, database: Database, logger: AppLogger) {
  const server = createServer(createApp(config, database, logger));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  const responses = new Set<ServerResponse>();
  let stopping: Promise<void> | undefined;
  server.on('request', (_req, res) => {
    responses.add(res);
    res.once('close', () => { responses.delete(res); });
    res.once('finish', () => {
      responses.delete(res);
      if (stopping) server.closeIdleConnections();
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  } catch {
    await database.disconnect();
    throw new Error('Server could not bind to the configured address.');
  }
  const address = server.address();
  logger.info('server.started', { port: typeof address === 'object' && address ? address.port : config.port });

  function shutdown(): Promise<void> {
    stopping ??= (async () => {
      logger.info('server.stopping');
      for (const response of responses) response.shouldKeepAlive = false;
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          server.closeAllConnections();
          reject(new Error('Shutdown deadline exceeded.'));
        }, config.shutdownTimeoutMs);
      });
      const cleanup = (async () => {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await database.disconnect();
      })();
      try {
        await Promise.race([cleanup, deadline]);
        logger.info('server.stopped');
      } finally {
        clearTimeout(timer);
      }
    })();
    return stopping;
  }
  return { server, shutdown };
}
