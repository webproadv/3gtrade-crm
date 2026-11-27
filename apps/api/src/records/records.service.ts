import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Tx } from '../db/database.service';
import { enqueueEvent } from '../events/outbox';
import {
  FieldDef,
  FieldValidationError,
  computeLabel,
  isUuid,
  normalizeValue,
  resolveDefault,
  validateRecordData,
} from '../metadata/field-types';
import { AUTO_NUMBERS, AutoNumber } from './auto-numbers';
import { OPPORTUNITY_CLOSED, PDA_INACTIVE, beforeSave } from './automations';
import { LINE_DOCUMENTS, formatDocNumber, grandTotal } from './line-documents';
import { checkModuleRules } from './module-rules';
import { MetadataService, ModuleDef } from '../metadata/metadata.service';
import { SecurityContext, can, canAccessRecord } from '../security/security-context';

export interface ListQuery {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
  filter?: Record<string, string>;
  /** campo >= valore (date, date/ora, numeri) */
  after?: Record<string, string>;
  /** campo <= valore (date, date/ora, numeri) */
  before?: Record<string, string>;
  /** uso interno: limite massimo di righe per pagina */
  maxPageSize?: number;
  ownerId?: string;
}

export interface Row {
  id: string;
  module: string;
  label: string;
  owner_id: string;
  data: Record<string, unknown>;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

const CORE_SORT: Record<string, string> = {
  label: 'lower(r.label)',
  createdAt: 'r.created_at',
  updatedAt: 'r.updated_at',
};
const NUMERIC = new Set(['integer', 'number', 'currency', 'percent']);
// date e date/ora sono salvate in ISO 8601 (UTC), quindi confrontabili come testo
const RANGE_TYPES = new Set([...NUMERIC, 'date', 'datetime']);

@Injectable()
export class RecordsService {
  constructor(private readonly meta: MetadataService) {}

  private async context(tx: Tx, sec: SecurityContext, module: string, action: 'view' | 'create' | 'edit' | 'delete') {
    const mod = await this.meta.getModule(tx, module);
    if (!can(sec, module, action)) throw new ForbiddenException('Permesso negato sul modulo');
    const fields = this.meta.visibleFields(sec, await this.meta.listFields(tx, module));
    return { mod, fields };
  }

  /** Condizione SQL di visibilità dei record per l'utente. */
  visibility(sec: SecurityContext, mod: ModuleDef, params: unknown[], alias = 'r'): string {
    if (sec.isAdmin || mod.sharing !== 'private') return 'TRUE';
    params.push(sec.visibleOwnerIds);
    return `${alias}.owner_id = ANY($${params.length}::uuid[])`;
  }

  private present(row: Row, fields: FieldDef[]) {
    const data: Record<string, unknown> = {};
    for (const f of fields) if (row.data[f.name] !== undefined) data[f.name] = row.data[f.name];
    return {
      id: row.id,
      module: row.module,
      label: row.label,
      ownerId: row.owner_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      data,
    };
  }

