import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../db/database.service';
import { AuthInfo, JwtPayload } from './auth.types';
import { LoginLimiter } from './login-limiter';

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

@Injectable()
export class AuthService {
  private readonly limiter = new LoginLimiter();

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async login(tenantSlug: string, email: string, password: string, ip = '') {
    const key = `${ip}|${tenantSlug}|${email.trim().toLowerCase()}`;
    if (this.limiter.isBlocked(key)) {
      throw new HttpException('Troppi tentativi falliti: riprova tra qualche minuto', HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      const result = await this.checkCredentials(tenantSlug, email, password);
      this.limiter.reset(key);
      return result;
    } catch (err) {
      if (err instanceof UnauthorizedException) this.limiter.fail(key);
      throw err;
    }
  }

  /** Cambio della propria password, con verifica di quella attuale. */
  async changePassword(auth: AuthInfo, current: string, next: string) {
    if (next.length < 8) throw new BadRequestException({ message: 'Dati non validi', errors: { newPassword: 'minimo 8 caratteri' } });
    await this.db.withTenant(auth.tenantId, async (tx) => {
      const u = (await tx.query(`SELECT password_hash FROM users WHERE id = $1`, [auth.userId])).rows[0];
      if (!u || !(await bcrypt.compare(current, u.password_hash))) {
        throw new BadRequestException({ message: 'Dati non validi', errors: { currentPassword: 'password attuale errata' } });
      }
      await tx.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [auth.userId, await hashPassword(next)]);
    });
    return { ok: true };
  }

  private async checkCredentials(tenantSlug: string, email: string, password: string) {
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
