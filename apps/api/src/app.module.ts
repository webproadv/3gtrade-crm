import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AdminController, UsersController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { ErrorsFilter } from './common/errors.filter';
import { HealthController } from './common/health.controller';
import { APP_CONFIG, AppConfig } from './config';
import { DbModule } from './db/db.module';
import { EVENT_HANDLERS, LoggingHandler } from './events/event-handlers';
import { OutboxWorker } from './events/outbox.worker';
import { MetadataController } from './metadata/metadata.controller';
import { MetadataService } from './metadata/metadata.service';
import { CalendarController } from './records/calendar.controller';
import { LinesController } from './records/lines.controller';
import { LinesService } from './records/lines.service';
import { RecordsController } from './records/records.controller';
import { RecordsService } from './records/records.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { ScopeService } from './security/scope.service';
import { SecurityService } from './security/security.service';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        { module: ConfigHolder, global: true, providers: [{ provide: APP_CONFIG, useValue: config }], exports: [APP_CONFIG] },
        DbModule,
        JwtModule.register({ secret: config.jwtSecret, signOptions: { expiresIn: config.jwtExpiresIn } }),
      ],
      controllers: [
        HealthController,
        AuthController,
        MetadataController,
        RecordsController,
        CalendarController,
        LinesController,
        ReportsController,
        AdminController,
        UsersController,
      ],
      providers: [
        AuthService,
        SecurityService,
        ScopeService,
        MetadataService,
        RecordsService,
        LinesService,
        ReportsService,
        AdminService,
        LoggingHandler,
        { provide: EVENT_HANDLERS, useFactory: (log: LoggingHandler) => [log], inject: [LoggingHandler] },
        OutboxWorker,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ErrorsFilter },
      ],
    };
  }
}

@Module({})
class ConfigHolder {}
