import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { Pool } from 'pg';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { assertRlsEnforced, migrate } from './db/migrator';
import { DEMO_USERS, seedDemo } from './tenants/demo';
import { ensureStandardModules } from './tenants/provisioning';

async function prepareDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await assertRlsEnforced(pool, process.env.NODE_ENV === 'production', (m) => Logger.warn(m, 'Database'));
    if (process.env.MIGRATE_ON_START !== 'false') {
      await migrate(pool, (m) => Logger.log(m, 'Migrations'));
      for (const a of await ensureStandardModules(pool)) Logger.log(`aggiunto ${a}`, 'Metadata');
    }
    // SEED_DEMO=true: al primo avvio crea l'azienda dimostrativa "demo"
    if (process.env.SEED_DEMO === 'true' && (await seedDemo(pool, { password: process.env.SEED_PASSWORD }))) {
      Logger.log(`creata l'azienda demo: ${DEMO_USERS.map(([e]) => e).join(', ')}`, 'Demo');
    }
  } finally {
    await pool.end();
  }
}

async function bootstrap() {
  const config = loadConfig();
  await prepareDatabase(config.databaseUrl);

  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  app.enableShutdownHooks();

  // Se è presente la build dell'interfaccia, la serve dallo stesso processo:
  // un solo indirizzo e una sola porta per tutto il CRM.
  const webDir = resolve(process.env.WEB_DIST ?? join(__dirname, '..', '..', 'web', 'dist'));
  if (existsSync(join(webDir, 'index.html'))) {
    app.useStaticAssets(webDir, { index: false, maxAge: '1h' });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(join(webDir, 'index.html'));
    });
    Logger.log(`interfaccia servita da ${webDir}`, 'Bootstrap');
  }

  await app.listen(config.port);
  Logger.log(`CRM in ascolto su http://localhost:${config.port}`, 'Bootstrap');
}

void bootstrap();
