import { Tx } from '../db/database.service';

export interface DomainEvent {
  id: number;
  tenantId: string;
  type: string;
  payload: Record<string, any>;
  createdAt: Date;
}

/** Scrive un evento nell'outbox nella stessa transazione del dato. */
export async function enqueueEvent(tx: Tx, tenantId: string, type: string, payload: object) {
  await tx.query(`INSERT INTO outbox_events (tenant_id, type, payload) VALUES ($1, $2, $3)`, [
    tenantId,
    type,
    JSON.stringify(payload),
  ]);
}
