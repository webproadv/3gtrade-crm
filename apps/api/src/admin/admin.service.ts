import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hashPassword } from '../auth/auth.service';
import { Tx } from '../db/database.service';
import { FIELD_TYPES, FieldOptions, FieldType, customFieldName } from '../metadata/field-types';
import { MetadataService } from '../metadata/metadata.service';
import { SecurityContext } from '../security/security-context';
import { insertModule } from '../tenants/provisioning';

export function assertAdmin(sec: SecurityContext) {
  if (!sec.isAdmin) throw new ForbiddenException('Riservato agli amministratori');
}

const mapUser = (u: any) => ({
  id: u.id,
  email: u.email,
  firstName: u.first_name,
  lastName: u.last_name,
  roleId: u.role_id,
  roleName: u.role_name,
  isAdmin: u.is_admin,
  active: u.active,
  createdAt: u.created_at,
});

@Injectable()
export class AdminService {
  constructor(private readonly meta: MetadataService) {}

  // ---------- Utenti ----------

  async listUsers(tx: Tx) {
    const r = await tx.query(
      `SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.last_name, u.first_name`,
    );
    return r.rows.map(mapUser);
  }

  async createUser(
    tx: Tx,
    sec: SecurityContext,
    b: { email: string; password: string; firstName: string; lastName: string; roleId: string; isAdmin?: boolean },
  ) {
    await this.ensureRole(tx, b.roleId);
    const r = await tx.query(
      `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role_id, is_admin)
       VALUES ($1, lower($2), $3, $4, $5, $6, $7) RETURNING id`,
      [sec.tenantId, b.email, await hashPassword(b.password), b.firstName, b.lastName, b.roleId, !!b.isAdmin],
    );
    return this.getUser(tx, r.rows[0].id);
  }

  async updateUser(
    tx: Tx,
    sec: SecurityContext,
    id: string,
    b: Partial<{ email: string; password: string; firstName: string; lastName: string; roleId: string; isAdmin: boolean; active: boolean }>,
  ) {
    await this.getUser(tx, id);
    if (id === sec.userId && (b.active === false || b.isAdmin === false)) {
      throw new BadRequestException('Non puoi disattivare o togliere i privilegi a te stesso');
    }
    if (b.roleId) await this.ensureRole(tx, b.roleId);
    const sets: string[] = [];
    const params: unknown[] = [id];
    const set = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (b.email !== undefined) set('email', b.email.toLowerCase());
    if (b.password) set('password_hash', await hashPassword(b.password));
    if (b.firstName !== undefined) set('first_name', b.firstName);
    if (b.lastName !== undefined) set('last_name', b.lastName);
    if (b.roleId !== undefined) set('role_id', b.roleId);
    if (b.isAdmin !== undefined) set('is_admin', b.isAdmin);
    if (b.active !== undefined) set('active', b.active);
    if (sets.length) await tx.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
    return this.getUser(tx, id);
  }

