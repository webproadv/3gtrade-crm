import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { AuthInfo } from '../auth/auth.types';
import { Auth } from '../auth/decorators';
import { ScopeService } from '../security/scope.service';
import { MetadataService } from './metadata.service';

@Controller('modules')
export class MetadataController {
  constructor(
    private readonly scope: ScopeService,
    private readonly meta: MetadataService,
  ) {}

  @Get()
  list(@Auth() auth: AuthInfo) {
    return this.scope.run(auth, (tx, sec) => this.meta.describeForUser(tx, sec));
  }

  @Get(':module')
  async get(@Auth() auth: AuthInfo, @Param('module') module: string) {
    return this.scope.run(auth, async (tx, sec) => {
      const found = (await this.meta.describeForUser(tx, sec)).find((m) => m.name === module);
      if (!found) throw new ForbiddenException('Modulo non accessibile');
      return found;
    });
  }
}
