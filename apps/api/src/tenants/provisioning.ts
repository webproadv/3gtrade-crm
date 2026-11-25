import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { STANDARD_MODULES, StandardModule } from '../metadata/standard-modules';
import { Tx } from '../db/database.service';
import { DEFAULT_REPORTS } from '../reports/default-reports';

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
/** Rapporti di esempio condivisi, di proprietà dell'amministratore indicato. */
async function insertDefaultReports(tx: Tx, tenantId: string, ownerId: string) {
  for (const r of DEFAULT_REPORTS) {
    await tx.query(
      `INSERT INTO reports (tenant_id, name, description, module, config, shared, owner_id)
       VALUES ($1, $2, $3, $4, $5, true, $6)`,
      [tenantId, r.name, r.description, r.module, JSON.stringify(r.config), ownerId],
    );
  }
  await tx.query(`UPDATE tenants SET default_reports_at = now() WHERE id = $1`, [tenantId]);
}

export async function ensureStandardModules(pool: Pool): Promise<string[]> {
  const added: string[] = [];
  const tenants = (
    await pool.query<{ id: string; slug: string; default_reports_at: Date | null }>(
      `SELECT id, slug, default_reports_at FROM tenants`,
    )
  ).rows;
  for (const t of tenants) {
    await inTenant(pool, t.id, async (tx) => {
      // aziende create prima dei rapporti: ricevono una sola volta i rapporti di esempio
      if (!t.default_reports_at) {
        const admin = (
          await tx.query(`SELECT id FROM users WHERE is_admin AND active ORDER BY created_at LIMIT 1`)
        ).rows[0];
        if (admin) {
          await insertDefaultReports(tx, t.id, admin.id);
          added.push(`${t.slug}: rapporti di esempio`);
        }
      }
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

    await insertDefaultReports(tx, tenantId, adminId);

    return {
      tenantId,
      adminId,
      roles: { ceo: ceo.id, salesManager: salesManager.id, salesRep: salesRep.id },
      profiles: { admin: adminProfile, sales: salesProfile },
    };
  });
}

/**
 * Crea l'azienda iniziale dalle variabili d'ambiente se non esiste ancora:
 * INIT_TENANT_SLUG, INIT_TENANT_NAME, INIT_ADMIN_EMAIL, INIT_ADMIN_PASSWORD
 * (facoltativi INIT_ADMIN_FIRST_NAME, INIT_ADMIN_LAST_NAME).
 * Restituisce lo slug creato, oppure null se non c'era nulla da fare.
 */
export async function provisionFromEnv(pool: Pool, env: NodeJS.ProcessEnv): Promise<string | null> {
  const slug = env.INIT_TENANT_SLUG?.trim().toLowerCase();
  if (!slug) return null;
  const email = env.INIT_ADMIN_EMAIL?.trim();
  const password = env.INIT_ADMIN_PASSWORD ?? '';
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) throw new Error('INIT_TENANT_SLUG: solo lettere minuscole, numeri e trattini');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INIT_ADMIN_EMAIL mancante o non valida');
  if (password.length < 10) throw new Error('INIT_ADMIN_PASSWORD deve avere almeno 10 caratteri');
  const exists = await pool.query(`SELECT 1 FROM tenants WHERE slug = $1`, [slug]);
  if (exists.rowCount) return null;
  await provisionTenant(pool, {
    slug,
    name: env.INIT_TENANT_NAME?.trim() || slug,
    admin: {
      email,
      password,
      firstName: env.INIT_ADMIN_FIRST_NAME ?? 'Amministratore',
      lastName: env.INIT_ADMIN_LAST_NAME ?? '',
    },
  });
  return slug;
}
