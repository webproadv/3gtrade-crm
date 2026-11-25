import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../common/validation';
import { ScopeService } from '../security/scope.service';
import { AuthService } from './auth.service';
import { AuthInfo } from './auth.types';
import { Auth, Public } from './decorators';

const LoginSchema = z.object({
  tenant: z.string().min(1),
  email: z.string().min(3),
  password: z.string().min(1),
});

const PasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'minimo 8 caratteri'),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly scope: ScopeService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() body: unknown, @Ip() ip: string) {
    const { tenant, email, password } = parseBody(LoginSchema, body);
    return this.auth.login(tenant, email, password, ip);
  }

  @Post('password')
  changePassword(@Auth() auth: AuthInfo, @Body() body: unknown) {
    const { currentPassword, newPassword } = parseBody(PasswordSchema, body);
    return this.auth.changePassword(auth, currentPassword, newPassword);
  }

  /** Profilo dell'utente corrente con i permessi per modulo. */
  @Get('me')
  me(@Auth() auth: AuthInfo) {
    return this.scope.run(auth, async (tx, sec) => {
      const u = (
        await tx.query(
          `SELECT u.id, u.email, u.first_name, u.last_name, u.is_admin, r.name AS role, t.name AS tenant_name
             FROM users u JOIN roles r ON r.id = u.role_id JOIN tenants t ON t.id = u.tenant_id
            WHERE u.id = $1`,
          [auth.userId],
        )
      ).rows[0];
      return {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        isAdmin: u.is_admin,
        role: u.role,
        tenantName: u.tenant_name,
        permissions: sec.modules,
      };
    });
  }
}
