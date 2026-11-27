import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { Tx } from '../db/database.service';
import { EventHandler } from '../events/event-handlers';
import { DomainEvent } from '../events/outbox';
import { WorkflowEngine } from './workflow-engine';

/** Collega i workflow agli eventi dell'outbox (creazione e modifica dei record). */
@Injectable()
export class WorkflowHandler implements EventHandler {
  readonly name = 'workflows';

  constructor(private readonly engine: WorkflowEngine) {}

  supports(event: DomainEvent) {
    return event.type === 'record.created' || event.type === 'record.updated';
  }

  handle(event: DomainEvent, tx: Tx) {
    return this.engine.onEvent(event, tx);
  }
}

/** Controllo periodico dei workflow a tempo e invio delle email interne in coda. */
@Injectable()
export class WorkflowScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('WorkflowScheduler');
  private timers: NodeJS.Timeout[] = [];
  private busy = false;

  constructor(
    private readonly engine: WorkflowEngine,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.workerEnabled) return;
    this.timers.push(setInterval(() => void this.scheduled(), this.config.workflowIntervalMs));
    this.timers.push(
      setInterval(() => void this.engine.sendQueued().catch((e) => this.logger.warn(e.message)), 60_000),
    );
  }

  onApplicationShutdown() {
    for (const t of this.timers) clearInterval(t);
  }

  private async scheduled() {
    if (this.busy) return;
    this.busy = true;
    try {
      const n = await this.engine.runScheduled();
      if (n) this.logger.log(`workflow a tempo eseguiti: ${n}`);
    } catch (err) {
      this.logger.error(`controllo workflow a tempo fallito: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}
