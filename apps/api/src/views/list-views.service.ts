import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Tx } from '../db/database.service';
import { isUuid } from '../metadata/field-types';
import { ReportConfig, ReportConfigSchema } from '../reports/report-config';
import { ReportsService } from '../reports/reports.service';
import { SecurityContext, can } from '../security/security-context';

/** Definizione di una vista: le stesse colonne, filtri e ordinamento dei rapporti. */
export const ViewConfigSchema = ReportConfigSchema.pick({ columns: true, filters: true, sort: true });
export type ViewConfig = z.infer<typeof ViewConfigSchema>;

export const ViewBodySchema = z.object({
  name: z.string().trim().min(1, 'obbligatorio').max(120),
  module: z.string().min(1),
  shared: z.boolean().default(false),
  config: ViewConfigSchema,
});
export type ViewBody = z.infer<typeof ViewBodySchema>;

export const QueryBodySchema = z.object({
  module: z.string().min(1),
  /** vista salvata; in alternativa una definizione non salvata (es. la vista "Tutti") */
  viewId: z.string().optional(),
  config: ViewConfigSchema.optional(),
  /** ordinamento scelto cliccando sulle colonne: sostituisce quello della vista */
  sort: z.object({ field: z.string().min(1), dir: z.enum(['asc', 'desc']) }).nullable().optional(),
  q: z.string().max(200).optional(),
  owner: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
});
export type QueryBody = z.infer<typeof QueryBodySchema>;

const asReport = (c: ViewConfig): ReportConfig => ({ ...c, groupOrder: 'key', totals: [], chart: 'none', groupBy: null });

@Injectable()
export class ListViewsService {
  constructor(private readonly reports: ReportsService) {}

  /** Viste del modulo visibili all'utente: le sue e quelle pubbliche. */
  async list(tx: Tx, sec: SecurityContext, module: string) {
    if (!can(sec, module, 'view')) throw new ForbiddenException('Permesso negato sul modulo');
    const r = await tx.query(
      `SELECT v.*, trim(u.first_name || ' ' || u.last_name) AS owner_name
         FROM list_views v JOIN users u ON u.id = v.owner_id
        WHERE v.module = $1 AND (v.shared OR v.owner_id = $2)
        ORDER BY v.shared, lower(v.name)`,
      [module, sec.userId],
    );
    return r.rows.map((x) => this.present(sec, x));
  }

  private present(sec: SecurityContext, x: Record<string, any>) {
    return {
      id: x.id as string,
      name: x.name as string,
      module: x.module as string,
      shared: x.shared as boolean,
      ownerId: x.owner_id as string,
      ownerName: (x.owner_name as string) ?? undefined,
      config: x.config as ViewConfig,
      canEdit: sec.isAdmin || x.owner_id === sec.userId,
    };
  }

  async get(tx: Tx, sec: SecurityContext, id: string) {
    if (!isUuid(id)) throw new NotFoundException('Vista inesistente');
    const x = (await tx.query(`SELECT * FROM list_views WHERE id = $1`, [id])).rows[0];
    if (!x || !(x.shared || x.owner_id === sec.userId)) throw new NotFoundException('Vista inesistente');
    if (!can(sec, x.module, 'view')) throw new ForbiddenException('Permesso negato sul modulo');
    return this.present(sec, x);
  }

  async create(tx: Tx, sec: SecurityContext, body: ViewBody) {
    await this.reports.validate(tx, sec, body.module, asReport(body.config));
    const r = await tx.query(
      `INSERT INTO list_views (tenant_id, module, name, config, shared, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [sec.tenantId, body.module, body.name, JSON.stringify(body.config), body.shared, sec.userId],
    );
    return this.get(tx, sec, r.rows[0].id);
  }

  async update(tx: Tx, sec: SecurityContext, id: string, body: ViewBody) {
    const cur = await this.get(tx, sec, id);
    if (!cur.canEdit) throw new ForbiddenException('Solo chi ha creato la vista o un amministratore può modificarla');
    if (body.module !== cur.module) throw new BadRequestException('Il modulo di una vista non si cambia');
    await this.reports.validate(tx, sec, body.module, asReport(body.config));
    await tx.query(`UPDATE list_views SET name = $2, config = $3, shared = $4, updated_at = now() WHERE id = $1`, [
      id,
      body.name,
      JSON.stringify(body.config),
      body.shared,
    ]);
    return this.get(tx, sec, id);
  }

  async remove(tx: Tx, sec: SecurityContext, id: string) {
    const cur = await this.get(tx, sec, id);
    if (!cur.canEdit) throw new ForbiddenException('Solo chi ha creato la vista o un amministratore può eliminarla');
    await tx.query(`DELETE FROM list_views WHERE id = $1`, [id]);
    return { ok: true };
  }

  /** Esegue una vista salvata o una definizione al volo e restituisce una pagina di record. */
  async query(tx: Tx, sec: SecurityContext, body: QueryBody) {
    let config: ViewConfig | undefined = body.config;
    if (body.viewId) {
      const v = await this.get(tx, sec, body.viewId);
      if (v.module !== body.module) throw new BadRequestException('La vista appartiene a un altro modulo');
      config = v.config;
    }
    if (!config) throw new BadRequestException('Indica una vista o una definizione');
    if (body.sort !== undefined) config = { ...config, sort: body.sort };
    return this.reports.page(tx, sec, body.module, config, {
      page: body.page,
      pageSize: body.pageSize,
      q: body.q,
      owner: body.owner,
    });
  }
}
