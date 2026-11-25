import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Tx } from '../db/database.service';
import {
  FieldPermRow,
  ModulePermRow,
  SecurityContext,
  mergeFieldPermissions,
  mergeModulePermissions,
} from './security-context';

@Injectable()
export class SecurityService {
  /** Carica permessi e visibilità dell'utente. Da chiamare dentro withTenant. */
  async load(tx: Tx, tenantId: string, userId: string): Promise<SecurityContext> {
    const u = await tx.query(
      `SELECT u.id, u.is_admin, u.active, u.role_id, r.path
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [userId],
    );
    const user = u.rows[0];
    if (!user || !user.active) throw new UnauthorizedException('Utente non attivo');

    const profileIds: string[] = (
      await tx.query(`SELECT profile_id FROM role_profiles WHERE role_id = $1`, [user.role_id])
    ).rows.map((r) => r.profile_id);

    const modRows = (
      await tx.query<ModulePermRow>(
        `SELECT module, can_view, can_create, can_edit, can_delete
           FROM profile_module_permissions WHERE profile_id = ANY($1::uuid[])`,
        [profileIds],
      )
    ).rows;
    const fieldRows = (
      await tx.query<FieldPermRow>(
        `SELECT profile_id, field_id, visible, editable
           FROM profile_field_permissions WHERE profile_id = ANY($1::uuid[])`,
        [profileIds],
      )
    ).rows;

    // utenti con ruolo uguale o subordinato: il proprio + quelli il cui path inizia con il mio
    const owners = await tx.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 OR r.path LIKE $2 || '::%'`,
      [userId, user.path],
    );

    const { hidden, readonly } = user.is_admin
      ? { hidden: new Set<string>(), readonly: new Set<string>() }
      : mergeFieldPermissions(profileIds, fieldRows);

    return {
      tenantId,
      userId,
      isAdmin: user.is_admin,
      roleId: user.role_id,
      rolePath: user.path,
      modules: mergeModulePermissions(modRows),
      hiddenFields: hidden,
      readonlyFields: readonly,
      visibleOwnerIds: owners.rows.map((r) => r.id),
    };
  }
}
