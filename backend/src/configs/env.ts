import { z } from 'zod';

const origin = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, 'Expected an HTTP(S) origin');

const redisConnectionUrl = z.string().url().refine((value) => {
  try { return ['redis:', 'rediss:'].includes(new URL(value).protocol); }
  catch { return false; }
});

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PUSH_PROVIDER: z.enum(['disabled', 'expo']).default('disabled'),
    EXPO_PROJECT_ID: z.preprocess(v => v === '' ? undefined : v, z.string().uuid().optional()),
    EXPO_ACCESS_TOKEN: z.preprocess(v => v === '' ? undefined : v, z.string().min(16).max(512).optional()),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    BACKEND_LOCAL_URL: origin.optional(),
    BACKEND_SERVER_URL: z.preprocess((v) => v === '' ? undefined : v, origin.refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
      } catch { return false; }
    }).optional()),
    REDIS_URL: redisConnectionUrl.optional(),
    REDIS_LOCAL_URL: redisConnectionUrl.optional(),
    REDIS_SERVER_URL: z.preprocess((v) => v === '' ? undefined : v, redisConnectionUrl.optional()),
    HOST: z.string().trim().min(1).default('127.0.0.1'),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => {
        try {
          return ['postgres:', 'postgresql:'].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      }),
    FRONTEND_URL: origin.optional(),
    CLIENT_URL: origin.optional(),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024)
      .default(1024 * 1024),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(2147483647)
      .default(900000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(100),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    SHUTDOWN_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60000)
      .default(10000),
    AUTH_MODE: z.enum(['disabled', 'development', 'whatsapp']).default('disabled'),
    WHATSAPP_OTP_DAILY_LIMIT: z.coerce
      .number().int().min(1).max(500).default(20),
    STORAGE_ROOT: z.string().trim().min(1).default('./data/attachments'),
    FFPROBE_PATH: z.string().trim().min(1).default('ffprobe'),
    OTP_PEPPER: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    EMAIL_PUBLIC_URL: origin.optional(),
    CONTENT_PUBLIC_URL: origin.optional(),
    WHATSAPP_MODE: z.enum(['disabled', 'waha']).default('disabled'),
    SMS_PROVIDER: z.enum(['disabled', 'smsgate']).default('disabled'),
    SMSGATE_CONNECTION: z.enum(['local', 'cloud']).default('local'),
    SMSGATE_LOCAL_API_URL: z.string().url().optional(),
    SMSGATE_SERVER_API_URL: z.preprocess((v) => v === '' ? undefined : v, z.string().url().optional()),
    SMSGATE_DEVICE_ID: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    SMSGATE_USERNAME: z.string().min(1).max(256).refine((v) => !v.includes(':')).optional(),
    SMSGATE_PASSWORD: z.string().min(1).max(256).optional(),
    SMSGATE_TOKEN: z.string().min(16).max(4096).optional(),
    SMSGATE_WEBHOOK_SECRET: z.string().min(16).max(256).optional(),
    SMSGATE_SIM_NUMBER: z.coerce.number().int().min(1).max(3).default(1),
    SMS_DAILY_LIMIT: z.coerce.number().int().min(1).max(500).default(20),
    WAHA_LOCAL_API_URL: origin.optional(),
    WAHA_SERVER_API_URL: z.preprocess(
      (v) => (v === '' ? undefined : v),
      origin.optional(),
    ),
    WAHA_API_KEY: z.string().min(16).max(256).optional(),
    WAHA_WEBHOOK_SECRET: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    WAHA_CALLBACK_URL: z
      .string()
      .url()
      .refine((v) => {
        const u = new URL(v);
        return (
          ['http:', 'https:'].includes(u.protocol) &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          u.pathname === '/webhooks/waha'
        );
      })
      .optional(),
    WAHA_ENGINE: z.enum(['NOWEB', 'WEBJS', 'GOWS']).default('GOWS'),
    WAHA_SESSION: z.literal('default').default('default'),
    WAHA_DAILY_LIMIT: z.coerce.number().int().min(1).max(500).default(20),
    EXTERNAL_ACCESS_SECRET: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    EMAIL_DAILY_LIMIT: z.coerce.number().int().min(1).max(500).default(100),
    EMAIL_MODE: z.enum(['disabled', 'smtp']).default('disabled'),
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce
      .number()
      .int()
      .refine((value) => value === 465 || value === 587)
      .default(465),
    SMTP_USER: z.email().optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.email().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_MODE === 'smtp') {
      for (const field of [
        'SMTP_HOST',
        'SMTP_USER',
        'SMTP_PASSWORD',
        'SMTP_FROM',
      ] as const) {
        if (!env[field])
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: 'Required for SMTP.',
          });
      }
      if (
        env.SMTP_HOST === 'smtp.gmail.com' &&
        env.SMTP_FROM?.toLowerCase() !== env.SMTP_USER?.toLowerCase()
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['SMTP_FROM'],
          message: 'Gmail sender must match the authenticated account.',
        });
      }
    }
    if (
      env.AUTH_MODE === 'development' &&
      (env.NODE_ENV === 'production' ||
        !['127.0.0.1', '::1', 'localhost'].includes(env.HOST) ||
        !env.OTP_PEPPER)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message:
          'Development auth requires loopback, a pepper and a non-production environment.',
      });
    }
    if (
      env.AUTH_MODE === 'whatsapp' &&
      (!env.OTP_PEPPER || env.WHATSAPP_MODE !== 'waha')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'WhatsApp auth requires a pepper and configured WAHA.',
      });
    }
  });

