import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Tx } from '../db/database.service';
import { FieldDef, isUuid } from '../metadata/field-types';
import { MetadataService } from '../metadata/metadata.service';
import { ReportsService } from '../reports/reports.service';
import { SecurityContext } from '../security/security-context';
import { PLACEHOLDER } from './templates';
import { WorkflowBody } from './workflow-config';

const DATE_TYPES = new Set(['date', 'datetime']);
const SPECIAL = new Set(['record', 'owner', 'today']);

function present(r: any) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    module: r.module,
    active: r.active,
    trigger: r.trigger,
    conditions: r.conditions,
    actions: r.actions,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.last_run_at !== undefined ? { lastRunAt: r.last_run_at, runs: Number(r.runs), errors: Number(r.errors) } : {}),
  };
}

/** Gestione dei workflow (solo amministratori) e controlli sulla definizione. */
@Injectable()
export class WorkflowsService {
  constructor(
    private readonly meta: MetadataService,
    private readonly reports: ReportsService,
  ) {}

  async list(tx: Tx, module?: string) {
    const r = await tx.query(
      `SELECT w.*,
              (SELECT max(created_at) FROM workflow_runs x WHERE x.workflow_id = w.id) AS last_run_at,
              (SELECT count(*) FROM workflow_runs x WHERE x.workflow_id = w.id) AS runs,
              (SELECT count(*) FROM workflow_runs x WHERE x.workflow_id = w.id AND x.status = 'error') AS errors
         FROM workflows w WHERE ($1::text IS NULL OR w.module = $1) ORDER BY w.module, lower(w.name)`,
      [module ?? null],
    );
    return r.rows.map(present);
  }

  async get(tx: Tx, id: string) {
    if (!isUuid(id)) throw new NotFoundException('Workflow inesistente');
    const r = await tx.query(`SELECT * FROM workflows WHERE id = $1`, [id]);
    if (!r.rows[0]) throw new NotFoundException('Workflow inesistente');
    return present(r.rows[0]);
  }

