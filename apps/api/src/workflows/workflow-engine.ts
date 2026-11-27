import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService, Tx } from '../db/database.service';
import { DomainEvent } from '../events/outbox';
import { FieldDef } from '../metadata/field-types';
import { MetadataService } from '../metadata/metadata.service';
import { RecordsService } from '../records/records.service';
import { ReportsService } from '../reports/reports.service';
import { SecurityContext } from '../security/security-context';
import { MailerService } from './mailer.service';
import { TemplateContext, TemplateRecord, todayIso } from './templates';
import { Action, Trigger, WorkflowBody, isCustomerRecipient } from './workflow-config';

export interface WorkflowRow {
  id: string;
  tenant_id: string;
  name: string;
  module: string;
  active: boolean;
  trigger: Trigger;
  conditions: WorkflowBody['conditions'];
  actions: Action[];
  created_by: string;
}

export interface RunResult {
  ran: boolean;
  message?: string;
  error?: string;
}

interface RecordRow extends TemplateRecord {
  module: string;
}

/** Tipi di campo che ricevono il testo leggibile del segnaposto; gli altri il valore grezzo. */
const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'url']);
/** Collegamenti delle attività copiati dal record su cui gira il workflow. */
const ACTIVITY_LINKS = ['account_id', 'contact_id', 'opportunity_id', 'lead_id', 'sales_order_id'];

/**
 * Esegue i workflow. Gli eventi arrivano dall'outbox (dopo il salvataggio), le scadenze dal
 * controllo periodico, i workflow manuali dal pulsante sulla scheda.
 * Le azioni girano con i permessi del sistema e i loro eventi non riattivano altri workflow,
 * così non si creano cicli. Le email per i clienti restano sempre bozze da inviare a mano.
 */