  private async getUser(tx: Tx, id: string) {
    const r = await tx.query(
      `SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [id],
    );
    if (!r.rows[0]) throw new NotFoundException('Utente inesistente');
    return mapUser(r.rows[0]);
  }

  // ---------- Ruoli ----------

  private async ensureRole(tx: Tx, id: string) {
    const r = await tx.query(`SELECT id, path FROM roles WHERE id = $1`, [id]);
    if (!r.rows[0]) throw new BadRequestException('Ruolo inesistente');
    return r.rows[0] as { id: string; path: string };
  }

  async listRoles(tx: Tx) {
    const r = await tx.query(
      `SELECT r.id, r.name, r.parent_id, r.path,
              coalesce(array_agg(rp.profile_id) FILTER (WHERE rp.profile_id IS NOT NULL), '{}') AS profile_ids,
              (SELECT count(*) FROM users u WHERE u.role_id = r.id)::int AS user_count
         FROM roles r LEFT JOIN role_profiles rp ON rp.role_id = r.id
        GROUP BY r.id ORDER BY r.path`,
    );
    return r.rows.map((x) => ({
      id: x.id,
      name: x.name,
      parentId: x.parent_id,
      depth: x.path.split('::').length - 1,
      profileIds: x.profile_ids,
      userCount: x.user_count,
    }));
  }

  async createRole(tx: Tx, sec: SecurityContext, b: { name: string; parentId: string; profileIds: string[] }) {
    const parent = await this.ensureRole(tx, b.parentId);
    const id: string = (
      await tx.query(`INSERT INTO roles (tenant_id, name, parent_id, path) VALUES ($1, $2, $3, '') RETURNING id`, [
        sec.tenantId,
        b.name,
        parent.id,
      ])
    ).rows[0].id;
    await tx.query(`UPDATE roles SET path = $2 WHERE id = $1`, [id, `${parent.path}::${id}`]);
    await this.setRoleProfiles(tx, sec, id, b.profileIds);
    return (await this.listRoles(tx)).find((r) => r.id === id);
  }

  async updateRole(tx: Tx, sec: SecurityContext, id: string, b: { name?: string; profileIds?: string[] }) {
    await this.ensureRole(tx, id);
    if (b.name) await tx.query(`UPDATE roles SET name = $2 WHERE id = $1`, [id, b.name]);
    if (b.profileIds) await this.setRoleProfiles(tx, sec, id, b.profileIds);
    return (await this.listRoles(tx)).find((r) => r.id === id);
  }

  async deleteRole(tx: Tx, id: string) {
    const role = (await this.listRoles(tx)).find((r) => r.id === id);
    if (!role) throw new NotFoundException('Ruolo inesistente');
    if (!role.parentId) throw new BadRequestException('Il ruolo principale non può essere eliminato');
    if (role.userCount > 0) throw new ConflictException('Ci sono utenti con questo ruolo');
    const children = await tx.query(`SELECT 1 FROM roles WHERE parent_id = $1`, [id]);
    if (children.rowCount) throw new ConflictException('Il ruolo ha ruoli subordinati');
    await tx.query(`DELETE FROM roles WHERE id = $1`, [id]);
    return { ok: true };
  }

  private async setRoleProfiles(tx: Tx, sec: SecurityContext, roleId: string, profileIds: string[]) {
    await tx.query(`DELETE FROM role_profiles WHERE role_id = $1`, [roleId]);
    for (const p of new Set(profileIds)) {
      await tx.query(`INSERT INTO role_profiles (tenant_id, role_id, profile_id) VALUES ($1, $2, $3)`, [
        sec.tenantId,
        roleId,
        p,
      ]);
    }
  }

  // ---------- Profili e permessi ----------

  async listProfiles(tx: Tx) {
    const profiles = (await tx.query(`SELECT id, name, description FROM profiles ORDER BY name`)).rows;
    const mods = (await tx.query(`SELECT * FROM profile_module_permissions`)).rows;
    const fields = (await tx.query(`SELECT * FROM profile_field_permissions`)).rows;
    return profiles.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      modules: Object.fromEntries(
        mods
          .filter((m) => m.profile_id === p.id)
          .map((m) => [m.module, { view: m.can_view, create: m.can_create, edit: m.can_edit, delete: m.can_delete }]),
      ),
      fields: Object.fromEntries(
        fields
          .filter((f) => f.profile_id === p.id)
          .map((f) => [f.field_id, { visible: f.visible, editable: f.editable }]),
      ),
    }));
  }

  async createProfile(tx: Tx, sec: SecurityContext, b: { name: string; description?: string; copyFrom?: string }) {
    const id: string = (
      await tx.query(`INSERT INTO profiles (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING id`, [
        sec.tenantId,
        b.name,
        b.description ?? null,
      ])
    ).rows[0].id;
    if (b.copyFrom) {
      await tx.query(
        `INSERT INTO profile_module_permissions (tenant_id, profile_id, module, can_view, can_create, can_edit, can_delete)
         SELECT tenant_id, $2, module, can_view, can_create, can_edit, can_delete FROM profile_module_permissions WHERE profile_id = $1`,
        [b.copyFrom, id],
      );
      await tx.query(
        `INSERT INTO profile_field_permissions (tenant_id, profile_id, field_id, visible, editable)
         SELECT tenant_id, $2, field_id, visible, editable FROM profile_field_permissions WHERE profile_id = $1`,
        [b.copyFrom, id],
      );
    }
    return (await this.listProfiles(tx)).find((p) => p.id === id);
  }

  async setProfilePermissions(
    tx: Tx,
    sec: SecurityContext,
    profileId: string,
    b: {
      modules?: Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }>;
      fields?: Record<string, { visible: boolean; editable: boolean }>;
    },
  ) {
    const exists = await tx.query(`SELECT 1 FROM profiles WHERE id = $1`, [profileId]);
    if (!exists.rowCount) throw new NotFoundException('Profilo inesistente');
    const moduleNames = new Set((await this.meta.listModules(tx)).map((m) => m.name));
    for (const [module, p] of Object.entries(b.modules ?? {})) {
      if (!moduleNames.has(module)) throw new BadRequestException(`Modulo ${module} inesistente`);
      await tx.query(
        `INSERT INTO profile_module_permissions (tenant_id, profile_id, module, can_view, can_create, can_edit, can_delete)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (profile_id, module) DO UPDATE
           SET can_view = $4, can_create = $5, can_edit = $6, can_delete = $7`,
        [sec.tenantId, profileId, module, p.view, p.create, p.edit, p.delete],
      );
    }
    for (const [fieldId, p] of Object.entries(b.fields ?? {})) {
      if (p.visible && p.editable) {
        await tx.query(`DELETE FROM profile_field_permissions WHERE profile_id = $1 AND field_id = $2`, [profileId, fieldId]);
      } else {
        await tx.query(
          `INSERT INTO profile_field_permissions (tenant_id, profile_id, field_id, visible, editable)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (profile_id, field_id) DO UPDATE SET visible = $4, editable = $5`,
          [sec.tenantId, profileId, fieldId, p.visible, p.visible && p.editable],
        );
      }
    }
    return (await this.listProfiles(tx)).find((p) => p.id === profileId);
  }

  // ---------- Moduli e campi ----------

  async listModules(tx: Tx) {
    const [modules, fields] = await Promise.all([this.meta.listModules(tx), this.meta.listFields(tx)]);
    return modules.map((m) => ({ ...m, fields: fields.filter((f) => f.module === m.name) }));
  }

  async createModule(tx: Tx, sec: SecurityContext, b: { name: string; label: string; labelSingular: string; icon?: string }) {
    if (!/^[A-Z][A-Za-z0-9]{2,39}$/.test(b.name)) {
      throw new BadRequestException('Il nome tecnico deve iniziare con una maiuscola e contenere solo lettere e numeri');
    }
    const max = (await tx.query(`SELECT coalesce(max(sort_order), 0) AS m FROM modules`)).rows[0].m;
    await insertModule(
      tx,
      sec.tenantId,
      {
        name: b.name,
        label: b.label,
        labelSingular: b.labelSingular,
        icon: b.icon ?? 'box',
        labelFields: ['name'],
        sharing: 'private',
        fields: [{ name: 'name', label: 'Nome', type: 'text', block: 'Informazioni', required: true, inList: true }],
      },
      max + 10,
      true,
    );
    // gli amministratori vedono tutto; il modulo va abilitato nei profili dagli admin
    return (await this.listModules(tx)).find((m) => m.name === b.name);
  }

  async updateModule(
    tx: Tx,
    name: string,
    b: { label?: string; labelSingular?: string; sharing?: string; labelFields?: string[] },
  ) {
    const mod = await this.meta.getModule(tx, name);
    if (b.labelFields) {
      const names = new Set((await this.meta.listFields(tx, name)).map((f) => f.name));
      if (!b.labelFields.length || b.labelFields.some((f) => !names.has(f))) {
        throw new BadRequestException('Campi etichetta non validi');
      }
    }
    await tx.query(
      `UPDATE modules SET label = $2, label_singular = $3, sharing = $4, label_fields = $5 WHERE name = $1`,
      [name, b.label ?? mod.label, b.labelSingular ?? mod.labelSingular, b.sharing ?? mod.sharing, b.labelFields ?? mod.labelFields],
    );
    if (b.labelFields) {
      // ricalcola le etichette dei record esistenti
      await tx.query(
        `UPDATE records SET label = trim(concat_ws(' ', ${b.labelFields.map((_, i) => `data->>$${i + 2}`).join(', ')}))
          WHERE module = $1`,
        [name, ...b.labelFields],
      );
    }
    return (await this.listModules(tx)).find((m) => m.name === name);
  }

  async createField(
    tx: Tx,
    sec: SecurityContext,
    module: string,
    b: { label: string; type: FieldType; block?: string; required?: boolean; inList?: boolean; options?: FieldOptions },
  ) {
    await this.meta.getModule(tx, module);
    this.checkFieldOptions(b.type, b.options ?? {});
    if (b.type === 'relation') await this.meta.getModule(tx, b.options!.module!);
    const existing = new Set((await this.meta.listFields(tx, module)).map((f) => f.name));
    let name = customFieldName(b.label);
    for (let i = 2; existing.has(name); i++) name = `${customFieldName(b.label)}_${i}`;
    const max = (await tx.query(`SELECT coalesce(max(sort_order), 0) AS m FROM fields WHERE module = $1`, [module])).rows[0].m;
    const r = await tx.query(
      `INSERT INTO fields (tenant_id, module, name, label, type, block, required, is_custom, in_list, sort_order, options)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10) RETURNING id`,
      [
        sec.tenantId,
        module,
        name,
        b.label,
        b.type,
        b.block || 'Informazioni personalizzate',
        !!b.required,
        !!b.inList,
        max + 10,
        JSON.stringify(b.options ?? {}),
      ],
    );
    return (await this.meta.listFields(tx, module)).find((f) => f.id === r.rows[0].id);
  }

  async updateField(
    tx: Tx,
    id: string,
    b: { label?: string; block?: string; required?: boolean; inList?: boolean; sortOrder?: number; options?: FieldOptions },
  ) {
    const f = (await this.meta.listFields(tx)).find((x) => x.id === id);
    if (!f) throw new NotFoundException('Campo inesistente');
    if (b.options) {
      if (f.type === 'relation' && b.options.module !== f.options.module) {
        throw new BadRequestException('Il modulo collegato non può essere cambiato');
      }
      this.checkFieldOptions(f.type, b.options);
    }
    await tx.query(
      `UPDATE fields SET label = $2, block = $3, required = $4, in_list = $5, sort_order = $6, options = $7 WHERE id = $1`,
      [
        id,
        b.label ?? f.label,
        b.block ?? f.block,
        b.required ?? f.required,
        b.inList ?? f.inList,
        b.sortOrder ?? f.sortOrder,
        JSON.stringify(b.options ?? f.options),
      ],
    );
    return (await this.meta.listFields(tx)).find((x) => x.id === id);
  }

  async deleteField(tx: Tx, id: string) {
    const f = (await this.meta.listFields(tx)).find((x) => x.id === id);
    if (!f) throw new NotFoundException('Campo inesistente');
    if (!f.isCustom) throw new BadRequestException('I campi standard non possono essere eliminati');
    const mod = await this.meta.getModule(tx, f.module);
    if (mod.labelFields.includes(f.name)) throw new BadRequestException('Il campo è usato come etichetta del modulo');
    await tx.query(`UPDATE records SET data = data - $2 WHERE module = $1`, [f.module, f.name]);
    await tx.query(`DELETE FROM fields WHERE id = $1`, [id]);
    return { ok: true };
  }

  private checkFieldOptions(type: FieldType, options: FieldOptions) {
    if (!FIELD_TYPES.includes(type)) throw new BadRequestException('Tipo di campo non valido');
    if ((type === 'picklist' || type === 'multipicklist') && !options.values?.length) {
      throw new BadRequestException('Indica almeno un valore per l\'elenco');
    }
    if (type === 'relation' && !options.module) throw new BadRequestException('Indica il modulo collegato');
  }
}