  async create(tx: Tx, sec: SecurityContext, body: WorkflowBody) {
    await this.validate(tx, sec, body);
    const r = await tx.query(
      `INSERT INTO workflows (tenant_id, name, description, module, active, trigger, conditions, actions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        sec.tenantId,
        body.name,
        body.description,
        body.module,
        body.active,
        JSON.stringify(body.trigger),
        JSON.stringify(body.conditions),
        JSON.stringify(body.actions),
        sec.userId,
      ],
    );
    return present(r.rows[0]);
  }

  async update(tx: Tx, sec: SecurityContext, id: string, body: WorkflowBody) {
    await this.get(tx, id);
    await this.validate(tx, sec, body);
    const r = await tx.query(
      `UPDATE workflows SET name = $2, description = $3, module = $4, active = $5, trigger = $6, conditions = $7,
              actions = $8, updated_at = now() WHERE id = $1 RETURNING *`,
      [
        id,
        body.name,
        body.description,
        body.module,
        body.active,
        JSON.stringify(body.trigger),
        JSON.stringify(body.conditions),
        JSON.stringify(body.actions),
      ],
    );
    return present(r.rows[0]);
  }

  async remove(tx: Tx, id: string) {
    await this.get(tx, id);
    await tx.query(`DELETE FROM workflows WHERE id = $1`, [id]);
    return { ok: true };
  }

  async runs(tx: Tx, id: string) {
    await this.get(tx, id);
    const r = await tx.query(
      `SELECT w.id, w.record_id, w.status, w.message, w.created_at, r.label, r.module
         FROM workflow_runs w JOIN records r ON r.id = w.record_id
        WHERE w.workflow_id = $1 ORDER BY w.created_at DESC, w.id DESC LIMIT 100`,
      [id],
    );
    return r.rows.map((x) => ({
      id: Number(x.id),
      recordId: x.record_id,
      recordLabel: x.label,
      module: x.module,
      status: x.status,
      message: x.message,
      createdAt: x.created_at,
    }));
  }

  /** Controlla che campi, condizioni e destinatari esistano davvero nel modulo. */
  async validate(tx: Tx, sec: SecurityContext, body: WorkflowBody) {
    await this.meta.getModule(tx, body.module);
    const fields = await this.meta.listFields(tx, body.module);
    const byName = new Map(fields.map((f) => [f.name, f]));
    const errors: Record<string, string> = {};
    const t = body.trigger;

    if (t.type === 'field_change' && !byName.has(t.field)) errors['trigger.field'] = 'campo sconosciuto';
    if (t.type === 'scheduled') {
      if (t.from.startsWith('field:')) {
        const f = byName.get(t.from.slice(6));
        if (!f || !DATE_TYPES.has(f.type)) errors['trigger.from'] = 'scegli un campo data';
      } else if (t.from.startsWith('changed:') && !byName.has(t.from.slice(8))) {
        errors['trigger.from'] = 'campo sconosciuto';
      }
    }

    try {
      await this.reports.filterWhere(tx, { ...sec, isAdmin: true }, body.module, body.conditions, true);
    } catch (err) {
      const e = (err as { response?: { errors?: Record<string, string> } }).response?.errors ?? {};
      for (const [k, v] of Object.entries(e)) errors[k.replace('filters', 'conditions')] = v;
      if (!Object.keys(e).length) errors.conditions = (err as Error).message;
    }

    const activityFields = await this.meta.listFields(tx, 'Activities').catch(() => [] as FieldDef[]);
    for (const [i, a] of body.actions.entries()) {
      const key = `actions.${i}`;
      const texts: string[] = [];
      if (a.type === 'update_field') {
        const f = byName.get(a.field);
        if (!f) errors[`${key}.field`] = 'campo sconosciuto';
        else if (f.options.computed) errors[`${key}.field`] = `${f.label} è calcolato dal sistema`;
        if (typeof a.value === 'string') texts.push(a.value);
      }
      if (a.type === 'create_activity') {
        const types = activityFields.find((f) => f.name === 'activity_type')?.options.values ?? [];
        if (!types.includes(a.activityType)) errors[`${key}.activityType`] = 'tipo di attività sconosciuto';
        if (a.assignTo.startsWith('user:') && !(await this.userExists(tx, a.assignTo.slice(5)))) {
          errors[`${key}.assignTo`] = 'utente inesistente';
        }
        texts.push(a.subject, a.description);
      }
      if (a.type === 'send_email') {
        if (a.to.startsWith('user:') && !(await this.userExists(tx, a.to.slice(5)))) errors[`${key}.to`] = 'utente inesistente';
        if (a.to.startsWith('field:')) {
          const msg = await this.checkPath(tx, byName, a.to.slice(6), 'email');
          if (msg) errors[`${key}.to`] = msg;
        }
        texts.push(a.subject, a.body);
      }
      for (const text of texts) {
        for (const m of text.matchAll(PLACEHOLDER)) {
          if (SPECIAL.has(m[1])) continue;
          const msg = await this.checkPath(tx, byName, m[1]);
          if (msg) errors[key] = `segnaposto $${m[1]}$: ${msg}`;
        }
      }
    }
    if (Object.keys(errors).length) throw new BadRequestException({ message: 'Workflow non valido', errors });
  }

  /** "campo" o "relazione.campo"; con type controlla anche il tipo del campo finale. */
  private async checkPath(tx: Tx, byName: Map<string, FieldDef>, path: string, type?: string) {
    const [name, sub] = path.split('.');
    const f = byName.get(name);
    if (!f) return 'campo sconosciuto';
    if (!sub) return type && f.type !== type ? `${f.label} non è un campo ${type}` : null;
    if (f.type === 'user') return sub === 'email' ? null : 'di un utente si può usare solo .email';
    if (f.type !== 'relation') return `${f.label} non è un collegamento`;
    const target = (await this.meta.listFields(tx, String(f.options.module))).find((x) => x.name === sub);
    if (!target) return `campo sconosciuto nel record collegato: ${sub}`;
    return type && target.type !== type ? `${target.label} non è un campo ${type}` : null;
  }

  private async userExists(tx: Tx, id: string) {
    if (!isUuid(id)) return false;
    return !!(await tx.query(`SELECT 1 FROM users WHERE id = $1`, [id])).rowCount;
  }
}
