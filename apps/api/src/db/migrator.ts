import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

export const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

/**
 * I superuser e i ruoli BYPASSRLS ignorano la Row Level Security: in quel caso
 * l'isolamento tra tenant non è garantito.
 */
export async function assertRlsEnforced(pool: Pool, strict: boolean, log: (msg: string) => void) {
  const r = await pool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`);
  const { rolsuper, rolbypassrls } = r.rows[0] ?? {};
  if (rolsuper || rolbypassrls) {
    const msg =
      'L\'utente del database è superuser o BYPASSRLS: la Row Level Security non si applica e i tenant non sono isolati.';
    if (strict) throw new Error(msg);
    log(`ATTENZIONE: ${msg}`);
  }
}

/** Applica in ordine i file .sql non ancora eseguiti. */
export async function migrate(pool: Pool, log: (msg: string) => void = () => undefined): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`SELECT pg_advisory_lock(424242)`);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migrazione ${file} fallita: ${(err as Error).message}`);
      }
      applied.push(file);
      log(`applicata ${file}`);
    }
  } finally {
    await client.query(`SELECT pg_advisory_unlock(424242)`).catch(() => undefined);
    client.release();
  }
  return applied;
}