  /** Risolve le etichette dei record e degli utenti referenziati. */
  async refs(tx: Tx, rows: Row[], fields: FieldDef[]) {
    const recordIds = new Set<string>();
    const userIds = new Set<string>();
    for (const row of rows) {
      userIds.add(row.owner_id);
      for (const f of fields) {
        const v = row.data[f.name];
        if (typeof v !== 'string') continue;
        if (f.type === 'relation') recordIds.add(v);
        if (f.type === 'user') userIds.add(v);
      }
    }
    const records: Record<string, { label: string; module: string }> = {};
    const users: Record<string, string> = {};
    if (recordIds.size) {
      const r = await tx.query(
        `SELECT id, label, module FROM records WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [[...recordIds]],
      );
      for (const x of r.rows) records[x.id] = { label: x.label, module: x.module };
    }
    if (userIds.size) {
      const r = await tx.query(
        `SELECT id, trim(first_name || ' ' || last_name) AS name FROM users WHERE id = ANY($1::uuid[])`,
        [[...userIds]],
      );
      for (const x of r.rows) users[x.id] = x.name;
    }
    return { records, users };
  }

  async list(tx: Tx, sec: SecurityContext, module: string, query: ListQuery) {
    const { mod, fields } = await this.context(tx, sec, module, 'view');
    const params: unknown[] = [module];
    const where = [`r.module = $1`, `r.deleted_at IS NULL`, this.visibility(sec, mod, params)];

    if (query.q?.trim()) {
      params.push(`%${query.q.trim().toLowerCase()}%`);
      where.push(`lower(r.label) LIKE $${params.length}`);
    }
    if (query.ownerId) {
      if (!isUuid(query.ownerId)) throw new BadRequestException('ownerId non valido');
      params.push(query.ownerId);
      where.push(`r.owner_id = $${params.length}`);
    }
    const byName = new Map(fields.map((f) => [f.name, f]));
    for (const [name, value] of Object.entries(query.filter ?? {})) {
      if (!byName.has(name)) throw new BadRequestException(`Filtro su campo sconosciuto: ${name}`);
      params.push(name, String(value));
      where.push(`r.data->>$${params.length - 1} = $${params.length}`);
    }
    for (const [op, values] of [['>=', query.after], ['<=', query.before]] as const) {
      for (const [name, raw] of Object.entries(values ?? {})) {
        const f = byName.get(name);
        if (!f || !RANGE_TYPES.has(f.type)) throw new BadRequestException(`Intervallo non ammesso sul campo ${name}`);
        const [value, err] = normalizeValue(f, raw);
        if (err || value === null) throw new BadRequestException(`Valore non valido per ${name}: ${err ?? 'vuoto'}`);
        params.push(name, value);
        where.push(
          NUMERIC.has(f.type)
            ? `(r.data->>$${params.length - 1})::numeric ${op} $${params.length}::numeric`
            : `r.data->>$${params.length - 1} ${op} $${params.length}`,
        );
      }
    }

    const whereSql = where.join(' AND ');
    const total = Number(
      (await tx.query(`SELECT count(*) FROM records r WHERE ${whereSql}`, params)).rows[0].count,
    );

    // il parametro dell'ordinamento va aggiunto dopo il count, che non lo usa
    let orderBy = 'r.updated_at';
    if (query.sort) {
      if (CORE_SORT[query.sort]) orderBy = CORE_SORT[query.sort];
      else {
        const f = byName.get(query.sort);
        if (!f) throw new BadRequestException(`Ordinamento su campo sconosciuto: ${query.sort}`);
        params.push(f.name);
        orderBy = NUMERIC.has(f.type) ? `(r.data->>$${params.length})::numeric` : `lower(r.data->>$${params.length})`;
      }
    }
    const dir = query.dir === 'asc' ? 'ASC' : 'DESC';
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 25, 1), query.maxPageSize ?? 200);
    const page = Math.max(Number(query.page) || 1, 1);
    const rows = (
      await tx.query<Row>(
        `SELECT r.* FROM records r WHERE ${whereSql}
          ORDER BY ${orderBy} ${dir} NULLS LAST, r.id
          LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        params,
      )
    ).rows;

    return {
      items: rows.map((r) => this.present(r, fields)),
      total,
      page,
      pageSize,
      refs: await this.refs(tx, rows, fields),
    };
  }

  private async load(tx: Tx, module: string, id: string): Promise<Row> {
    if (!isUuid(id)) throw new NotFoundException('Record inesistente');
    const r = await tx.query<Row>(
      `SELECT * FROM records WHERE id = $1 AND module = $2 AND deleted_at IS NULL`,
      [id, module],
    );
    if (!r.rows[0]) throw new NotFoundException('Record inesistente');
    return r.rows[0];
  }

