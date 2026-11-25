import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { STANDARD_MODULES, StandardModule } from '../metadata/standard-modules';
import { Tx } from '../db/database.service';

export interface NewTenant {
  slug: string;
  name: string;
  admin: { email: string; password: string; firstName: string; lastName: string };
}

async function inTenant<T>(pool: Pool, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function insertField(tx: Tx, tenantId: string, module: string, f: StandardModule['fields'][number], sortOrder: number) {
  await tx.query(
    `INSERT INTO fields (tenant_id, module, name, label, type, block, required, in_list, sort_order, options)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [tenantId, module, f.name, f.label, f.type, f.block, !!f.required, !!f.inList, sortOrder, JSON.stringify(f.options ?? {})],
  );
}

export async function insertModule(tx: Tx, tenantId: string, m: StandardModule, sortOrder: number, isCustom = false) {
  await tx.query(
    `INSERT INTO modules (tenant_id, name, label, label_singular, icon, is_custom, sort_order, label_fields, sharing)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [tenantId, m.name, m.label, m.labelSingular, m.icon, isCustom, sortOrder, m.labelFields, m.sharing],
  );
  let i = 0;
  for (const f of m.fields) await insertField(tx, tenantId, m.name, f, (i += 10));
}

/**
 * Allinea i tenant esistenti ai moduli standard del codice: aggiunge i moduli
 * e i campi standard mancanti senza toccare quelli già presenti o personalizzati.
 * Un modulo nuovo eredita i permessi dei profili da `inheritPermissionsFrom`.
 * Restituisce l'elenco delle aggiunte, per il log.
 */
export async function ensureStandardModules(pool: Pool): Promise<string[]> {
  const added: string[] = [];
  const tenants = (await pool.query<{ id: string; slug: string }>(`SELECT id, slug FROM tenants`)).rows;
  for (const t of tenants) {
    await inTenant(pool, t.id, async (tx) => {
      const existing = new Set((await tx.query(`SELECT name FROM modules`)).rows.map((r) => r.name));
      for (const m of STANDARD_MODULES) {
        if (!existing.has(m.name)) {
          const max = (await tx.query(`SELECT coalesce(max(sort_order), 0) AS m FROM modules WHERE NOT is_custom`)).rows[0].m;
          await insertModule(tx, t.id, m, max + 10);
          if (m.inheritPermissionsFrom) {
            await tx.query(
              `INSERT INTO profile_module_permissions (tenant_id, profile_id, module, can_view, can_create, can_edit, can_delete)
               SELECT tenant_id, profile_id, $1, can_view, can_create, can_edit, can_delete
                 FROM profile_module_permissions WHERE module = $2`,
              [m.name, m.inheritPermissionsFrom],
            );
          }
          added.push(`${t.slug}: modulo ${m.name}`);
          continue;
        }
        const fields = new Set(
          (await tx.query(`SELECT name FROM fields WHERE module = $1`, [m.name])).rows.map((r) => r.name),
        );
        const max = (await tx.query(`SELECT coalesce(max(sort_order), 0) AS m FROM fields WHERE module = $1`, [m.name])).rows[0].m;
        let order = max;
        for (const f of m.fields) {
          if (fields.has(f.name)) continue;
          await insertField(tx, t.id, m.name, f, (order += 10));
          added.push(`${t.slug}: campo ${m.name}.${f.name}`);
        }
      }
    });
  }
  return added;
}

/**
 * Crea un tenant con ruoli, profili, moduli standard e utente amministratore.
 * Restituisce gli id principali.
 */
export async function provisionTenant(pool: Pool, t: NewTenant) {
  const tenantId: string = (
    await pool.query(`INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`, [t.slug, t.name])
  ).rows[0].id;

  return inTenant(pool, tenantId, async (tx) => {
    const role = async (name: string, parent?: { id: string; path: string }) => {
      const id: string = (
        await tx.query(
          `INSERT INTO roles (tenant_id, name, parent_id, path) VALUES ($1, $2, $3, '') RETURNING id`,
          [tenantId, name, parent?.id ?? null],
        )
      ).rows[0].id;
      const path = parent ? `${parent.path}::${id}` : id;
      await tx.query(`UPDATE roles SET path = $2 WHERE id = $1`, [id, path]);
      return { id, path };
    };
    const ceo = await role('Direzione');
    const salesManager = await role('Responsabile vendite', ceo);
    const salesRep = await role('Commerciale', salesManager);

    const profile = async (name: string, description: string) =>
      (
        await tx.query(`INSERT INTO profiles (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING id`, [
          tenantId,
          name,
          description,
        ])
      ).rows[0].id as string;
    const adminProfile = await profile('Amministratore', 'Accesso completo a tutti i moduli');
    const salesProfile = await profile('Vendite', 'Gestione di aziende, contatti e opportunità');

    let order = 0;
    for (const m of STANDARD_MODULES) {
      await insertModule(tx, tenantId, m, (order += 10));
      await tx.query(
        `INSERT INTO profile_module_permissions (tenant_id, profile_id, module, can_view, can_create, can_edit, can_delete)
         VALUES ($1, $2, $3, true, true, true, true), ($1, $4, $3, true, true, true, $5)`,
        [tenantId, adminProfile, m.name, salesProfile, m.name === 'Opportunities' || m.name === 'Activities'],
      );
    }

    for (const [roleId, profileId] of [
      [ceo.id, adminProfile],
      [salesManager.id, salesProfile],
      [salesRep.id, salesProfile],
    ]) {
      await tx.query(`INSERT INTO role_profiles (tenant_id, role_id, profile_id) VALUES ($1, $2, $3)`, [
        tenantId,
        roleId,
        profileId,
      ]);
    }

    const adminId: string = (
      await tx.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role_id, is_admin)
         VALUES ($1, lower($2), $3, $4, $5, $6, true) RETURNING id`,
        [tenantId, t.admin.email, await bcrypt.hash(t.admin.password, 10), t.admin.firstName, t.admin.lastName, ceo.id],
      )
    ).rows[0].id;

    return {
      tenantId,
      adminId,
      roles: { ceo: ceo.id, salesManager: salesManager.id, salesRep: salesRep.id },
      profiles: { admin: adminProfile, sales: salesProfile },
    };
  });
}
