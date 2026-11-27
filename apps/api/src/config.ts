export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  port: number;
  workerEnabled: boolean;
  workerIntervalMs: number;
  /** controlli dei workflow a tempo e invio delle email in coda */
  workflowIntervalMs: number;
  /** server di posta, es. smtps://utente:password@smtp.esempio.it:465 ("json" = nessun invio reale, per i test) */
  smtpUrl: string;
  mailFrom: string;
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
    workflowIntervalMs: Number(env.WORKFLOW_INTERVAL_MS ?? 5 * 60 * 1000),
    smtpUrl: env.SMTP_URL ?? '',
    mailFrom: env.MAIL_FROM ?? '',
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
