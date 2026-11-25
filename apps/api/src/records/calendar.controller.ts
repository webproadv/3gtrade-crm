import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthInfo } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { ScopeService } from '../security/scope.service';
import { RecordsService } from './records.service';

const CalendarQuery = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    ownerId: z.string().uuid().optional(),
  })
  .refine((q) => Date.parse(q.to) > Date.parse(q.from), { message: 'intervallo non valido', path: ['to'] })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 45 * 86400_000, {
    message: 'intervallo massimo 45 giorni',
    path: ['to'],
  });

/** Attività visibili all'utente che iniziano nell'intervallo indicato. */
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly scope: ScopeService,
    private readonly records: RecordsService,
  ) {}

  @Get()
  list(@Auth() auth: AuthInfo, @Query() query: unknown) {
    const q = parseBody(CalendarQuery, query);
    return this.scope.run(auth, (tx, sec) =>
      this.records.list(tx, sec, 'Activities', {
        after: { start: q.from },
        before: { start: q.to },
        ownerId: q.ownerId,
        sort: 'start',
        dir: 'asc',
        pageSize: 1000,
        maxPageSize: 1000,
      }),
    );
  }
}
