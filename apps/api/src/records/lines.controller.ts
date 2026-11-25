import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { AuthInfo } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { ScopeService } from '../security/scope.service';
import { LinesSchema, LinesService } from './lines.service';

/** Righe dei documenti (PDA): lettura e sostituzione completa con ricalcolo dei totali. */
@Controller('records/:module/:id/lines')
export class LinesController {
  constructor(
    private readonly scope: ScopeService,
    private readonly lines: LinesService,
  ) {}

  @Get()
  list(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string) {
    return this.scope.run(auth, (tx, sec) => this.lines.list(tx, sec, module, id));
  }

  @Put()
  replace(@Auth() auth: AuthInfo, @Param('module') module: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(LinesSchema, body);
    return this.scope.run(auth, (tx, sec) => this.lines.replace(tx, sec, module, id, b));
  }
}
