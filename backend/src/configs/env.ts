import { z } from 'zod';

const origin = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username &&
      !url.password && url.pathname === '/' && !url.search && !url.hash;
  } catch { return false; }
}, 'Expected an HTTP(S) origin');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  DATABASE_URL: z.string().url().refine((value) => {
    try { return ['postgres:', 'postgresql:'].includes(new URL(value).protocol); }
    catch { return false; }
  }),
  FRONTEND_URL: origin.optional(),
  CLIENT_URL: origin.optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1).max(10 * 1024 * 1024).default(1024 * 1024),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(2147483647).default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(100),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(10000),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databaseUrl: string;
  allowedOrigins: string[];
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  bodyLimitBytes: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  trustProxyHops: number;
  shutdownTimeoutMs: number;
}

export class EnvironmentError extends Error {}

export function parseEnvironment(source: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    // Only field names are safe: Zod errors may otherwise contain supplied values.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new EnvironmentError(`Invalid environment settings: ${fields.join(', ')}`);
  }
  const env = result.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL,
    allowedOrigins: [...new Set([env.FRONTEND_URL, env.CLIENT_URL]
      .filter((value): value is string => Boolean(value)).map((value) => new URL(value).origin))],
    logLevel: env.LOG_LEVEL,
    bodyLimitBytes: env.BODY_LIMIT_BYTES,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  };
}
