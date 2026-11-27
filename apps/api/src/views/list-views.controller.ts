import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthInfo } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { ScopeService } from '../security/scope.service';
import { ListViewsService, QueryBodySchema, ViewBodySchema } from './list-views.service';

const ListQuery = z.object({ module: z.string().min(1) });

@Controller('list-views')
export class ListViewsController {
  constructor(
    private readonly scope: ScopeService,
    private readonly views: ListViewsService,
  ) {}

  @Get()
  list(@Auth() auth: AuthInfo, @Query() query: unknown) {
    const q = parseBody(ListQuery, query);
    return this.scope.run(auth, (tx, sec) => this.views.list(tx, sec, q.module));
  }

  @Post('query')
  query(@Auth() auth: AuthInfo, @Body() body: unknown) {
    const b = parseBody(QueryBodySchema, body);
    return this.scope.run(auth, (tx, sec) => this.views.query(tx, sec, b));
  }

  @Post()
  create(@Auth() auth: AuthInfo, @Body() body: unknown) {
    const b = parseBody(ViewBodySchema, body);
    return this.scope.run(auth, (tx, sec) => this.views.create(tx, sec, b));
  }

  @Get(':id')
  get(@Auth() auth: AuthInfo, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => this.views.get(tx, sec, id));
  }

  @Patch(':id')
  update(@Auth() auth: AuthInfo, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(ViewBodySchema, body);
    return this.scope.run(auth, (tx, sec) => this.views.update(tx, sec, id, b));
  }

  @Delete(':id')
  remove(@Auth() auth: AuthInfo, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => this.views.remove(tx, sec, id));
  }
}
