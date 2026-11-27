import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Tx } from '../db/database.service';
import { FieldDef, FieldType, isUuid, normalizeValue } from '../metadata/field-types';
import { MetadataService } from '../metadata/metadata.service';
import { RecordsService, Row } from '../records/records.service';
import { SecurityContext, can } from '../security/security-context';
import {
  CORE_COLUMNS,
  DATE_TYPES,
  GROUPABLE_TYPES,
  NUMERIC_TYPES,
  Period,
  PERIODS,
  ReportBody,
  ReportConfig,
  periodRange,
} from './report-config';

export interface Column {
  key: string;
  label: string;
  type: FieldType;
  field?: FieldDef;
}

interface Refs {
  records: Record<string, { label: string; module: string }>;
  users: Record<string, string>;
}

export interface ReportResult {
  columns: Omit<Column, 'field'>[];
  rows: { id: string; values: Record<string, unknown> }[];
  rowCount: number;
  truncated: boolean;
  totalDefs: { key: string; label: string; type: FieldType }[];
  totals: Record<string, number | null>;
  groupBy: { key: string; label: string; type: FieldType; dateGroup?: string } | null;
  groups: { key: string | null; label: string; count: number; totals: Record<string, number | null> }[] | null;
  /** campi usati dal rapporto che l'utente non può vedere (o eliminati): ignorati */
  hidden: string[];
  refs: Refs;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_TYPES = new Set<FieldType>(['text', 'textarea', 'email', 'phone', 'url']);
const FN_LABEL = { sum: 'Somma', avg: 'Media', min: 'Minimo', max: 'Massimo' } as const;
const DATE_GROUP_LEN = { day: 10, month: 7, year: 4 } as const;
export const DISPLAY_ROWS = 500;
export const EXPORT_ROWS = 20000;
const MAX_GROUPS = 500;

const nextDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  const n = new Date(Date.UTC(y, m - 1, day + 1));
  return n.toISOString().slice(0, 10);
};
/**
 * I nomi dei campi entrano nell'SQL come letterali e non come parametri: così le stesse espressioni
 * valgono in tutte le query del rapporto, anche in quelle che non usano tutti i parametri.
 * I nomi vengono dai metadati, non dalla richiesta.
 */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

@Injectable()
export class ReportsService {
  constructor(
    private readonly meta: MetadataService,
    private readonly records: RecordsService,
  ) {}

  // ---------- archivio dei rapporti ----------

  async list(tx: Tx, sec: SecurityContext) {
    const r = await tx.query(
      `SELECT rp.id, rp.name, rp.description, rp.module, rp.shared, rp.owner_id, rp.updated_at, m.label AS module_label,
              trim(u.first_name || ' ' || u.last_name) AS owner_name
         FROM reports rp JOIN modules m ON m.name = rp.module JOIN users u ON u.id = rp.owner_id
        WHERE rp.shared OR rp.owner_id = $1 OR $2
        ORDER BY lower(rp.name)`,
      [sec.userId, sec.isAdmin],
    );
    return r.rows
      .filter((x) => can(sec, x.module, 'view'))
      .map((x) => ({
        id: x.id,
        name: x.name,
        description: x.description,
        module: x.module,
        moduleLabel: x.module_label,
        shared: x.shared,
        ownerId: x.owner_id,
        ownerName: x.owner_name,
        updatedAt: x.updated_at,
        canEdit: sec.isAdmin || x.owner_id === sec.userId,
      }));
  }

  async get(tx: Tx, sec: SecurityContext, id: string) {
    if (!isUuid(id)) throw new NotFoundException('Rapporto inesistente');
    const x = (await tx.query(`SELECT * FROM reports WHERE id = $1`, [id])).rows[0];
    if (!x || !(x.shared || x.owner_id === sec.userId || sec.isAdmin)) throw new NotFoundException('Rapporto inesistente');
    if (!can(sec, x.module, 'view')) throw new ForbiddenException('Permesso negato sul modulo');
    return {
      id: x.id as string,
      name: x.name as string,
      description: x.description as string,
      module: x.module as string,
      shared: x.shared as boolean,
      ownerId: x.owner_id as string,
      config: x.config as ReportConfig,
      updatedAt: x.updated_at,
      canEdit: sec.isAdmin || x.owner_id === sec.userId,
    };
  }

