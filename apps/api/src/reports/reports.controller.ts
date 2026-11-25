import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { AuthInfo } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { ScopeService } from '../security/scope.service';
import { ReportBodySchema, RunBodySchema } from './report-config';
import { fileName, toCsv } from './report-export';
import { EXPORT_ROWS, ReportsService } from './reports.service';

const ExportQuery = z.object({ part: z.enum(['rows', 'summary']).default('rows') });

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly scope: ScopeService,
    private readonly reports: ReportsService,
  ) {}

  @Get()
  list(@Auth() auth: AuthInfo) {
    return this.scope.run(auth, (tx, sec) => this.reports.list(tx, sec));
  }

  /** Esegue una definizione non salvata (anteprima nell'editor). */
  @Post('run')
  preview(@Auth() auth: AuthInfo, @Body() body: unknown) {
    const b = parseBody(RunBodySchema, body);
    return this.scope.run(auth, (tx, sec) => this.reports.run(tx, sec, b.module, b.config, { strict: true }));
  }

  @Post()
  create(@Auth() auth: AuthInfo, @Body() body: unknown) {
    const b = parseBody(ReportBodySchema, body);
    return this.scope.run(auth, (tx, sec) => this.reports.create(tx, sec, b));
  }

  @Get(':id')
  get(@Auth() auth: AuthInfo, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => this.reports.get(tx, sec, id));
  }

  @Patch(':id')
  update(@Auth() auth: AuthInfo, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(ReportBodySchema, body);
    return this.scope.run(auth, (tx, sec) => this.reports.update(tx, sec, id, b));
  }

  @Delete(':id')
  remove(@Auth() auth: AuthInfo, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => this.reports.remove(tx, sec, id));
  }

  @Get(':id/run')
  run(@Auth() auth: AuthInfo, @Param('id') id: string) {
    return this.scope.run(auth, async (tx, sec) => {
      const r = await this.reports.get(tx, sec, id);
      return { report: r, result: await this.reports.run(tx, sec, r.module, r.config) };
    });
  }

  /** Esportazione per Excel (CSV): righe di dettaglio oppure riepilogo dei gruppi. */
  @Get(':id/export')
  async export(
    @Auth() auth: AuthInfo,
    @Param('id') id: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { part } = parseBody(ExportQuery, query);
    const { name, csv } = await this.scope.run(auth, async (tx, sec) => {
      const r = await this.reports.get(tx, sec, id);
      const result = await this.reports.run(tx, sec, r.module, r.config, { limit: EXPORT_ROWS });
      return { name: r.name, csv: toCsv(result, part) };
    });
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${fileName(name, part === 'summary' ? '-riepilogo' : '')}"`);
    return csv;
  }
}
