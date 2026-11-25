export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  port: number;
  workerEnabled: boolean;
  workerIntervalMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = env.JWT_SECRET ?? (env.NODE_ENV === 'production' ? '' : 'dev-secret-change-me');
  if (!jwtSecret) throw new Error('JWT_SECRET è obbligatorio in produzione');
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/crm',
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '12h',
    port: Number(env.PORT ?? 3000),
    workerEnabled: (env.WORKER_ENABLED ?? 'true') !== 'false',
    workerIntervalMs: Number(env.WORKER_INTERVAL_MS ?? 1000),
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
