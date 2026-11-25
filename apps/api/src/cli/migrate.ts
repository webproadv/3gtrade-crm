import { Pool } from 'pg';
import { loadConfig } from '../config';
import { migrate } from '../db/migrator';
import { ensureStandardModules } from '../tenants/provisioning';

async function main() {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const applied = await migrate(pool, console.log);
  console.log(applied.length ? `${applied.length} migrazioni applicate` : 'Database già aggiornato');
  for (const a of await ensureStandardModules(pool)) console.log(`aggiunto ${a}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
