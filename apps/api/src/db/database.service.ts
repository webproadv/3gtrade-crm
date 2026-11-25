import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';

export type Tx = PoolClient;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl, max: 20 });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /**
   * Esegue fn in una transazione con il tenant impostato: tutte le query
   * sono filtrate dalla Row Level Security sul tenant indicato.
   */
  async withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.transaction(async (tx) => {
      await tx.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      return fn(tx);
    });
  }

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Query fuori dal contesto tenant (solo tabelle senza RLS, es. tenants). */
  async query<R extends QueryResultRow = any>(sql: string, params: unknown[] = []) {
    return this.pool.query<R>(sql, params);
  }
}
