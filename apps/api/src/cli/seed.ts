/**
 * Crea il tenant dimostrativo "demo" con utenti e dati di esempio.
 *   npm run seed            -> crea il tenant se non esiste
 *   SEED_RESET=true npm run seed -> lo ricrea da zero
 */
import * as bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { loadConfig } from '../config';
import { migrate } from '../db/migrator';
import { computeLabel } from '../metadata/field-types';
import { STANDARD_MODULES } from '../metadata/standard-modules';
import { provisionTenant } from '../tenants/provisioning';

const SLUG = process.env.SEED_TENANT ?? 'demo';
const PASSWORD = process.env.SEED_PASSWORD ?? 'demo1234';

async function main() {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  await migrate(pool);

  const existing = await pool.query(`SELECT id FROM tenants WHERE slug = $1`, [SLUG]);
  if (existing.rowCount) {
    if (process.env.SEED_RESET !== 'true') {
      console.log(`Il tenant "${SLUG}" esiste già (usa SEED_RESET=true per ricrearlo).`);
      await pool.end();
      return;
    }
    await pool.query(`DELETE FROM tenants WHERE slug = $1`, [SLUG]);
  }

  const t = await provisionTenant(pool, {
    slug: SLUG,
    name: '3Gtrade Demo',
    admin: { email: 'admin@3gtrade.local', password: PASSWORD, firstName: 'Amministratore', lastName: 'Sistema' },
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [t.tenantId]);
    const hash = await bcrypt.hash(PASSWORD, 10);
    const user = async (email: string, first: string, last: string, roleId: string) =>
      (
        await client.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [t.tenantId, email, hash, first, last, roleId],
        )
      ).rows[0].id as string;
    const manager = await user('giulia.bianchi@3gtrade.local', 'Giulia', 'Bianchi', t.roles.salesManager);
    const rep1 = await user('marco.rossi@3gtrade.local', 'Marco', 'Rossi', t.roles.salesRep);
    const rep2 = await user('luca.verdi@3gtrade.local', 'Luca', 'Verdi', t.roles.salesRep);

    const labelFields = Object.fromEntries(STANDARD_MODULES.map((m) => [m.name, m.labelFields]));
    const rec = async (module: string, owner: string, data: Record<string, unknown>) => {
      const id: string = (
        await client.query(
          `INSERT INTO records (tenant_id, module, label, owner_id, data, created_by)
           VALUES ($1, $2, $3, $4, $5, $4) RETURNING id`,
          [t.tenantId, module, computeLabel(labelFields[module], data), owner, JSON.stringify(data)],
        )
      ).rows[0].id;
      await client.query(
        `INSERT INTO record_history (tenant_id, record_id, user_id, action, changes) VALUES ($1, $2, $3, 'create', $4)`,
        [t.tenantId, id, owner, JSON.stringify(data)],
      );
      return id;
    };

    const acc1 = await rec('Accounts', rep1, {
      name: 'Officine Meccaniche Lombarde S.r.l.',
      account_type: 'Cliente',
      industry: 'Manifattura',
      vat_number: '01234567890',
      phone: '+39 02 1234567',
      email: 'info@oml.example',
      billing_city: 'Milano',
      billing_province: 'MI',
      billing_country: 'Italia',
      employees: 85,
      annual_revenue: 12500000,
    });
    const acc2 = await rec('Accounts', rep2, {
      name: 'Solare Adriatico S.p.A.',
      account_type: 'Prospect',
      industry: 'Energia',
      phone: '+39 071 765432',
      billing_city: 'Ancona',
      billing_province: 'AN',
      billing_country: 'Italia',
    });
    const acc3 = await rec('Accounts', manager, {
      name: 'Logistica Tirrenica S.r.l.',
      account_type: 'Partner',
      industry: 'Trasporti',
      billing_city: 'Livorno',
      billing_province: 'LI',
      billing_country: 'Italia',
    });

    const c1 = await rec('Contacts', rep1, {
      salutation: 'Ing.',
      first_name: 'Paolo',
      last_name: 'Ferri',
      account_id: acc1,
      job_title: 'Direttore tecnico',
      email: 'paolo.ferri@oml.example',
      phone: '+39 02 1234568',
    });
    await rec('Contacts', rep1, { first_name: 'Sara', last_name: 'Colombo', account_id: acc1, job_title: 'Acquisti' });
    const c3 = await rec('Contacts', rep2, {
      salutation: 'Dott.ssa',
      first_name: 'Elena',
      last_name: 'Marchetti',
      account_id: acc2,
      email: 'e.marchetti@solareadriatico.example',
    });
    await rec('Contacts', manager, { first_name: 'Andrea', last_name: 'Neri', account_id: acc3 });

    const opp1 = await rec('Opportunities', rep1, {
      name: 'Fornitura linea di assemblaggio',
      account_id: acc1,
      contact_id: c1,
      amount: 180000,
      close_date: '2027-02-28',
      sales_stage: 'Proposta',
      probability: 60,
      lead_source: 'Fiera',
    });
    await rec('Opportunities', rep1, {
      name: 'Contratto manutenzione 2027',
      account_id: acc1,
      amount: 24000,
      close_date: '2026-12-20',
      sales_stage: 'Negoziazione',
      probability: 80,
    });
    await rec('Opportunities', rep2, {
      name: 'Impianto fotovoltaico 500 kW',
      account_id: acc2,
      contact_id: c3,
      amount: 420000,
      close_date: '2027-04-15',
      sales_stage: 'Qualificazione',
      probability: 30,
      lead_source: 'Sito web',
    });

    // attività attorno alla data odierna, così calendario e panoramica mostrano qualcosa
    const at = (days: number, hour: number, minute = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setHours(hour, minute, 0, 0);
      return d.toISOString();
    };
    const act = (owner: string, data: Record<string, unknown>) =>
      rec('Activities', owner, { status: 'Pianificata', priority: 'Media', ...data });
    await act(rep1, {
      subject: 'Inviare offerta aggiornata',
      activity_type: 'Compito',
      priority: 'Alta',
      start: at(-1, 17),
      account_id: acc1,
      opportunity_id: opp1,
    });
    await act(rep1, {
      subject: 'Chiamata con Ing. Ferri',
      activity_type: 'Chiamata',
      start: at(0, 10),
      end: at(0, 10, 30),
      account_id: acc1,
      contact_id: c1,
    });
    await act(rep1, {
      subject: 'Visita in stabilimento',
      activity_type: 'Appuntamento',
      start: at(2, 9, 30),
      end: at(2, 12),
      location: 'Milano',
      account_id: acc1,
      opportunity_id: opp1,
    });
    await act(rep1, {
      subject: 'Follow-up contratto manutenzione',
      activity_type: 'Email',
      start: at(4, 11),
      account_id: acc1,
    });
    await act(rep1, {
      subject: 'Riunione kick-off',
      activity_type: 'Appuntamento',
      status: 'Completata',
      start: at(-6, 14),
      end: at(-6, 15),
      account_id: acc1,
    });
    await act(rep2, {
      subject: 'Sopralluogo impianto',
      activity_type: 'Appuntamento',
      start: at(1, 15),
      end: at(1, 17),
      location: 'Ancona',
      account_id: acc2,
      contact_id: c3,
    });
    await act(manager, {
      subject: 'Revisione pipeline con il team',
      activity_type: 'Appuntamento',
      start: at(3, 9),
      end: at(3, 10),
    });
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  console.log(`Tenant "${SLUG}" creato. Accessi (password: ${PASSWORD}):`);
  console.log('  admin@3gtrade.local        amministratore');
  console.log('  giulia.bianchi@3gtrade.local  responsabile vendite');
  console.log('  marco.rossi@3gtrade.local     commerciale');
  console.log('  luca.verdi@3gtrade.local      commerciale');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
