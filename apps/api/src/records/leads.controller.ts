import { Body, Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthInfo } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { parseBody } from '../common/validation';
import { ScopeService } from '../security/scope.service';
import { LeadConversionService } from './lead-conversion.service';

const ConvertBody = z.object({
  accountId: z.string().uuid().optional(),
  createOpportunity: z.boolean().optional(),
  opportunity: z
    .object({
      name: z.string().max(255).optional(),
      closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      amount: z.number().nonnegative().optional(),
      salesStage: z.string().optional(),
    })
    .optional(),
  ownerId: z.string().uuid().optional(),
});

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly scope: ScopeService,
    private readonly conversion: LeadConversionService,
  ) {}

  @Post(':id/convert')
  convert(@Auth() auth: AuthInfo, @Param('id') id: string, @Body() body: unknown) {
    const b = parseBody(ConvertBody, body ?? {});
    return this.scope.run(auth, (tx, sec) => this.conversion.convert(tx, sec, id, b));
  }
}
