import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { assertRlsEnforced, migrate } from './db/migrator';

async function bootstrap() {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  await assertRlsEnforced(pool, process.env.NODE_ENV === 'production', (m) => Logger.warn(m, 'Database'));
  if (process.env.MIGRATE_ON_START !== 'false') {
    await migrate(pool, (m) => Logger.log(m, 'Migrations'));
  }
  await pool.end();
  const app = await NestFactory.create(AppModule.forRoot(config));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  app.enableShutdownHooks();
  await app.listen(config.port);
  Logger.log(`API in ascolto su http://localhost:${config.port}/api`, 'Bootstrap');
}

void bootstrap();
