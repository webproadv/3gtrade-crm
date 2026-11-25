import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { DatabaseService } from '../db/database.service';
import { EVENT_HANDLERS, EventHandler } from './event-handlers';
import { DomainEvent } from './outbox';

const MAX_ATTEMPTS = 5;

/**
 * Processa in background gli eventi dell'outbox.
 * Più istanze possono girare in parallelo grazie a FOR UPDATE SKIP LOCKED.
 */
@Injectable()
export class OutboxWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('OutboxWorker');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EVENT_HANDLERS) private readonly handlers: EventHandler[],
  ) {}

  onApplicationBootstrap() {
    if (!this.config.workerEnabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.workerIntervalMs);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Processa un lotto di eventi; restituisce quanti ne ha gestiti. */
  async tick(batchSize = 50): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.db.transaction(async (tx) => {
        await tx.query(`SELECT set_config('app.worker', 'on', true)`);
        const { rows } = await tx.query(
          `SELECT id, tenant_id, type, payload, created_at FROM outbox_events
            WHERE processed_at IS NULL AND attempts < $1
            ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`,
          [MAX_ATTEMPTS, batchSize],
        );
        for (const r of rows) {
          const event: DomainEvent = {
            id: Number(r.id),
            tenantId: r.tenant_id,
            type: r.type,
            payload: r.payload,
            createdAt: r.created_at,
          };
          try {
            await tx.query('SAVEPOINT evt');
            await tx.query(`SELECT set_config('app.tenant_id', $1, true)`, [event.tenantId]);
            for (const h of this.handlers) if (h.supports(event)) await h.handle(event, tx);
            await tx.query('RELEASE SAVEPOINT evt');
            await tx.query(`UPDATE outbox_events SET processed_at = now(), attempts = attempts + 1 WHERE id = $1`, [
              event.id,
            ]);
          } catch (err) {
            await tx.query('ROLLBACK TO SAVEPOINT evt');
            this.logger.warn(`evento ${event.id} (${event.type}) fallito: ${(err as Error).message}`);
            await tx.query(`UPDATE outbox_events SET attempts = attempts + 1, last_error = $2 WHERE id = $1`, [
              event.id,
              (err as Error).message,
            ]);
          }
        }
        return rows.length;
      });
    } catch (err) {
      this.logger.error(`ciclo outbox fallito: ${(err as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