  async get(tx: Tx, sec: SecurityContext, module: string, id: string) {
    const { mod, fields } = await this.context(tx, sec, module, 'view');
    const row = await this.load(tx, module, id);
    if (!canAccessRecord(sec, mod.sharing, row.owner_id, 'read')) throw new ForbiddenException('Record non accessibile');
    const writable = canAccessRecord(sec, mod.sharing, row.owner_id, 'write');
    return {
      ...this.present(row, fields),
      refs: await this.refs(tx, [row], fields),
      permissions: {
        edit: writable && can(sec, module, 'edit'),
        delete: writable && can(sec, module, 'delete'),
      },
    };
  }

  /** Verifica che riferimenti a record e utenti esistano nel tenant. */
  private async checkReferences(tx: Tx, fields: FieldDef[], data: Record<string, unknown>) {
    const errors: Record<string, string> = {};
    for (const f of fields) {
      const v = data[f.name];
      if (typeof v !== 'string') continue;
      if (f.type === 'relation') {
        const r = await tx.query(
          `SELECT 1 FROM records WHERE id = $1 AND module = $2 AND deleted_at IS NULL`,
          [v, f.options.module],
        );
        if (!r.rowCount) errors[f.name] = 'record collegato inesistente';
      } else if (f.type === 'user') {
        const r = await tx.query(`SELECT 1 FROM users WHERE id = $1 AND active`, [v]);
        if (!r.rowCount) errors[f.name] = 'utente inesistente';
      }
    }
    if (Object.keys(errors).length) throw new FieldValidationError(errors);
  }

  private checkRules(module: string, data: Record<string, unknown>) {
    const errors = checkModuleRules(module, data);
    if (Object.keys(errors).length) throw new FieldValidationError(errors);
  }

  private async checkOwner(tx: Tx, ownerId: unknown): Promise<string> {
    if (!isUuid(ownerId)) throw new FieldValidationError({ ownerId: 'assegnatario non valido' });
    const r = await tx.query(`SELECT 1 FROM users WHERE id = $1 AND active`, [ownerId]);
    if (!r.rowCount) throw new FieldValidationError({ ownerId: 'assegnatario inesistente' });
    return ownerId;
  }

  private editableSet(fields: (FieldDef & { editable: boolean })[]) {
    return new Set(fields.filter((f) => f.editable).map((f) => f.name));
  }

