import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthInfo } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { ScopeService } from '../security/scope.service';
import { RecordsService } from './records.service';

const RecordBody = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  ownerId: z.string().optional(),
});

const ListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  ownerId: z.string().optional(),
  filter: z.record(z.string(), z.string()).optional(),
});

@Controller('records/:module')
export class RecordsController {
  constructor(
    private readonly scope: ScopeService,
    private readonly records: RecordsService,
  ) {}

  @Get()
  list(@Auth() auth: AuthInfo, @Param('module') module: string, @Query() query: unknown) {
    const q = parseBody(ListQuerySchema, query);
    return this.scope.run(auth, (tx, sec) => this.records.list(tx, sec, module, q));
  }

  @Post()
  create(@Auth() auth: AuthInfo, @Param('module') module: string, @Body() body: unknown) {
    const b = parseBody(RecordBody, body);
    return this.scope.run(auth, (tx, sec) => this.records.create(tx, sec, module, b));
  }

  @Get(':id')
  get(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => this.records.get(tx, sec, module, id));
  }

  @Patch(':id')
  update(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(RecordBody, body);
    return this.scope.run(auth, (tx, sec) => this.records.update(tx, sec, module, id, b));
  }

  @Delete(':id')
  remove(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => this.records.remove(tx, sec, module, id));
  }

  @Get(':id/related')
  related(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => this.records.related(tx, sec, module, id));
  }

  @Get(':id/history')
  history(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => this.records.historyOf(tx, sec, module, id));
  }
}