@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger('Workflow');

  constructor(
    private readonly db: DatabaseService,
    private readonly meta: MetadataService,
    private readonly records: RecordsService,
    private readonly reports: ReportsService,
    private readonly mailer: MailerService,
  ) {}

  systemContext(tenantId: string, userId: string, workflowId: string): SecurityContext {
    return {
      tenantId,
      userId,
      isAdmin: true,
      roleId: '',
      rolePath: '',
      modules: {},
      hiddenFields: new Set(),
      readonlyFields: new Set(),
      visibleOwnerIds: [],
      viaWorkflow: workflowId,
    };
  }

  private async loadRecord(tx: Tx, id: string): Promise<RecordRow | undefined> {
    return (
      await tx.query<RecordRow>(
        `SELECT id, module, label, owner_id, data FROM records WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      )
    ).rows[0];
  }

  /** Il record rispetta le condizioni del workflow? */
  async matches(tx: Tx, sec: SecurityContext, wf: WorkflowRow, recordId: string) {
    if (!wf.conditions.length) return true;
    const { where, params } = await this.reports.filterWhere(tx, sec, wf.module, wf.conditions, true);
    params.push(recordId);
    const r = await tx.query(`SELECT 1 FROM records r WHERE ${where} AND r.id = $${params.length}`, params);
    return !!r.rowCount;
  }

  // ---------------------------------------------------------------- eventi

  async onEvent(event: DomainEvent, tx: Tx) {
    const p = event.payload;
    if (p.viaWorkflow || !p.module || !p.recordId) return;
    const created = event.type === 'record.created';
    const changed: string[] = created ? Object.keys(p.data ?? {}) : Object.keys(p.changes ?? {});
    const workflows = (
      await tx.query<WorkflowRow>(
        `SELECT * FROM workflows WHERE active AND module = $1 AND trigger->>'type' = ANY($2) ORDER BY created_at`,
        [p.module, created ? ['create', 'save', 'field_change', 'first_match'] : ['save', 'field_change', 'first_match']],
      )
    ).rows;
    let current: RecordRow | undefined;
    for (const wf of workflows) {
      if (wf.trigger.type === 'field_change') {
        const field = wf.trigger.field;
        if (!changed.includes(field)) continue;
        // gli eventi si elaborano dopo il salvataggio: se il campo è già cambiato di nuovo,
        // vale solo l'evento più recente (le condizioni si controllano sul record attuale)
        current ??= await this.loadRecord(tx, p.recordId);
        const value = created ? p.data?.[field] : p.changes?.[field]?.[1];
        if (JSON.stringify(value ?? null) !== JSON.stringify(current?.data[field] ?? null)) continue;
      }
      await this.runSafely(tx, wf, p.recordId, p.userId, wf.trigger.type === 'first_match' ? 'first' : null);
    }
  }

  /**
   * Controlla le condizioni ed esegue le azioni in un savepoint: un errore viene registrato
   * nel registro delle esecuzioni senza bloccare il salvataggio né gli altri workflow.
   * Con anchor il workflow gira una sola volta per record e anchor.
   */
  async runSafely(
    tx: Tx,
    wf: WorkflowRow,
    recordId: string,
    userId: string,
    anchor: string | null,
  ): Promise<RunResult> {
    const sec = this.systemContext(wf.tenant_id, userId, wf.id);
    await tx.query('SAVEPOINT wf');
    try {
      const rec = await this.loadRecord(tx, recordId);
      if (!rec || !(await this.matches(tx, sec, wf, recordId))) {
        await tx.query('RELEASE SAVEPOINT wf');
        return { ran: false };
      }
      if (anchor !== null) {
        const ins = await tx.query(
          `INSERT INTO workflow_runs (tenant_id, workflow_id, record_id, anchor) VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING RETURNING id`,
          [wf.tenant_id, wf.id, recordId, anchor],
        );
        if (!ins.rowCount) {
          await tx.query('RELEASE SAVEPOINT wf');
          return { ran: false };
        }
        const message = await this.execute(tx, sec, wf, rec);
        await tx.query(`UPDATE workflow_runs SET message = $2 WHERE id = $1`, [ins.rows[0].id, message]);
        await tx.query('RELEASE SAVEPOINT wf');
        return { ran: true, message };
      }
      const message = await this.execute(tx, sec, wf, rec);
      await tx.query(`INSERT INTO workflow_runs (tenant_id, workflow_id, record_id, message) VALUES ($1, $2, $3, $4)`, [
        wf.tenant_id,
        wf.id,
        recordId,
        message,
      ]);
      await tx.query('RELEASE SAVEPOINT wf');
      return { ran: true, message };
    } catch (err) {
      await tx.query('ROLLBACK TO SAVEPOINT wf');
      const msg = errorText(err);
      this.logger.warn(`workflow "${wf.name}" sul record ${recordId}: ${msg}`);
      await tx.query(
        `INSERT INTO workflow_runs (tenant_id, workflow_id, record_id, anchor, status, message)
         VALUES ($1, $2, $3, $4, 'error', $5) ON CONFLICT DO NOTHING`,
        [wf.tenant_id, wf.id, recordId, anchor, msg],
      );
      return { ran: true, error: msg };
    }
  }

  // ---------------------------------------------------------------- azioni

  private async execute(tx: Tx, sec: SecurityContext, wf: WorkflowRow, start: RecordRow) {
    let rec = start;
    const done: string[] = [];
    for (const action of wf.actions) {
      const fields = await this.meta.listFields(tx, wf.module);
      const ctx = new TemplateContext(tx, rec, fields, (m) => this.meta.listFields(tx, m));
      switch (action.type) {
        case 'update_field': {
          const f = fields.find((x) => x.name === action.field);
          if (!f) throw new Error(`campo sconosciuto: ${action.field}`);
          if (f.options.computed) throw new Error(`il campo ${f.label} è calcolato dal sistema`);
          const value = await this.fieldValue(ctx, f, action.value);
          await this.records.update(tx, sec, wf.module, rec.id, { data: { [f.name]: value } });
          rec = (await this.loadRecord(tx, rec.id))!;
          done.push(`${f.label} aggiornato`);
          break;
        }
        case 'create_activity': {
          const actFields = await this.meta.listFields(tx, 'Activities');
          const names = new Set(actFields.map((f) => f.name));
          const due = new Date();
          due.setDate(due.getDate() + action.dueDays);
          due.setHours(9, 0, 0, 0);
          const data: Record<string, unknown> = {
            subject: await ctx.render(action.subject),
            activity_type: action.activityType,
            start: due.toISOString(),
          };
          if (action.description) data.description = await ctx.render(action.description);
          // collegamento al record e ai record a cui è collegato (cliente, contatto, opportunità…)
          const own = actFields.find((f) => f.type === 'relation' && f.options.module === wf.module);
          if (own) data[own.name] = rec.id;
          for (const link of ACTIVITY_LINKS) {
            if (!names.has(link) || data[link]) continue;
            const v = rec.data[link];
            if (typeof v === 'string') data[link] = v;
          }
          const ownerId = action.assignTo === 'owner' ? rec.owner_id : action.assignTo.slice(5);
          await this.records.create(tx, sec, 'Activities', { data, ownerId });
          done.push('attività creata');
          break;
        }
        case 'send_email': {
          const toCustomer = isCustomerRecipient(action.to);
          const to = String((await this.recipient(tx, ctx, action.to)) ?? '').trim();
          const subject = await ctx.render(action.subject);
          const body = await ctx.render(action.body);
          // regola: al cliente non parte mai nulla in automatico, l'email resta una bozza da inviare a mano
          const status = toCustomer ? 'draft' : to ? 'queued' : 'failed';
          await tx.query(
            `INSERT INTO record_emails (tenant_id, record_id, workflow_id, to_address, subject, body, to_customer, status, error, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              sec.tenantId,
              rec.id,
              wf.id,
              to,
              subject,
              body,
              toCustomer,
              status,
              status === 'failed' ? 'destinatario senza indirizzo email' : null,
              sec.userId,
            ],
          );
          done.push(toCustomer ? 'email al cliente preparata (da inviare)' : 'email interna in coda');
          break;
        }
      }
    }
    return done.join('; ');
  }

  private async fieldValue(ctx: TemplateContext, f: FieldDef, value: string | number | boolean | null) {
    if (typeof value !== 'string') return value;
    const single = value.match(/^\$([a-z0-9_]+(?:\.[a-z0-9_]+)?)\$$/);
    if (single && !TEXT_TYPES.has(f.type)) return ctx.value(single[1], true);
    if (!TEXT_TYPES.has(f.type)) return value;
    return ctx.render(value);
  }

  private async recipient(tx: Tx, ctx: TemplateContext, to: string) {
    if (to === 'owner' || to.startsWith('user:')) {
      const id = to === 'owner' ? ctx.record.owner_id : to.slice(5);
      return (await tx.query(`SELECT email FROM users WHERE id = $1 AND active`, [id])).rows[0]?.email ?? '';
    }
    return ctx.value(to.slice(6), true);
  }

  // ---------------------------------------------------------------- pulsante sulla scheda

  async runManual(tx: Tx, sec: SecurityContext, module: string, recordId: string, workflowId: string) {
    await this.records.loadWritable(tx, sec, module, recordId);
    const wf = (
      await tx.query<WorkflowRow>(
        `SELECT * FROM workflows WHERE id = $1 AND module = $2 AND active AND trigger->>'type' = 'manual'`,
        [workflowId, module],
      )
    ).rows[0];
    if (!wf) throw new BadRequestException('Workflow non disponibile');
    const sys = this.systemContext(sec.tenantId, sec.userId, wf.id);
    if (!(await this.matches(tx, sys, wf, recordId))) {
      throw new BadRequestException('Il record non rispetta le condizioni del workflow');
    }
    const res = await this.runSafely(tx, wf, recordId, sec.userId, null);
    if (res.error) throw new BadRequestException(`Workflow non eseguito: ${res.error}`);
    return { message: res.message ?? '' };
  }

  // ---------------------------------------------------------------- scadenze e coda email

  /** Esegue i workflow a tempo di tutti i tenant; restituisce quante esecuzioni ha fatto. */
  async runScheduled(now = new Date()): Promise<number> {
    const tenants = (await this.db.query<{ id: string }>(`SELECT id FROM tenants`)).rows;
    let count = 0;
    for (const t of tenants) {
      count += await this.db.withTenant(t.id, async (tx) => {
        let n = 0;
        const workflows = (
          await tx.query<WorkflowRow>(`SELECT * FROM workflows WHERE active AND trigger->>'type' = 'scheduled'`)
        ).rows;
        for (const wf of workflows) {
          if (wf.trigger.type !== 'scheduled') continue;
          try {
            n += await this.runScheduledWorkflow(tx, wf, now);
          } catch (err) {
            this.logger.warn(`workflow a tempo "${wf.name}": ${errorText(err)}`);
          }
        }
        return n;
      });
    }
    return count;
  }

  private async runScheduledWorkflow(tx: Tx, wf: WorkflowRow, now: Date) {
    if (wf.trigger.type !== 'scheduled') return 0;
    const sec = this.systemContext(wf.tenant_id, wf.created_by, wf.id);
    const { where, params } = await this.reports.filterWhere(tx, sec, wf.module, wf.conditions, true);
    const from = wf.trigger.from;
    let anchorSql: string;
    if (from === 'created') anchorSql = 'r.created_at';
    else if (from === 'updated') anchorSql = 'r.updated_at';
    else if (from.startsWith('field:')) {
      params.push(from.slice(6));
      anchorSql = `(nullif(r.data->>$${params.length}, ''))::timestamptz`;
    } else {
      // ultimo cambio del campo, dallo storico (alla creazione lo storico contiene tutti i valori)
      params.push(from.slice(8));
      anchorSql = `(SELECT max(h.created_at) FROM record_history h WHERE h.record_id = r.id AND h.changes ? $${params.length})`;
    }
    params.push(wf.trigger.days, now.toISOString(), wf.id);
    const [days, at, wfId] = [params.length - 2, params.length - 1, params.length];
    const due = (
      await tx.query<{ id: string; anchor: Date }>(
        `SELECT r.id, a.anchor FROM records r
           CROSS JOIN LATERAL (SELECT ${anchorSql} AS anchor) a
          WHERE ${where} AND a.anchor IS NOT NULL
            AND a.anchor + make_interval(days => $${days}) <= $${at}::timestamptz
            AND NOT EXISTS (SELECT 1 FROM workflow_runs w WHERE w.workflow_id = $${wfId}
                             AND w.record_id = r.id AND w.anchor = to_char(a.anchor AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'))
          ORDER BY a.anchor LIMIT 500`,
        params,
      )
    ).rows;
    let n = 0;
    for (const r of due) {
      const anchor = r.anchor.toISOString().slice(0, 19);
      if ((await this.runSafely(tx, wf, r.id, wf.created_by, anchor)).ran) n++;
    }
    return n;
  }

  /** Invia le email interne in coda (quelle per i clienti partono solo con il pulsante Invia). */
  async sendQueued(): Promise<number> {
    if (!this.mailer.configured) return 0;
    return this.db.transaction(async (tx) => {
      await tx.query(`SELECT set_config('app.worker', 'on', true)`);
      const rows = (
        await tx.query(
          `SELECT id, to_address, subject, body FROM record_emails
            WHERE status = 'queued' AND NOT to_customer ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED`,
        )
      ).rows;
      for (const e of rows) {
        try {
          await this.mailer.send(e.to_address, e.subject, e.body);
          await tx.query(`UPDATE record_emails SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1`, [e.id]);
        } catch (err) {
          await tx.query(`UPDATE record_emails SET status = 'failed', error = $2 WHERE id = $1`, [e.id, errorText(err)]);
        }
      }
      return rows.length;
    });
  }
}

export function errorText(err: unknown): string {
  const e = err as {
    response?: { message?: unknown; errors?: Record<string, string> };
    errors?: Record<string, string>;
    message?: string;
  };
  const errors = e?.response?.errors ?? e?.errors;
  if (errors && typeof errors === 'object') {
    return Object.entries(errors)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  if (typeof e?.response?.message === 'string') return e.response.message;
  return e?.message ?? String(err);
}