  async create(tx: Tx, sec: SecurityContext, module: string, body: { data?: Record<string, unknown>; ownerId?: string }) {
    const { mod, fields } = await this.context(tx, sec, module, 'create');
    const editable = this.editableSet(fields);
    // i valori predefiniti dei campi modificabili valgono come se l'utente li avesse indicati
    const input: Record<string, unknown> = { ...body.data };
    for (const f of fields) {
      if (editable.has(f.name) && input[f.name] === undefined && f.options.default !== undefined) {
        input[f.name] = resolveDefault(f.options.default);
      }
    }
    // valida solo i campi visibili: un obbligatorio nascosto all'utente non blocca la creazione
    const data = validateRecordData(fields, input, { isCreate: true, editable });
    for (const k of Object.keys(data)) if (data[k] === null) delete data[k];
    // gli altri campi (nascosti o in sola lettura) ricevono comunque il loro predefinito
    for (const f of await this.meta.listFields(tx, module)) {
      if (data[f.name] !== undefined || f.options.default === undefined) continue;
      const [v, err] = normalizeValue(f, resolveDefault(f.options.default));
      if (!err && v !== null) data[f.name] = v;
    }
    const numbering = AUTO_NUMBERS[module];
    if (numbering) data[numbering.field] = await this.nextNumber(tx, sec, module, numbering);
    const doc = LINE_DOCUMENTS[module];
    if (doc) {
      data[doc.totals.net] = 0;
      data[doc.totals.vat] = 0;
      data[doc.totals.total] = grandTotal(0, 0, data[doc.totals.adjustment]);
    }
    Object.assign(data, beforeSave(module, data, null));
    this.checkRules(module, data);
    await this.checkReferences(tx, fields, data);
    const ownerId = body.ownerId ? await this.checkOwner(tx, body.ownerId) : sec.userId;
    const label = computeLabel(mod.labelFields, data);

    const row = (
      await tx.query<Row>(
        `INSERT INTO records (tenant_id, module, label, owner_id, data, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [sec.tenantId, module, label, ownerId, JSON.stringify(data), sec.userId],
      )
    ).rows[0];
    await this.history(tx, sec, row.id, 'create', data);
    await enqueueEvent(tx, sec.tenantId, 'record.created', { module, recordId: row.id, userId: sec.userId, data });
    await this.afterWrite(tx, sec, module, row.id, null, data);
    return this.get(tx, sec, module, row.id);
  }

  /**
   * Crea un record partendo da dati copiati da un altro record (es. conversione del lead):
   * tiene solo i campi che l'utente può valorizzare nel modulo di destinazione e i valori non vuoti.
   */
  async createFrom(
    tx: Tx,
    sec: SecurityContext,
    module: string,
    values: Record<string, unknown>,
    ownerId?: string,
  ) {
    const { fields } = await this.context(tx, sec, module, 'create');
    const editable = this.editableSet(fields);
    const data = Object.fromEntries(
      Object.entries(values).filter(([k, v]) => editable.has(k) && v !== undefined && v !== null && v !== ''),
    );
    return this.create(tx, sec, module, { data, ownerId });
  }

  /** Prossimo numero progressivo del record per l'anno in corso (contatore per azienda, modulo e anno). */
  private async nextNumber(tx: Tx, sec: SecurityContext, module: string, numbering: AutoNumber) {
    const year = new Date().getFullYear();
    const r = await tx.query(
      `INSERT INTO record_counters (tenant_id, module, year, last_value) VALUES ($1, $2, $3, 1)
       ON CONFLICT (tenant_id, module, year) DO UPDATE SET last_value = record_counters.last_value + 1
       RETURNING last_value`,
      [sec.tenantId, module, year],
    );
    return formatDocNumber(numbering.prefix, year, r.rows[0].last_value);
  }

  /** Record modificabile dall'utente (permesso sul modulo e visibilità del record), per le righe. */
  async loadWritable(tx: Tx, sec: SecurityContext, module: string, id: string) {
    const { mod } = await this.context(tx, sec, module, 'edit');
    const row = await this.load(tx, module, id);
    if (!canAccessRecord(sec, mod.sharing, row.owner_id, 'write')) throw new ForbiddenException('Record non modificabile');
    return { mod, row };
  }

  /** Scrive campi calcolati dal sistema (es. totali delle righe) con storico ed evento. */
  async setComputed(tx: Tx, sec: SecurityContext, module: string, row: Row, values: Record<string, unknown>) {
    const next: Record<string, unknown> = { ...row.data };
    const changes: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of Object.entries(values)) {
      const before = row.data[k] ?? null;
      if (JSON.stringify(before) === JSON.stringify(v)) continue;
      changes[k] = [before, v];
      next[k] = v;
    }
    if (!Object.keys(changes).length) return;
    await tx.query(`UPDATE records SET data = $2, updated_at = now() WHERE id = $1`, [row.id, JSON.stringify(next)]);
    await this.history(tx, sec, row.id, 'update', changes);
    await enqueueEvent(tx, sec.tenantId, 'record.updated', { module, recordId: row.id, userId: sec.userId, changes });
    await this.afterWrite(tx, sec, module, row.id, row.data, next);
  }

  async update(
    tx: Tx,
    sec: SecurityContext,
    module: string,
    id: string,
    body: { data?: Record<string, unknown>; ownerId?: string },
  ) {
    const { mod, fields } = await this.context(tx, sec, module, 'edit');
    const row = await this.load(tx, module, id);
    if (!canAccessRecord(sec, mod.sharing, row.owner_id, 'write')) throw new ForbiddenException('Record non modificabile');

    const patch = validateRecordData(fields, body.data ?? {}, { isCreate: false, editable: this.editableSet(fields) });
    await this.checkReferences(tx, fields, patch);
    const next: Record<string, unknown> = { ...row.data };
    const changes: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of Object.entries(patch)) {
      const before = row.data[k] ?? null;
      if (JSON.stringify(before) === JSON.stringify(v)) continue;
      changes[k] = [before, v];
      if (v === null) delete next[k];
      else next[k] = v;
    }
    const doc = LINE_DOCUMENTS[module];
    if (doc && doc.totals.adjustment in changes) {
      const t = doc.totals;
      const total = grandTotal(Number(next[t.net] ?? 0), Number(next[t.vat] ?? 0), next[t.adjustment]);
      if (total !== (row.data[t.total] ?? null)) changes[t.total] = [row.data[t.total] ?? null, total];
      next[t.total] = total;
    }
    for (const [k, v] of Object.entries(beforeSave(module, next, row.data))) {
      if (JSON.stringify(next[k] ?? null) === JSON.stringify(v)) continue;
      changes[k] = [row.data[k] ?? null, v];
      next[k] = v;
    }
    this.checkRules(module, next);
    let ownerId = row.owner_id;
    if (body.ownerId && body.ownerId !== row.owner_id) {
      ownerId = await this.checkOwner(tx, body.ownerId);
      changes.ownerId = [row.owner_id, ownerId];
    }
    if (!Object.keys(changes).length) return this.get(tx, sec, module, id);

    await tx.query(
      `UPDATE records SET data = $2, label = $3, owner_id = $4, updated_at = now() WHERE id = $1`,
      [id, JSON.stringify(next), computeLabel(mod.labelFields, next), ownerId],
    );
    await this.history(tx, sec, id, 'update', changes);
    await enqueueEvent(tx, sec.tenantId, 'record.updated', { module, recordId: id, userId: sec.userId, changes });
    await this.afterWrite(tx, sec, module, id, row.data, next);
    return this.get(tx, sec, module, id);
  }

  async remove(tx: Tx, sec: SecurityContext, module: string, id: string) {
    const { mod } = await this.context(tx, sec, module, 'delete');
    const row = await this.load(tx, module, id);
    if (!canAccessRecord(sec, mod.sharing, row.owner_id, 'write')) throw new ForbiddenException('Record non eliminabile');
    await tx.query(`UPDATE records SET deleted_at = now() WHERE id = $1`, [id]);
    await this.history(tx, sec, id, 'delete', {});
    await enqueueEvent(tx, sec.tenantId, 'record.deleted', { module, recordId: id, userId: sec.userId });
    await this.afterWrite(tx, sec, module, id, row.data, null);
    return { ok: true };
  }

  /**
   * Automatismi dopo il salvataggio (eseguiti dal sistema, nella stessa transazione):
   * - una PDA che ne sostituisce un'altra porta quella vecchia allo stato "Sostituita";
   * - PDA e opportunità aggiornano le statistiche del cliente collegato.
   */
  private async afterWrite(
    tx: Tx,
    sec: SecurityContext,
    module: string,
    id: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) {
    if (module !== 'SalesOrders' && module !== 'Opportunities') return;
    const accounts = new Set<string>();
    for (const d of [before, after]) if (d && typeof d.account_id === 'string') accounts.add(d.account_id);

    const replaced = after?.replaces_pda_id;
    if (
      module === 'SalesOrders' &&
      typeof replaced === 'string' &&
      replaced !== before?.replaces_pda_id &&
      replaced !== id
    ) {
      const old = (
        await tx.query<Row>(`SELECT * FROM records WHERE id = $1 AND module = 'SalesOrders' AND deleted_at IS NULL`, [
          replaced,
        ])
      ).rows[0];
      if (old && old.data.status !== 'Sostituita') {
        await this.setComputed(tx, sec, 'SalesOrders', old, { status: 'Sostituita' });
      }
    }
    for (const accountId of accounts) await this.refreshAccountStats(tx, sec, accountId);
  }

  /** Statistiche del cliente (come il blocco "Statistici" di vtenext), ricalcolate dal sistema. */
  private async refreshAccountStats(tx: Tx, sec: SecurityContext, accountId: string) {
    const account = (
      await tx.query<Row>(`SELECT * FROM records WHERE id = $1 AND module = 'Accounts' AND deleted_at IS NULL`, [
        accountId,
      ])
    ).rows[0];
    if (!account) return;
    const fields = new Set((await this.meta.listFields(tx, 'Accounts')).map((f) => f.name));
    if (!fields.has('pda_active_count')) return;
    const s = (
      await tx.query(
        `SELECT
           count(*) FILTER (WHERE r.module = 'SalesOrders' AND NOT (coalesce(r.data->>'status', '') = ANY($2))) AS pda_active,
           sum((r.data->>'grand_total')::numeric) FILTER (WHERE r.module = 'SalesOrders' AND NOT (coalesce(r.data->>'status', '') = ANY($2))) AS pda_total,
           max(r.data->>'order_date') FILTER (WHERE r.module = 'SalesOrders') AS last_pda,
           count(*) FILTER (WHERE r.module = 'Opportunities' AND NOT (coalesce(r.data->>'sales_stage', '') = ANY($3))) AS opp_open
         FROM records r
        WHERE r.module IN ('SalesOrders', 'Opportunities') AND r.deleted_at IS NULL AND r.data->>'account_id' = $1`,
        [accountId, PDA_INACTIVE, OPPORTUNITY_CLOSED],
      )
    ).rows[0];
    await this.setComputed(tx, sec, 'Accounts', account, {
      pda_active_count: Number(s.pda_active),
      pda_active_total: s.pda_total === null ? 0 : Number(s.pda_total),
      last_pda_date: s.last_pda ?? null,
      open_opportunities_count: Number(s.opp_open),
    });
  }

  /** Liste correlate: record di altri moduli che puntano a questo tramite un campo relazione. */
  async related(tx: Tx, sec: SecurityContext, module: string, id: string) {
    await this.get(tx, sec, module, id); // verifica accesso
    const allFields = await this.meta.listFields(tx);
    const relFields = allFields.filter((f) => f.type === 'relation' && f.options.module === module);
    const out = [];
    for (const rf of relFields) {
      if (!can(sec, rf.module, 'view') || sec.hiddenFields.has(rf.id)) continue;
      const res = await this.list(tx, sec, rf.module, { filter: { [rf.name]: id }, pageSize: 50 });
      const mod = await this.meta.getModule(tx, rf.module);
      out.push({ module: rf.module, label: mod.label, field: rf.name, fieldLabel: rf.label, ...res });
    }
    return out;
  }

  async historyOf(tx: Tx, sec: SecurityContext, module: string, id: string) {
    await this.get(tx, sec, module, id); // verifica accesso
    const r = await tx.query(
      `SELECT h.id, h.action, h.changes, h.created_at, trim(u.first_name || ' ' || u.last_name) AS user_name
         FROM record_history h LEFT JOIN users u ON u.id = h.user_id
        WHERE h.record_id = $1 ORDER BY h.created_at DESC, h.id DESC LIMIT 100`,
      [id],
    );
    const { fields } = await this.context(tx, sec, module, 'view');
    const fieldNames = new Set(fields.map((f) => f.name).concat('ownerId'));
    return r.rows.map((h) => ({
      id: h.id,
      action: h.action,
      userName: h.user_name,
      createdAt: h.created_at,
      changes: Object.fromEntries(Object.entries(h.changes ?? {}).filter(([k]) => fieldNames.has(k))),
    }));
  }

  private async history(tx: Tx, sec: SecurityContext, recordId: string, action: string, changes: object) {
    await tx.query(
      `INSERT INTO record_history (tenant_id, record_id, user_id, action, changes) VALUES ($1, $2, $3, $4, $5)`,
      [sec.tenantId, recordId, sec.userId, action, JSON.stringify(changes)],
    );
  }
}