  async create(tx: Tx, sec: SecurityContext, body: ReportBody) {
    await this.validate(tx, sec, body.module, body.config);
    const r = await tx.query(
      `INSERT INTO reports (tenant_id, name, description, module, config, shared, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [sec.tenantId, body.name, body.description, body.module, JSON.stringify(body.config), body.shared, sec.userId],
    );
    return this.get(tx, sec, r.rows[0].id);
  }

  async update(tx: Tx, sec: SecurityContext, id: string, body: ReportBody) {
    const cur = await this.get(tx, sec, id);
    if (!cur.canEdit) throw new ForbiddenException('Solo chi ha creato il rapporto o un amministratore può modificarlo');
    await this.validate(tx, sec, body.module, body.config);
    await tx.query(
      `UPDATE reports SET name = $2, description = $3, module = $4, config = $5, shared = $6, updated_at = now()
        WHERE id = $1`,
      [id, body.name, body.description, body.module, JSON.stringify(body.config), body.shared],
    );
    return this.get(tx, sec, id);
  }

  async remove(tx: Tx, sec: SecurityContext, id: string) {
    const cur = await this.get(tx, sec, id);
    if (!cur.canEdit) throw new ForbiddenException('Solo chi ha creato il rapporto o un amministratore può eliminarlo');
    await tx.query(`DELETE FROM reports WHERE id = $1`, [id]);
    return { ok: true };
  }

  // ---------- esecuzione ----------

  /** Colonne utilizzabili nel modulo: campi visibili all'utente più le colonne di sistema. */
  private async columnsOf(tx: Tx, sec: SecurityContext, module: string) {
    const all = await this.meta.listFields(tx, module);
    const visible = new Map(this.meta.visibleFields(sec, all).map((f) => [f.name, f]));
    const hiddenNames = new Map(all.filter((f) => !visible.has(f.name)).map((f) => [f.name, f.label]));
    const resolve = (key: string): Column | 'hidden' | undefined => {
      if (CORE_COLUMNS[key]) return { key, ...CORE_COLUMNS[key] };
      const f = visible.get(key);
      if (f) return { key, label: f.label, type: f.type, field: f };
      return hiddenNames.has(key) ? 'hidden' : undefined;
    };
    return { resolve, hiddenNames, fields: [...visible.values()] };
  }

  /** Controlla che la definizione sia coerente con i metadati (al salvataggio). */
  async validate(tx: Tx, sec: SecurityContext, module: string, config: ReportConfig) {
    await this.meta.getModule(tx, module);
    if (!can(sec, module, 'view')) throw new ForbiddenException('Permesso negato sul modulo');
    await this.plan(tx, sec, module, config, true);
  }

  /**
   * Traduce la definizione in SQL. I campi che l'utente non vede vengono ignorati (strict = false)
   * oppure rifiutati (strict = true, al salvataggio).
   */
  private async plan(tx: Tx, sec: SecurityContext, module: string, config: ReportConfig, strict: boolean) {
    const mod = await this.meta.getModule(tx, module);
    if (!can(sec, module, 'view')) throw new ForbiddenException('Permesso negato sul modulo');
    const { resolve, hiddenNames, fields } = await this.columnsOf(tx, sec, module);
    const hidden = new Set<string>();
    const errors: Record<string, string> = {};
    const pick = (key: string, where: string): Column | undefined => {
      const c = resolve(key);
      if (c === 'hidden') {
        if (strict) errors[where] = `campo non visibile: ${hiddenNames.get(key)}`;
        hidden.add(hiddenNames.get(key)!);
        return undefined;
      }
      if (!c) {
        // un campo eliminato dopo il salvataggio del rapporto: in esecuzione si ignora
        if (strict) errors[where] = `campo sconosciuto: ${key}`;
        else hidden.add(key);
      }
      return c;
    };

    const params: unknown[] = [module];
    const where = [`r.module = $1`, `r.deleted_at IS NULL`, this.records.visibility(sec, mod, params)];
    const expr = (c: Column): string => {
      if (c.key === 'ownerId') return `r.owner_id::text`;
      if (c.key === 'createdAt' || c.key === 'updatedAt') {
        const col = c.key === 'createdAt' ? 'r.created_at' : 'r.updated_at';
        return `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
      }
      return `(r.data->>${lit(c.key)})`;
    };
    const jsonExpr = (c: Column) => `(r.data->${lit(c.key)})`;
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };

    const columns = config.columns.map((k, i) => pick(k, `columns.${i}`)).filter((c): c is Column => !!c);

    config.filters.forEach((flt, i) => {
      const key = `filters.${i}`;
      const c = pick(flt.field, key);
      if (!c) return;
      const sql = this.filterSql(c, flt.op, flt.value, expr, jsonExpr, p);
      if (typeof sql === 'object') errors[key] = sql.error;
      else where.push(sql);
    });

    let group: { col: Column; sql: string; dateGroup?: 'day' | 'month' | 'year' } | null = null;
    if (config.groupBy) {
      const c = pick(config.groupBy.field, 'groupBy');
      if (c && !GROUPABLE_TYPES.has(c.type)) errors.groupBy = `non si può raggruppare per ${c.label}`;
      else if (c) {
        const dateGroup = DATE_TYPES.has(c.type) ? (config.groupBy.dateGroup ?? 'month') : undefined;
        const e = expr(c);
        group = { col: c, dateGroup, sql: dateGroup ? `left(${e}, ${DATE_GROUP_LEN[dateGroup]})` : e };
      }
    }

    const aggs: { key: string; label: string; type: FieldType; sql: string }[] = [];
    config.totals.forEach((t, i) => {
      const c = pick(t.field, `totals.${i}`);
      if (!c) return;
      if (!NUMERIC_TYPES.has(c.type)) {
        errors[`totals.${i}`] = `${c.label} non è un campo numerico`;
        return;
      }
      const key = `${t.fn}:${c.key}`;
      if (aggs.some((a) => a.key === key)) return;
      aggs.push({ key, label: `${FN_LABEL[t.fn]} ${c.label}`, type: c.type, sql: `${t.fn}((${expr(c)})::numeric)` });
    });

    let orderSql = 'r.updated_at DESC';
    if (config.sort) {
      const c = pick(config.sort.field, 'sort');
      if (c) {
        const e = expr(c);
        const dir = config.sort.dir === 'asc' ? 'ASC' : 'DESC';
        orderSql = NUMERIC_TYPES.has(c.type) ? `(${e})::numeric ${dir}` : `lower(${e}) ${dir}`;
      }
    }

    if (Object.keys(errors).length) throw new BadRequestException({ message: 'Rapporto non valido', errors });
    if (!columns.length) throw new BadRequestException('Nessuna colonna visibile in questo rapporto');
    return { columns, where: where.join(' AND '), params, group, aggs, orderSql, hidden: [...hidden], fields };
  }

  private filterSql(
    c: Column,
    op: string,
    value: unknown,
    expr: (c: Column) => string,
    jsonExpr: (c: Column) => string,
    p: (v: unknown) => string,
  ): string | { error: string } {
    const t = c.type;
    if (op === 'empty' || op === 'notEmpty') {
      const cond =
        t === 'multipicklist'
          ? `coalesce(${jsonExpr(c)}, '[]'::jsonb) = '[]'::jsonb`
          : `coalesce(${expr(c)}, '') = ''`;
      return op === 'empty' ? cond : `NOT (${cond})`;
    }
    if (op === 'period') {
      if (!DATE_TYPES.has(t)) return { error: 'il periodo vale solo per le date' };
      if (!PERIODS.includes(value as Period)) return { error: 'periodo non valido' };
      const [from, to] = periodRange(value as Period);
      const e = expr(c);
      return `(${e} >= ${p(from)} AND ${e} < ${p(to)})`;
    }
    if (value === undefined || value === null || value === '') return { error: 'valore obbligatorio' };

    if (t === 'multipicklist') {
      if (!['eq', 'neq', 'contains'].includes(op)) return { error: 'operatore non ammesso' };
      const cond = `coalesce(${jsonExpr(c)}, '[]'::jsonb) ? ${p(String(value))}`;
      return op === 'neq' ? `NOT (${cond})` : cond;
    }
    if (op === 'contains') {
      if (!TEXT_TYPES.has(t) && t !== 'picklist') return { error: 'operatore non ammesso' };
      return `lower(${expr(c)}) LIKE ${p(`%${String(value).toLowerCase()}%`)}`;
    }

    // valore normalizzato come nei record, così i confronti sono coerenti
    let v: unknown = value;
    if (c.key === 'ownerId') {
      if (!isUuid(value)) return { error: 'utente non valido' };
    } else if (c.field) {
      const fieldForValue = DATE_TYPES.has(t) && DATE_RE.test(String(value)) ? { ...c.field, type: 'date' as const } : c.field;
      const [n, err] = normalizeValue(fieldForValue, t === 'boolean' ? String(value) : value);
      if (err || n === null) return { error: err ?? 'valore non valido' };
      v = n;
    } else if (DATE_TYPES.has(t)) {
      const d = String(value);
      if (!DATE_RE.test(d) && Number.isNaN(Date.parse(d))) return { error: 'data non valida' };
      v = DATE_RE.test(d) ? d : new Date(d).toISOString();
    }

    const e = expr(c);
    if (op === 'eq' || op === 'neq') {
      let cond: string;
      if (NUMERIC_TYPES.has(t)) cond = `(${e})::numeric = ${p(String(v))}::numeric`;
      else if (TEXT_TYPES.has(t)) cond = `lower(${e}) = lower(${p(String(v))})`;
      else if (t === 'datetime' && DATE_RE.test(String(v))) {
        cond = `(${e} >= ${p(String(v))} AND ${e} < ${p(nextDay(String(v)))})`;
      } else cond = `${e} = ${p(String(v))}`;
      return op === 'eq' ? cond : `(${e} IS NULL OR NOT (${cond}))`;
    }
    // gt, gte, lt, lte
    const SQL_OP = { gt: '>', gte: '>=', lt: '<', lte: '<=' } as Record<string, string>;
    if (NUMERIC_TYPES.has(t)) return `(${e})::numeric ${SQL_OP[op]} ${p(String(v))}::numeric`;
    if (DATE_TYPES.has(t)) {
      const s = String(v);
      // per le date/ora, "fino al giorno X" comprende tutto il giorno X
      if (t === 'datetime' && DATE_RE.test(s) && (op === 'lte' || op === 'gt')) {
        return `${e} ${op === 'lte' ? '<' : '>='} ${p(nextDay(s))}`;
      }
      return `${e} ${SQL_OP[op]} ${p(s)}`;
    }
    return { error: 'operatore non ammesso per questo campo' };
  }

  /**
   * Esegue il rapporto. strict = true (anteprima nell'editor) rifiuta i campi non visibili o inesistenti;
   * altrimenti (rapporto salvato) li ignora e li elenca in "hidden".
   */
  async run(
    tx: Tx,
    sec: SecurityContext,
    module: string,
    config: ReportConfig,
    opts: { limit?: number; strict?: boolean } = {},
  ): Promise<ReportResult> {
    const limit = opts.limit ?? DISPLAY_ROWS;
    const plan = await this.plan(tx, sec, module, config, opts.strict ?? false);
    const { where, params, group, aggs } = plan;

    const totalsRow = (
      await tx.query(
        `SELECT count(*) AS n${aggs.map((a, i) => `, ${a.sql} AS a${i}`).join('')} FROM records r WHERE ${where}`,
        params,
      )
    ).rows[0];
    const totals: Record<string, number | null> = { count: Number(totalsRow.n) };
    aggs.forEach((a, i) => (totals[a.key] = num(totalsRow[`a${i}`])));

    let groups: ReportResult['groups'] = null;
    if (group) {
      const order = config.groupOrder === 'count' ? `n DESC, k ASC NULLS LAST` : `k ASC NULLS LAST`;
      const g = await tx.query(
        `SELECT ${group.sql} AS k, count(*) AS n${aggs.map((a, i) => `, ${a.sql} AS a${i}`).join('')}
           FROM records r WHERE ${where} GROUP BY 1 ORDER BY ${order} LIMIT ${MAX_GROUPS}`,
        params,
      );
      const labels = await this.groupLabels(tx, group.col, group.dateGroup, g.rows.map((x) => x.k));
      groups = g.rows.map((x) => {
        const t: Record<string, number | null> = {};
        aggs.forEach((a, i) => (t[a.key] = num(x[`a${i}`])));
        return { key: x.k, label: labels(x.k), count: Number(x.n), totals: t };
      });
    }

    const orderSql = group ? `${group.sql} ASC NULLS LAST, ${plan.orderSql}` : plan.orderSql;
    const rows = (
      await tx.query<Row>(
        `SELECT r.* FROM records r WHERE ${where} ORDER BY ${orderSql} NULLS LAST, r.id LIMIT ${limit + 1}`,
        params,
      )
    ).rows;
    const truncated = rows.length > limit;
    if (truncated) rows.pop();
    const refs = await this.records.refs(tx, rows, plan.fields);

    return {
      columns: plan.columns.map(({ field: _f, ...c }) => c),
      rows: rows.map((row) => ({
        id: row.id,
        values: Object.fromEntries(
          plan.columns.map((c) => [
            c.key,
            c.key === 'ownerId'
              ? row.owner_id
              : c.key === 'createdAt'
                ? row.created_at
                : c.key === 'updatedAt'
                  ? row.updated_at
                  : (row.data[c.key] ?? null),
          ]),
        ),
      })),
      rowCount: totals.count ?? 0,
      truncated,
      totalDefs: aggs.map(({ key, label, type }) => ({ key, label, type })),
      totals,
      groupBy: group
        ? { key: group.col.key, label: group.col.label, type: group.col.type, dateGroup: group.dateGroup }
        : null,
      groups,
      hidden: plan.hidden,
      refs,
    };
  }

  /**
   * Una pagina di record secondo una vista salvata (colonne, filtri, ordinamento), con ricerca sul nome
   * e filtro sull'assegnatario: "mine" (a me), "others" (agli altri) o l'id di un utente.
   * Restituisce solo i valori delle colonne visibili all'utente.
   */
  async page(
    tx: Tx,
    sec: SecurityContext,
    module: string,
    view: Pick<ReportConfig, 'columns' | 'filters' | 'sort'>,
    opts: { page?: number; pageSize?: number; q?: string; owner?: string } = {},
  ) {
    const config: ReportConfig = { ...view, groupOrder: 'key', totals: [], chart: 'none', groupBy: null };
    const plan = await this.plan(tx, sec, module, config, false);
    const params = [...plan.params];
    const where = [plan.where];
    if (opts.q?.trim()) {
      params.push(`%${opts.q.trim().toLowerCase()}%`);
      where.push(`lower(r.label) LIKE $${params.length}`);
    }
    if (opts.owner === 'mine' || opts.owner === 'others') {
      params.push(sec.userId);
      where.push(`r.owner_id ${opts.owner === 'mine' ? '=' : '<>'} $${params.length}`);
    } else if (opts.owner) {
      if (!isUuid(opts.owner)) throw new BadRequestException('assegnatario non valido');
      params.push(opts.owner);
      where.push(`r.owner_id = $${params.length}`);
    }
    const w = where.join(' AND ');
    const total = Number((await tx.query(`SELECT count(*) AS n FROM records r WHERE ${w}`, params)).rows[0].n);
    const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 200);
    const page = Math.max(opts.page ?? 1, 1);
    const rows = (
      await tx.query<Row>(
        `SELECT r.* FROM records r WHERE ${w} ORDER BY ${plan.orderSql} NULLS LAST, r.id
          LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        params,
      )
    ).rows;
    const fieldCols = plan.columns.filter((c) => c.field);
    return {
      columns: plan.columns.map(({ field: _f, ...c }) => c),
      items: rows.map((row) => ({
        id: row.id,
        label: row.label,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        data: Object.fromEntries(fieldCols.map((c) => [c.key, row.data[c.key] ?? null])),
      })),
      total,
      page,
      pageSize,
      hidden: plan.hidden,
      refs: await this.records.refs(tx, rows, fieldCols.map((c) => c.field!)),
    };
  }

  /** Etichette leggibili dei valori di raggruppamento. */
  private async groupLabels(tx: Tx, col: Column, dateGroup: string | undefined, keys: (string | null)[]) {
    const names: Record<string, string> = {};
    const ids = keys.filter((k): k is string => !!k && isUuid(k));
    if (ids.length && col.type === 'user') {
      const r = await tx.query(
        `SELECT id, trim(first_name || ' ' || last_name) AS n FROM users WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      for (const x of r.rows) names[x.id] = x.n;
    }
    if (ids.length && col.type === 'relation') {
      const r = await tx.query(`SELECT id, label FROM records WHERE id = ANY($1::uuid[])`, [ids]);
      for (const x of r.rows) names[x.id] = x.label;
    }
    return (k: string | null): string => {
      if (k === null || k === '') return '(vuoto)';
      if (names[k]) return names[k];
      if (col.type === 'boolean') return k === 'true' ? 'Sì' : 'No';
      if (dateGroup === 'year') return k;
      if (dateGroup === 'month') {
        const [y, m] = k.split('-').map(Number);
        const s = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
          new Date(Date.UTC(y, m - 1, 1)),
        );
        return s.charAt(0).toUpperCase() + s.slice(1);
      }
      if (dateGroup === 'day') return k.split('-').reverse().join('/');
      return k;
    };
  }
}
