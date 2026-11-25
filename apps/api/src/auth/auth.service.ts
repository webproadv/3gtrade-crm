import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../db/database.service';
import { JwtPayload } from './auth.types';

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async login(tenantSlug: string, email: string, password: string) {
    const tenant = (await this.db.query(`SELECT id FROM tenants WHERE slug = $1`, [tenantSlug])).rows[0];
    const fail = () => new UnauthorizedException('Credenziali non valide');
    if (!tenant) throw fail();

    const user = await this.db.withTenant(tenant.id, async (tx) => {
      const r = await tx.query(
        `SELECT id, password_hash, active FROM users WHERE email = lower($1)`,
        [email.trim()],
      );
      return r.rows[0];
    });
    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) throw fail();

    const payload: JwtPayload = { sub: user.id, tid: tenant.id };
    return { accessToken: await this.jwt.signAsync(payload) };
  }
}
