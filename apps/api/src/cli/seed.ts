/**
 * Crea il tenant dimostrativo "demo" con utenti e dati di esempio.
 *   npm run seed                  -> crea il tenant se non esiste
 *   SEED_RESET=true npm run seed  -> lo ricrea da zero
 */
import { Pool } from 'pg';
import { loadConfig } from '../config';
import { migrate } from '../db/migrator';
import { DEMO_USERS, seedDemo } from '../tenants/demo';
import { ensureStandardModules } from '../tenants/provisioning';

async function main() {
  const slug = process.env.SEED_TENANT ?? 'demo';
  const password = process.env.SEED_PASSWORD ?? 'demo1234';
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  await migrate(pool);
  await ensureStandardModules(pool);
  const created = await seedDemo(pool, { slug, password, reset: process.env.SEED_RESET === 'true' });
  if (!created) {
    console.log(`Il tenant "${slug}" esiste già (usa SEED_RESET=true per ricrearlo).`);
  } else {
    console.log(`Tenant "${slug}" creato. Accessi (password: ${password}):`);
    for (const [email, role] of DEMO_USERS) console.log(`  ${email.padEnd(32)} ${role}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