export interface AppConfig {
  backendLocalUrl?: string;
  backendServerUrl?: string;
  redisUrl?: string;
  push?: { enabled: boolean; projectId: string; accessToken?: string };
  sms?: SmsGateConfig;
  email?: SmtpConfig;
  whatsapp?: WahaConfig;
  externalAccess?: { publicUrl: string; secret: string; dailyLimit: number };
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
  authMode: 'disabled' | 'development' | 'whatsapp';
  whatsappOtpDailyLimit?: number;
  otpPepper?: string;
  storageRoot: string;
  ffprobePath: string;
}

export interface WahaConfig {
  engine: 'NOWEB' | 'WEBJS' | 'GOWS';
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  session: 'default';
  dailyLimit: number;
  callbackUrl?: string;
}
export interface SmsGateConfig {
  baseUrl: string;
  connection: 'local' | 'cloud';
  deviceId?: string;
  username?: string;
  password?: string;
  token?: string;
  webhookSecret: string;
  simNumber: number;
  dailyLimit: number;
}
export interface SmtpConfig {
  host: string;
  port: 465 | 587;
  user: string;
  password: string;
  from: string;
}

export class EnvironmentError extends Error {}

export function parseEnvironment(source: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    // Only field names are safe: Zod errors may otherwise contain supplied values.
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new EnvironmentError(
      `Invalid environment settings: ${fields.join(', ')}`,
    );
  }
  const env = result.data;
  const contentUrl = env.CONTENT_PUBLIC_URL ?? env.EMAIL_PUBLIC_URL;
  const wahaUrl =
    env.NODE_ENV === 'production'
      ? env.WAHA_SERVER_API_URL
      : env.WAHA_LOCAL_API_URL;
  if (
    contentUrl &&
    env.NODE_ENV === 'production' &&
    !contentUrl.startsWith('https://')
  )
    throw new EnvironmentError(
      'Invalid environment settings: CONTENT_PUBLIC_URL',
    );
  if (
    env.WHATSAPP_MODE === 'waha' &&
    (!wahaUrl || !env.WAHA_API_KEY || !env.WAHA_WEBHOOK_SECRET)
  )
    throw new EnvironmentError(
      'Invalid environment settings: WAHA configuration',
    );
  if (
    wahaUrl &&
    !wahaUrl.startsWith('https://') &&
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(wahaUrl).hostname)
  )
    throw new EnvironmentError('Invalid environment settings: WAHA API URL');
  if (
    env.NODE_ENV === 'production' &&
    env.WAHA_CALLBACK_URL &&
    !env.WAHA_CALLBACK_URL.startsWith('https://')
  )
    throw new EnvironmentError(
      'Invalid environment settings: WAHA_CALLBACK_URL',
    );
  if (env.PUSH_PROVIDER === 'expo' && !env.EXPO_PROJECT_ID) throw new EnvironmentError('Invalid environment settings: EXPO_PROJECT_ID');
  const smsUrl = env.NODE_ENV === 'production' ? env.SMSGATE_SERVER_API_URL : env.SMSGATE_LOCAL_API_URL;
  if (env.SMS_PROVIDER === 'smsgate') {
    if (!smsUrl || (env.SMSGATE_CONNECTION === 'cloud' && !env.SMSGATE_DEVICE_ID) || !env.SMSGATE_WEBHOOK_SECRET ||
        (env.SMSGATE_TOKEN ? Boolean(env.SMSGATE_USERNAME || env.SMSGATE_PASSWORD) : !env.SMSGATE_USERNAME || !env.SMSGATE_PASSWORD) ||
        (env.SMSGATE_CONNECTION === 'local' && env.SMSGATE_TOKEN))
      throw new EnvironmentError('Invalid environment settings: SMSGate configuration');
    const u = new URL(smsUrl);
    if (u.username || u.password || u.search || u.hash ||
        (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))) ||
        (env.SMSGATE_CONNECTION === 'local' ? u.pathname !== '/' : u.pathname.replace(/\/$/, '') !== '/3rdparty/v1'))
      throw new EnvironmentError('Invalid environment settings: SMSGate API URL');
  }
  return {
    backendLocalUrl: env.BACKEND_LOCAL_URL ?? `http://localhost:${env.PORT}`,
    backendServerUrl: env.BACKEND_SERVER_URL,
    // Optional future cache only. Do not connect or fall back to local Redis in production.
    redisUrl: env.NODE_ENV === 'production' ? env.REDIS_SERVER_URL : env.REDIS_LOCAL_URL ?? env.REDIS_URL,
    push: env.EXPO_PROJECT_ID ? { enabled: env.PUSH_PROVIDER === 'expo', projectId: env.EXPO_PROJECT_ID, accessToken: env.EXPO_ACCESS_TOKEN } : undefined,
    sms: env.SMS_PROVIDER === 'smsgate' ? {
      baseUrl: smsUrl!.replace(/\/$/, ''), connection: env.SMSGATE_CONNECTION,
      deviceId: env.SMSGATE_DEVICE_ID!, username: env.SMSGATE_USERNAME,
      password: env.SMSGATE_PASSWORD, token: env.SMSGATE_TOKEN,
      webhookSecret: env.SMSGATE_WEBHOOK_SECRET!, simNumber: env.SMSGATE_SIM_NUMBER, dailyLimit: env.SMS_DAILY_LIMIT,
    } : undefined,
    whatsapp:
      env.WHATSAPP_MODE === 'waha'
        ? {
            engine: env.WAHA_ENGINE,
            baseUrl: wahaUrl!,
            callbackUrl: env.WAHA_CALLBACK_URL,
            apiKey: env.WAHA_API_KEY!,
            webhookSecret: env.WAHA_WEBHOOK_SECRET!,
            session: env.WAHA_SESSION,
            dailyLimit: env.WAHA_DAILY_LIMIT,
          }
        : undefined,
    externalAccess:
      contentUrl && env.EXTERNAL_ACCESS_SECRET
        ? {
            publicUrl: new URL(contentUrl).origin,
            secret: env.EXTERNAL_ACCESS_SECRET,
            dailyLimit: env.EMAIL_DAILY_LIMIT,
          }
        : undefined,
    email:
      env.EMAIL_MODE === 'smtp'
        ? {
            host: env.SMTP_HOST!,
            port: env.SMTP_PORT as 465 | 587,
            user: env.SMTP_USER!,
            password: env.SMTP_PASSWORD!,
            from: env.SMTP_FROM!,
          }
        : undefined,
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL,
    allowedOrigins: [
      ...new Set(
        [env.FRONTEND_URL, env.CLIENT_URL]
          .filter((value): value is string => Boolean(value))
          .map((value) => new URL(value).origin),
      ),
    ],
    logLevel: env.LOG_LEVEL,
    bodyLimitBytes: env.BODY_LIMIT_BYTES,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    authMode: env.AUTH_MODE,
    whatsappOtpDailyLimit: env.WHATSAPP_OTP_DAILY_LIMIT,
    otpPepper: env.OTP_PEPPER,
    storageRoot: env.STORAGE_ROOT,
    ffprobePath: env.FFPROBE_PATH,
  };
}
