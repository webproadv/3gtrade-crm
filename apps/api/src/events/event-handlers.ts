import { Injectable, Logger } from '@nestjs/common';
import { Tx } from '../db/database.service';
import { DomainEvent } from './outbox';

/**
 * Un gestore di eventi di dominio. È il punto di estensione per workflow,
 * notifiche, integrazioni e (in seguito) il motore BPM.
 * handle() riceve una transazione già impostata sul tenant dell'evento.
 */
export interface EventHandler {
  readonly name: string;
  supports(event: DomainEvent): boolean;
  handle(event: DomainEvent, tx: Tx): Promise<void>;
}

export const EVENT_HANDLERS = Symbol('EVENT_HANDLERS');

/** Gestore di esempio: traccia gli eventi nel log applicativo. */
@Injectable()
export class LoggingHandler implements EventHandler {
  readonly name = 'logging';
  private readonly logger = new Logger('Events');

  supports() {
    return true;
  }

  async handle(event: DomainEvent) {
    this.logger.debug(`${event.type} ${event.payload.module ?? ''} ${event.payload.recordId ?? ''}`);
  }
}
