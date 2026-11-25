import { Pool } from 'pg';
import { loadConfig } from '../config';
import { migrate } from '../db/migrator';

async function main() {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const applied = await migrate(pool, console.log);
  console.log(applied.length ? `${applied.length} migrazioni applicate` : 'Database già aggiornato');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
