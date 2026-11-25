import { Injectable } from '@nestjs/common';
import { AuthInfo } from '../auth/auth.types';
import { DatabaseService, Tx } from '../db/database.service';
import { SecurityContext } from './security-context';
import { SecurityService } from './security.service';

/** Apre una transazione nel tenant dell'utente e carica il suo contesto di sicurezza. */
@Injectable()
export class ScopeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly security: SecurityService,
  ) {}

  run<T>(auth: AuthInfo, fn: (tx: Tx, sec: SecurityContext) => Promise<T>): Promise<T> {
    return this.db.withTenant(auth.tenantId, async (tx) => {
      const sec = await this.security.load(tx, auth.tenantId, auth.userId);
      return fn(tx, sec);
    });
  }
}
